import pg from 'pg';
import "dotenv/config";
import { rating, rate, ordinal } from 'openskill';


const { Client } = pg;



const K_FACTOR = 32;
const BASE_ELO = 1200;


const dbConfig = {
  connectionString: process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false,
  },
};



// --- MAIN SCRIPT ---

async function runOpenSkillBackdate() {
console.log("connecting with " + dbConfig.connectionString);
  const pool = new pg.Pool(dbConfig);
  

const client =  await pool.connect();


   const playerRatingMap = new Map();

   try {
    console.log('Connected to database...');

    // 1. Create the new history table (if it doesn't exist)
    //    This table is DIFFERENT from the Elo one.
    await client.query(`
      CREATE TABLE IF NOT EXISTS player_skill_history (
        history_id SERIAL PRIMARY KEY,
        player_id INT NOT NULL REFERENCES players(player_id),
        game_id INT NOT NULL REFERENCES games(game_id),
        mu_after_game FLOAT NOT NULL,
        sigma_after_game FLOAT NOT NULL,
        ordinal_rating_after_game FLOAT NOT NULL,
        UNIQUE(player_id, game_id) -- A player can only have one entry per game
      );
    `);
    console.log('Ensured player_skill_history table exists.');

    // 2. Clear the history table for a fresh calculation
    await client.query('TRUNCATE TABLE player_skill_history RESTART IDENTITY;');
    console.log('Cleared old history for recalculation.');

    // 3. Initialize Skill for all players
    const playersRes = await client.query('SELECT player_id FROM players');
    for (const player of playersRes.rows) {
      playerRatingMap.set(player.player_id, rating()); // Use default rating
    }
    console.log(`Initialized ${playerRatingMap.size} players with default OpenSkill rating.`);

    // 4. Fetch all games in chronological order
    const gamesRes = await client.query('SELECT * FROM games ORDER BY game_date ASC, game_id ASC');
    console.log(`Found ${gamesRes.rows.length} games to process...`);

    // Use a transaction for fast inserts
    await client.query('BEGIN');

    // 5. Loop through each game and process it
    for (const game of gamesRes.rows) {
      const { game_id, team1_score, team2_score } = game;

      // A. Get the two team IDs for this game
      const teamsRes = await client.query(
        'SELECT team_id FROM teams WHERE game_id = $1 ORDER BY team_id ASC',
        [game_id]
      );
      
      if (teamsRes.rows.length !== 2) {
        console.warn(`Skipping game ${game_id}: does not have exactly 2 teams.`);
        continue;
      }
      
      const team1Id = teamsRes.rows[0].team_id;
      const team2Id = teamsRes.rows[1].team_id;

      // B. Get the rosters (player_ids) for each team
      const team1RosterRes = await client.query('SELECT player_id FROM team_members WHERE team_id = $1', [team1Id]);
      // --- BUG FIX IS HERE ---
      // The query below was using [team1Id] instead of [team2Id]
      const team2RosterRes = await client.query('SELECT player_id FROM team_members WHERE team_id = $1', [team2Id]);

      const team1PlayerIds = team1RosterRes.rows.map(r => r.player_id);
      const team2PlayerIds = team2RosterRes.rows.map(r => r.player_id);

      if (team1PlayerIds.length === 0 || team2PlayerIds.length === 0) {
        console.warn(`Skipping game ${game_id}: one team has no players.`);
        continue;
      }

      // C. Get the *current* rating objects for each player
      const team1Ratings = team1PlayerIds.map(pid => {
        if (!playerRatingMap.has(pid)) {
          // Handle players added mid-season
          playerRatingMap.set(pid, rating());
        }
        return playerRatingMap.get(pid);
      });
      
      const team2Ratings = team2PlayerIds.map(pid => {
        if (!playerRatingMap.has(pid)) {
          playerRatingMap.set(pid, rating());
        }
        return playerRatingMap.get(pid);
      });

      // D. Calculate new ratings using OpenSkill!
      //    --- THIS IS THE FIX ---
      //    The ratings were inverted, which means the 'score' parameter
      //    assumes a HIGHER score is better (like goals scored).
      //    We will pass the scores directly, NOT as 'goals conceded'.
      
      /* DELETED THIS BLOCK
      let teamRanks;
      if (team1_score > team2_score) {
        teamRanks = [1, 2]; // Team 1 wins
      } else if (team1_score < team2_score) {
        teamRanks = [2, 1]; // Team 2 wins
      } else {
        teamRanks = [1, 1]; // Draw
      }
      */

      const [newTeam1Ratings, newTeam2Ratings] = rate(
        [team1Ratings, team2Ratings],
        // A 5-3 win (team1_score=5, team2_score=3) is passed as score: [5, 3]
        // The system will see 5 > 3 and rank Team 1 higher.
        // This should fix the inversion.
        { score: [team1_score, team2_score] } 
      );

      // E. Apply changes and insert into history
      const historyInsertPromises = [];

      // Team 1
      team1PlayerIds.forEach((pid, index) => {
        const newRating = newTeam1Ratings[index];
        const displayRating = ordinal(newRating);
        
        playerRatingMap.set(pid, newRating); // Update in-memory map

        historyInsertPromises.push(client.query(
          `INSERT INTO player_skill_history (player_id, game_id, mu_after_game, sigma_after_game, ordinal_rating_after_game)
           VALUES ($1, $2, $3, $4, $5)`,
          [pid, game_id, newRating.mu, newRating.sigma, displayRating]
        ));
      });
      
      // Team 2
      team2PlayerIds.forEach((pid, index) => {
        const newRating = newTeam2Ratings[index];
        const displayRating = ordinal(newRating);
        
        playerRatingMap.set(pid, newRating); // Update in-memory map

        historyInsertPromises.push(client.query(
          `INSERT INTO player_skill_history (player_id, game_id, mu_after_game, sigma_after_game, ordinal_rating_after_game)
           VALUES ($1, $2, $3, $4, $5)`,
          [pid, game_id, newRating.mu, newRating.sigma, displayRating]
        ));
      });

      // Wait for all inserts for this game to complete
      await Promise.all(historyInsertPromises);
    }
    
    // All games processed, commit the transaction
    await client.query('COMMIT');
    console.log('--- OPEN SKILL CALCULATION COMPLETE ---');
    console.log('All game history has been saved to player_skill_history.');

  } catch (err) {
    // Roll back on error
    await client.query('ROLLBACK');
    console.error('Error during OpenSkill calculation:', err);
  } finally {
    if (client) {
      client.release(); // Return the client to the pool
      console.log('Client released back to pool.');
    }
    await pool.end(); // Close all connections in the pool
    console.log('Database connection pool closed.');
  }

}
// Run the script
runOpenSkillBackdate();