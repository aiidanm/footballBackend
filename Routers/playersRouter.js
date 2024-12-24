// routes/PlayerRoutes.js
const express = require("express");
const router = express.Router();

module.exports = (client) => {
  router.get("/", async (req, res) => {
    try {
      const result = await client.query(`SELECT
    p.player_id,
    p.player_name,
    SUM(COALESCE(pgs.goals_scored, 0)) AS total_goals_scored,
    SUM(COALESCE(pgs.kicked_over_fence, 0)) AS total_kicked_over_fence
FROM
    players p
LEFT JOIN
    player_game_stats pgs ON p.player_id = pgs.player_id
GROUP BY
    p.player_id, p.player_name
ORDER BY
    p.player_id;`);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching players", err.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get(`/:id`, async (req, res) => {
    const playerId = parseInt(req.params.id, 10);
    if (isNaN(playerId)) {
      return res.status(400).json({ error: "error: invalid player id" });
    }

    try {
      const playerResult = await client.query(
        `SELECT * FROM players WHERE player_id = $1`,
        [playerId]
      );
      if (playerResult.rows.length === 0) {
        return res.status(404).json({ error: "player not found" });
      }

      const player = playerResult.rows[0];
      const statsResult = await client.query(
        `SELECT * FROM player_game_stats WHERE player_id = $1`,
        [playerId]
      );
      const stats = statsResult.rows;

      const responseData = {
        ...player,
        stats,
      };

      res.json(responseData);
    } catch (err) {
      console.error("error fetching player details", err.stack);
      res.status(500).json({ error: "Internal Server Error 500" });
    }
  });

  // Add a new player
  router.post("/", async (req, res) => {
    const { name, preferred_position } = req.body;
    try {
      const result = await client.query(
        "INSERT INTO players (player_name, preferred_position) VALUES ($1, $2) RETURNING *",
        [name, preferred_position]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error adding player", err.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update a player by ID
  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
      name,
      preferred_position,
      goals,
      assists,
      games_played,
      over_fence,
      wins,
    } = req.body;
    try {
      const result = await client.query(
        "UPDATE players SET name = $1, preferred_position = $2, goals = $3, assists = $4, games_played = $5, over_fence = $6, wins = $7 WHERE id = $8 RETURNING *",
        [
          name,
          preferred_position,
          goals,
          assists,
          games_played,
          over_fence,
          wins,
          id,
        ]
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error("Error updating player", err.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};
