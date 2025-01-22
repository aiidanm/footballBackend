// routes/PlayerRoutes.js
const express = require("express");
const router = express.Router();

module.exports = (client) => {
//   router.get("/", async (req, res) => {
//     try {
//       const result = await client.query(`SELECT
//     pgd.player_id,
//     pgd.player_name,
//     SUM(pgd.goals_scored) AS total_goals_scored,
//     SUM(pgd.kicked_over_fence) AS total_kicked_over_fence,
//     SUM(pgd.is_winning_team) AS total_wins,
//     COUNT(DISTINCT(pgd.game_id)) AS games_played
// FROM
//     (
//     SELECT
//         p.player_id,
//         p.player_name,
//         g.game_id,
//         g.game_date,
//         tm.team_id,
//         COALESCE(pgs.goals_scored, 0) AS goals_scored,
//         COALESCE(pgs.kicked_over_fence, 0) AS kicked_over_fence,
//         CASE
//             WHEN (g.team1_score > g.team2_score AND tm.team_id = (SELECT team_id FROM teams WHERE game_id = g.game_id LIMIT 1)) OR
//                  (g.team2_score > g.team1_score AND tm.team_id = (SELECT team_id FROM teams WHERE game_id = g.game_id ORDER BY team_id DESC LIMIT 1)) THEN 1
//             ELSE 0
//         END AS is_winning_team
//     FROM
//         players p
//     JOIN
//         team_members tm ON p.player_id = tm.player_id
//     JOIN
//         teams t ON tm.team_id = t.team_id
//     JOIN
//         games g ON t.game_id = g.game_id
//     LEFT JOIN
//         player_game_stats pgs ON p.player_id = pgs.player_id AND g.game_id = pgs.game_id
//   ) AS pgd
// GROUP BY
//     pgd.player_name,
//     pgd.player_id;
// `);
//       res.json(result.rows);
//     } catch (err) {
//       console.error("Error fetching players", err.stack);
//       res.status(500).json({ error: "Internal server error" });
//     }
//   });

router.get("/", async (req, res) => {
    try {
      const result = await client.query(`SELECT
    p.player_id,
    p.player_name,
    COALESCE(SUM(pgd.goals_scored), 0) AS total_goals_scored,
    COALESCE(SUM(pgd.kicked_over_fence), 0) AS total_kicked_over_fence,
    COALESCE(SUM(pgd.is_winning_team), 0) AS total_wins,
    COALESCE(COUNT(DISTINCT pgd.game_id), 0) AS games_played
FROM
    players p
LEFT JOIN (
    SELECT
        p.player_id,
        g.game_id,
        COALESCE(pgs.goals_scored, 0) AS goals_scored,
        COALESCE(pgs.kicked_over_fence, 0) AS kicked_over_fence,
        CASE
            WHEN (g.team1_score > g.team2_score AND tm.team_id = (SELECT team_id FROM teams WHERE game_id = g.game_id LIMIT 1)) OR
                 (g.team2_score > g.team1_score AND tm.team_id = (SELECT team_id FROM teams WHERE game_id = g.game_id ORDER BY team_id DESC LIMIT 1)) THEN 1
            ELSE 0
        END AS is_winning_team
    FROM
        players p
    LEFT JOIN
        team_members tm ON p.player_id = tm.player_id
    LEFT JOIN
        teams t ON tm.team_id = t.team_id
    LEFT JOIN
        games g ON t.game_id = g.game_id
    LEFT JOIN
        player_game_stats pgs ON p.player_id = pgs.player_id AND g.game_id = pgs.game_id
) pgd ON p.player_id = pgd.player_id
GROUP BY
    p.player_id,
    p.player_name;
`);
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
