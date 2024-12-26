// routes/GameRoutes.js
const express = require("express");
const router = express.Router();

module.exports = (client) => {
  router.get("/:id", async (req, res) => {
    const { id } = req.params;
    const gameId = parseInt(id, 10);

    if (isNaN(gameId)) {
      return res.status(400).json({ error: "Invalid game ID" });
    }

    try {
      const gameResult = await client.query(
        `
        SELECT game_id, game_date, team1_score, team2_score
        FROM games
        WHERE game_id = $1
      `,
        [gameId]
      );

      if (gameResult.rows.length === 0) {
        return res.status(404).json({ error: "Game not found" });
      }

      const gameInfo = gameResult.rows[0];

      const teamPlayersResult = await client.query(
        `
        SELECT teams.team_id,
               players.player_id, players.player_name,
               COALESCE(player_game_stats.goals_scored, 0) AS goals_scored,
               COALESCE(player_game_stats.kicked_over_fence, 0) AS kicked_over_fence
        FROM teams
        JOIN team_members ON teams.team_id = team_members.team_id
        JOIN players ON team_members.player_id = players.player_id
        LEFT JOIN player_game_stats ON player_game_stats.game_id = teams.game_id
                                    AND player_game_stats.player_id = players.player_id
        WHERE teams.game_id = $1
        ORDER BY teams.team_id, players.player_name;
      `,
        [gameId]
      );

      const teamsMap = {};
      for (const row of teamPlayersResult.rows) {
        const {
          team_id,
          player_id,
          player_name,
          goals_scored,
          kicked_over_fence,
        } = row;

        if (!teamsMap[team_id]) {
          teamsMap[team_id] = {
            team_id,
            players: [],
          };
        }

        teamsMap[team_id].players.push({
          player_id,
          player_name,
          goals_scored,
          kicked_over_fence,
        });
      }

      const teamsArray = Object.values(teamsMap);

      const responseData = {
        game_id: gameInfo.game_id,
        game_date: gameInfo.game_date,
        team1_score: gameInfo.team1_score,
        team2_score: gameInfo.team2_score,
        teams: teamsArray,
      };

      res.json(responseData);
    } catch (err) {
      console.error("Error fetching game details:", err.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/", async (req, res) => {
    console.log(req.body)
    const { date, team1Score, team2Score, teams } = req.body;
    // teams is expected to be { team1: [...], team2: [...] }
  
    try {
      // 1. Insert a new game and get the new game_id
      const gameResult = await client.query(
        `INSERT INTO games (game_date, team1_score, team2_score)
         VALUES ($1, $2, $3) 
         RETURNING game_id;`,
        [date, team1Score, team2Score]
      );
      const gameId = gameResult.rows[0].game_id;
  
      // 2. Insert two teams into the teams table (one for each side of the game)
      //    Return the team_id for each insertion
      const team1Result = await client.query(
        `INSERT INTO teams (game_id)
         VALUES ($1)
         RETURNING team_id;`,
        [gameId]
      );
      const team1Id = team1Result.rows[0].team_id;
  
      const team2Result = await client.query(
        `INSERT INTO teams (game_id)
         VALUES ($1)
         RETURNING team_id;`,
        [gameId]
      );
      const team2Id = team2Result.rows[0].team_id;
  
      // 3. Insert each player for team1 into team_members and their stats into player_game_stats
      for (const player of teams.team1) {
        const { player_id, goals_scored, kicked_over_fence } = player;
  
        // Insert player into team_members
        await client.query(
          `INSERT INTO team_members (team_id, player_id)
           VALUES ($1, $2);`,
          [team1Id, player_id]
        );
  
        // Insert player stats into player_game_stats
        await client.query(
          `INSERT INTO player_game_stats (game_id, player_id, goals_scored, kicked_over_fence)
           VALUES ($1, $2, $3, $4);`,
          [gameId, player_id, goals_scored || 0, kicked_over_fence || 0]
        );
      }
  
      // 4. Same for team2
      for (const player of teams.team2) {
        const { player_id, goals_scored, kicked_over_fence } = player;
  
        // Insert player into team_members
        await client.query(
          `INSERT INTO team_members (team_id, player_id)
           VALUES ($1, $2);`,
          [team2Id, player_id]
        );
  
        // Insert player stats into player_game_stats
        await client.query(
          `INSERT INTO player_game_stats (game_id, player_id, goals_scored, kicked_over_fence)
           VALUES ($1, $2, $3, $4);`,
          [gameId, player_id, goals_scored || 0, kicked_over_fence || 0]
        );
      }
  
      res.json({ message: "Game recorded successfully", gameId });
    } catch (err) {
      console.error("Error recording game:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  router.get("/", async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    try {
      const result = await client.query(
        `
        SELECT
          g.game_id,
          g.game_date,
          g.team1_score,
          g.team2_score,
          t.team_id,
          p.player_id,
          p.player_name,
          COALESCE(pgs.goals_scored, 0) AS goals_scored,
          COALESCE(pgs.kicked_over_fence, 0) AS kicked_over_fence
        FROM games AS g
        JOIN teams AS t
          ON g.game_id = t.game_id
        JOIN team_members AS tm
          ON t.team_id = tm.team_id
        JOIN players AS p
          ON tm.player_id = p.player_id
        LEFT JOIN player_game_stats AS pgs
          ON pgs.game_id = g.game_id AND pgs.player_id = p.player_id
        ORDER BY
          g.game_id,
          t.team_id,
          p.player_name
        LIMIT $1;
      `,
        [limit]
      );

      const games = {};
      result.rows.forEach((row) => {
        const {
          game_id,
          game_date,
          team1_score,
          team2_score,
          team_id,
          player_id,
          player_name,
          goals_scored,
          kicked_over_fence,
        } = row;

        //creates the game object if it doesnt already exist for the id
        if (!games[game_id]) {
          games[game_id] = {
            game_id,
            game_date,
            team1_score,
            team2_score,
            teams: {},
          };
        }

        //if the games teams array doesnt include the current iterated teams id, it creates it and adds the players
        if (!games[game_id].teams[team_id]) {
          games[game_id].teams[team_id] = [];
        }

        games[game_id].teams[team_id].push({
          player_id,
          player_name,
          goals_scored,
          kicked_over_fence,
        });
      });

      res.json(Object.values(games));
    } catch (err) {
      console.error("Error fetching games", err);
      res.status(500).json({ error: err });
    }
  });
  return router;
};
