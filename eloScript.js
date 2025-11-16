import pg from 'pg';
import "dotenv/config";

const { Client } = pg;



const K_FACTOR = 32;
const BASE_ELO = 1200;


const dbConfig = {
  connectionString: process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false,
  },
};

// --- ELO CALCULATION LOGIC ---

/**
 * Calculates the expected win probability for player A.
 * @param {number} eloA - Elo rating of player/team A
 * @param {number} eloB - Elo rating of player/team B
 * @returns {number} - The expected win probability for A (0 to 1)
 */
function getExpectedScore(eloA, eloB) {
  return 1.0 / (1.0 + Math.pow(10, (eloB - eloA) / 400));
}

/**
 * Gets the "actual" score for Elo calculation (1 for win, 0 for loss, 0.5 for draw)
 * @param {number} scoreA - Team A's final score
 * @param {number} scoreB - Team B's final score
 * @returns {number} - 1, 0.5, or 0
 */
function getActualScore(scoreA, scoreB) {
  if (scoreA > scoreB) return 1.0;
  if (scoreA < scoreB) return 0.0;
  return 0.5;
}

/**
 * Calculates the average Elo of a list of players
 * @param {number[]} playerIds - Array of player_id
 * @param {Map<number, number>} eloMap - Map of player_id -> current Elo
 * @returns {number} - The average Elo for the team
 */
function getTeamAverageElo(playerIds, eloMap) {
  if (playerIds.length === 0) return BASE_ELO; // Should not happen, but safe
  
  const totalElo = playerIds.reduce((sum, pid) => {
    // Ensure every player is in the map (handles players added mid-season)
    if (!eloMap.has(pid)) {
      eloMap.set(pid, BASE_ELO);
    }
    return sum + eloMap.get(pid);
  }, 0);
  
  return totalElo / playerIds.length;
}


/**
 * NEW FUNCTION: Calculates a multiplier based on goal difference.
 * A 1-goal win is 1x, 2-goal is 1.5x, 3+ is 1.75x. Draws are 1x.
 * @param {number} scoreA - Team A's final score
 * @param {number} scoreB - Team B's final score
 * @returns {number} - The MoV multiplier
 */
function getMovMultiplier(scoreA, scoreB) {
  const goalDiff = Math.abs(scoreA - scoreB);

  if (goalDiff === 0) { // Draw
    return 1.0;
  }
  if (goalDiff === 2) { // 1-goal win
    return 1.0;
  }
  if (goalDiff === 3) { // 2-goal win
    return 1.5;
  }
  // 3+ goal win
  return 1.75;
}

// --- MAIN SCRIPT ---

async function runEloBackdate() {
console.log("connecting with " + dbConfig.connectionString);
  const pool = new pg.Pool(dbConfig);
  

const client =  await pool.connect();


  const playerEloMap = new Map();

  try {
    console.log('Connected to database...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS player_elo_history (
        history_id SERIAL PRIMARY KEY,
        player_id INT NOT NULL REFERENCES players(player_id),
        game_id INT NOT NULL REFERENCES games(game_id),
        elo_rating_after_game INT NOT NULL,
        elo_change INT NOT NULL,
        UNIQUE(player_id, game_id) -- A player can only have one entry per game
      );
    `);

    await client.query('TRUNCATE TABLE player_elo_history RESTART IDENTITY;');

    const playersRes = await client.query('SELECT player_id FROM players');
    for (const player of playersRes.rows) {
      playerEloMap.set(player.player_id, BASE_ELO);
    }
    console.log(`Initialized ${playerEloMap.size} players at ${BASE_ELO} Elo.`);

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
      
      // Our schema guarantees two teams per game
      if (teamsRes.rows.length !== 2) {
        console.warn(`Skipping game ${game_id}: does not have exactly 2 teams.`);
        continue;
      }
      
      const team1Id = teamsRes.rows[0].team_id;
      const team2Id = teamsRes.rows[1].team_id;

      // B. Get the rosters (player_ids) for each team
      const team1RosterRes = await client.query('SELECT player_id FROM team_members WHERE team_id = $1', [team1Id]);
      const team2RosterRes = await client.query('SELECT player_id FROM team_members WHERE team_id = $1', [team2Id]);

      const team1PlayerIds = team1RosterRes.rows.map(r => r.player_id);
      const team2PlayerIds = team2RosterRes.rows.map(r => r.player_id);

      if (team1PlayerIds.length === 0 || team2PlayerIds.length === 0) {
        console.warn(`Skipping game ${game_id}: one team has no players.`);
        continue;
      }

      // C. Calculate team average Elos from our in-memory map
      const team1AvgElo = getTeamAverageElo(team1PlayerIds, playerEloMap);
      const team2AvgElo = getTeamAverageElo(team2PlayerIds, playerEloMap);
      
      // D. Calculate expected and actual results
      const expectedT1 = getExpectedScore(team1AvgElo, team2AvgElo);
      const actualT1 = getActualScore(team1_score, team2_score);

      // E. Calculate the Elo change - NOW WITH MOV
const movMultiplier = getMovMultiplier(team1_score, team2_score);
const eloDelta = K_FACTOR * movMultiplier * (actualT1 - expectedT1);
const roundedDelta = Math.round(eloDelta);

      // F. Apply changes and insert into history
      const historyInsertPromises = [];

      // Team 1
      for (const pid of team1PlayerIds) {
        const currentElo = playerEloMap.get(pid);
        const newElo = currentElo + roundedDelta;
        playerEloMap.set(pid, newElo); // Update in-memory map

        historyInsertPromises.push(client.query(
          `INSERT INTO player_elo_history (player_id, game_id, elo_rating_after_game, elo_change)
           VALUES ($1, $2, $3, $4)`,
          [pid, game_id, newElo, roundedDelta]
        ));
      }
      
      // Team 2
      for (const pid of team2PlayerIds) {
        const currentElo = playerEloMap.get(pid);
        const newElo = currentElo - roundedDelta; // Note: minus
        playerEloMap.set(pid, newElo); // Update in-memory map

        historyInsertPromises.push(client.query(
          `INSERT INTO player_elo_history (player_id, game_id, elo_rating_after_game, elo_change)
           VALUES ($1, $2, $3, $4)`,
          [pid, game_id, newElo, -roundedDelta] // Note: -roundedDelta
        ));
      }

      // Wait for all inserts for this game to complete
      await Promise.all(historyInsertPromises);
    }
    
    // All games processed, commit the transaction
    await client.query('COMMIT');
    console.log('--- ELO CALCULATION COMPLETE ---');
    console.log('All game history has been saved to player_elo_history.');

  } catch (err) {
    // Roll back on error
    // await client.query('ROLLBACK');
    console.error('Error during Elo calculation:', err);
  } finally {
    // Release the client back to the pool
    client.release();
    pool.end();
    console.log('Database connection closed.');
  }
}


runEloBackdate();