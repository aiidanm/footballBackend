// routes/GameRoutes.js
import express from "express";
const router = express.Router();

const GamesRouter = (client) => {
  router.get("/:id", async (req, res) => {
    const { id } = req.params;
    const league_id = req.league_id;
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    const gameId = parseInt(id, 10);

    if (isNaN(gameId)) {
      return res.status(400).json({ error: "Invalid game ID" });
    }

    try {
      // Build query and params dynamically to avoid "g" alias errors
      let gameQuery = `
        SELECT game_id, game_date, team1_score, team2_score
        FROM games
        WHERE game_id = $1 AND league_id = $2
      `;
      const queryParams = [gameId, league_id];

      if (year) {
        queryParams.push(`${year}-01-01`, `${year + 1}-01-01`);
        gameQuery += ` AND game_date >= $3 AND game_date < $4`;
      }

      const gameResult = await client.query(gameQuery, queryParams);

      if (gameResult.rows.length === 0) {
        return res.status(404).json({ error: "Game not found within the specified criteria" });
      }

      const gameInfo = gameResult.rows[0];

      // Fetch players and stats
      const teamPlayersResult = await client.query(
        `
        SELECT t.team_id,
               p.player_id, p.player_name,
               COALESCE(pgs.goals_scored, 0) AS goals_scored,
               COALESCE(pgs.kicked_over_fence, 0) AS kicked_over_fence
        FROM teams t
        JOIN team_members tm ON t.team_id = tm.team_id
        JOIN players p ON tm.player_id = p.player_id
        LEFT JOIN player_game_stats pgs ON pgs.game_id = t.game_id
                                       AND pgs.player_id = p.player_id
        WHERE t.game_id = $1 AND t.league_id = $2
        ORDER BY t.team_id, p.player_name;
      `,
        [gameId, league_id]
      );

      const teamsMap = {};
      for (const row of teamPlayersResult.rows) {
        const { team_id, player_id, player_name, goals_scored, kicked_over_fence } = row;

        if (!teamsMap[team_id]) {
          teamsMap[team_id] = { team_id, players: [] };
        }

        teamsMap[team_id].players.push({
          player_id,
          player_name,
          goals_scored,
          kicked_over_fence,
        });
      }

      res.json({
        ...gameInfo,
        teams: Object.values(teamsMap),
      });
    } catch (err) {
      console.error("Error fetching game details:", err.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // 2. GET ALL GAMES (WITH FILTER)
  router.get("/", async (req, res) => {
    const league_id = req.league_id;
    const year = req.query.year ? parseInt(req.query.year, 10) : null;
    
    try {
      let queryText = `
        SELECT
          g.game_id, g.game_date, g.team1_score, g.team2_score,
          t.team_id, p.player_id, p.player_name,
          COALESCE(pgs.goals_scored, 0) AS goals_scored,
          COALESCE(pgs.kicked_over_fence, 0) AS kicked_over_fence
        FROM games AS g
        JOIN teams AS t ON g.game_id = t.game_id AND t.league_id = $1
        JOIN team_members AS tm ON t.team_id = tm.team_id AND tm.league_id = $1
        JOIN players AS p ON tm.player_id = p.player_id
        LEFT JOIN player_game_stats AS pgs ON pgs.game_id = g.game_id AND pgs.player_id = p.player_id
        WHERE g.league_id = $1
      `;

      const queryParams = [league_id];

      if (year) {
        queryParams.push(`${year}-01-01`, `${year + 1}-01-01`);
        queryText += ` AND g.game_date >= $2 AND g.game_date < $3`;
      }

      queryText += ` ORDER BY g.game_date DESC, g.game_id, t.team_id, p.player_name`;

      const result = await client.query(queryText, queryParams);

      const games = {};
      result.rows.forEach((row) => {
        const { game_id, game_date, team1_score, team2_score, team_id, player_id, player_name, goals_scored, kicked_over_fence } = row;

        if (!games[game_id]) {
          games[game_id] = {
            game_id,
            game_date,
            team1_score,
            team2_score,
            teams: {},
          };
        }

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

      // Flatten the internal teams object into an array for the final response
      const formattedResponse = Object.values(games).map(game => ({
        ...game,
        teams: Object.values(game.teams) 
      }));

      res.json(formattedResponse);
    } catch (err) {
      console.error("Error fetching games", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/", async (req, res) => {
    const { date, team1Score, team2Score, teams } = req.body;
    const league_id = req.league_id


    try {
      const gameResult = await client.query(
        `INSERT INTO games (game_date, team1_score, team2_score, league_id)
         VALUES ($1, $2, $3, $4) 
         RETURNING game_id;`,
        [date, team1Score, team2Score, league_id]
      );
      const gameId = gameResult.rows[0].game_id;

      const team1Result = await client.query(
        `INSERT INTO teams (game_id, league_id)
         VALUES ($1, $2)
         RETURNING team_id;`,
        [gameId, league_id]
      );
      const team1Id = team1Result.rows[0].team_id;

      const team2Result = await client.query(
        `INSERT INTO teams (game_id, league_id)
         VALUES ($1)
         RETURNING team_id;`,
        [gameId, league_id]
      );
      const team2Id = team2Result.rows[0].team_id;

      for (const player of teams.team1) {
        const { player_id, goals_scored, kicked_over_fence } = player;

        await client.query(
          `INSERT INTO team_members (team_id, player_id, league_id)
           VALUES ($1, $2, $3);`,
          [team1Id, player_id, league_id]
        );

        await client.query(
          `INSERT INTO player_game_stats (game_id, player_id, goals_scored, kicked_over_fence, league_id)
           VALUES ($1, $2, $3, $4, $5);`,
          [gameId, player_id, goals_scored || 0, kicked_over_fence || 0, league_id]
        );
      }

      for (const player of teams.team2) {
        const { player_id, goals_scored, kicked_over_fence } = player;

        await client.query(
          `INSERT INTO team_members (team_id, player_id, league_id)
           VALUES ($1, $2, $3);`,
          [team2Id, player_id, league_id]
        );

        await client.query(
          `INSERT INTO player_game_stats (game_id, player_id, goals_scored, kicked_over_fence, league_id)
           VALUES ($1, $2, $3, $4, $5);`,
          [gameId, player_id, goals_scored || 0, kicked_over_fence || 0, league_id]
        );
      }

      res.json({ message: "Game recorded successfully", gameId });
    } catch (err) {
      console.error("Error recording game:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  return router;
};

export default GamesRouter;
