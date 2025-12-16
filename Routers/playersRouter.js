// routes/PlayerRoutes.js
import express from "express";
const router = express.Router();

const PlayerRoutes = (client) => {
    router.get("/", async (req, res) => {
      try {
        const result = await client.query(`
            SELECT
  p.player_id,
  p.player_name,
  p.preferred_position,
  
  -- This is the correlated subquery for 10-game form.
  (
    SELECT STRING_AGG(result, '' ORDER BY game_date ASC, game_id ASC)
    FROM (
      -- This inner query finds the 10 most recent results
      -- for the *current* player (p.player_id)
      SELECT
        g_inner.game_date,
        g_inner.game_id,
        CASE
          -- Player was on Team 1 (which we assume has the MIN team_id)
          WHEN t_inner.team_id = gt_inner.team1_id AND g_inner.team1_score > g_inner.team2_score THEN 'W'
          WHEN t_inner.team_id = gt_inner.team1_id AND g_inner.team1_score < g_inner.team2_score THEN 'L'
          -- Player was on Team 2 (which we assume has the MAX team_id)
          WHEN t_inner.team_id = gt_inner.team2_id AND g_inner.team2_score > g_inner.team1_score THEN 'W'
          WHEN t_inner.team_id = gt_inner.team2_id AND g_inner.team2_score < g_inner.team1_score THEN 'L'
          -- It was a draw
          WHEN g_inner.team1_score = g_inner.team2_score THEN 'D'
        END AS result
      FROM
        team_members tm_inner
      JOIN
        teams t_inner ON tm_inner.team_id = t_inner.team_id
      JOIN
        games g_inner ON t_inner.game_id = g_inner.game_id
      JOIN
        -- This subquery finds the "team1" and "team2" IDs
        (
          SELECT
            game_id,
            MIN(team_id) AS team1_id,
            MAX(team_id) AS team2_id
          FROM teams
          GROUP BY game_id
        ) AS gt_inner ON g_inner.game_id = gt_inner.game_id
      WHERE
        tm_inner.player_id = p.player_id -- <-- This is the correlation link
      ORDER BY
        g_inner.game_date DESC, g_inner.game_id DESC
      LIMIT 10
    ) AS RecentGames
  ) AS form,
  
  -- NEW: Aggregate Stats
  COALESCE(SUM(pgs.goals_scored), 0) AS total_goals_scored,
  COALESCE(SUM(pgs.kicked_over_fence), 0) AS total_kicked_over_fence,
  COUNT(DISTINCT t.game_id) AS games_played,
  
  -- NEW: Total Wins
  COALESCE(SUM(CASE
      -- Player was on Team 1 (min team_id) and won
      WHEN tm.team_id = gt.team1_id AND g.team1_score > g.team2_score THEN 1
      -- Player was on Team 2 (max team_id) and won
      WHEN tm.team_id = gt.team2_id AND g.team2_score > g.team1_score THEN 1
      ELSE 0
  END), 0) AS total_wins,

  -- NEW: Total Losses
  COALESCE(SUM(CASE
      -- Player was on Team 1 (min team_id) and lost
      WHEN tm.team_id = gt.team1_id AND g.team1_score < g.team2_score THEN 1
      -- Player was on Team 2 (max team_id) and lost
      WHEN tm.team_id = gt.team2_id AND g.team2_score < g.team1_score THEN 1
      ELSE 0
  END), 0) AS total_losses,

  -- NEW: Total Draws
  COALESCE(SUM(CASE
      WHEN g.team1_score = g.team2_score THEN 1
      ELSE 0
  END), 0) AS total_draws
  
FROM
  players p -- 'p' is the outer player table

-- NEW: Joins for aggregation
LEFT JOIN
  team_members tm ON p.player_id = tm.player_id
LEFT JOIN
  teams t ON tm.team_id = t.team_id
LEFT JOIN
  games g ON t.game_id = g.game_id
LEFT JOIN
  player_game_stats pgs ON p.player_id = pgs.player_id AND g.game_id = pgs.game_id
LEFT JOIN (
  -- This subquery is now used by the main query *and* the subquery
  SELECT
    game_id,
    MIN(team_id) AS team1_id,
    MAX(team_id) AS team2_id
  FROM teams
  GROUP BY game_id
) AS gt ON g.game_id = gt.game_id

GROUP BY
  p.player_id, p.player_name, p.preferred_position
          
          `)

        
        res.json(result.rows);
      } catch (err) {
        console.error("Error fetching players", err.stack);
        res.status(500).json({ error: "Internal server error" });
      }
    });

//   router.get("/", async (req, res) => {
//     try {
//       const result = await client.query(`SELECT
//     p.player_id,
//     p.player_name,
//     COALESCE(SUM(pgd.goals_scored), 0) AS total_goals_scored,
//     COALESCE(SUM(pgd.kicked_over_fence), 0) AS total_kicked_over_fence,
//     COALESCE(SUM(pgd.is_winning_team), 0) AS total_wins,
//     COALESCE(COUNT(DISTINCT pgd.game_id), 0) AS games_played
// FROM
//     players p
// LEFT JOIN (
//     SELECT
//         p.player_id,
//         g.game_id,
//         COALESCE(pgs.goals_scored, 0) AS goals_scored,
//         COALESCE(pgs.kicked_over_fence, 0) AS kicked_over_fence,
//         CASE
//             WHEN (g.team1_score > g.team2_score AND tm.team_id = (SELECT team_id FROM teams WHERE game_id = g.game_id LIMIT 1)) OR
//                  (g.team2_score > g.team1_score AND tm.team_id = (SELECT team_id FROM teams WHERE game_id = g.game_id ORDER BY team_id DESC LIMIT 1)) THEN 1
//             ELSE 0
//         END AS is_winning_team
//     FROM
//         players p
//     LEFT JOIN
//         team_members tm ON p.player_id = tm.player_id
//     LEFT JOIN
//         teams t ON tm.team_id = t.team_id
//     LEFT JOIN
//         games g ON t.game_id = g.game_id
//     LEFT JOIN
//         player_game_stats pgs ON p.player_id = pgs.player_id AND g.game_id = pgs.game_id
// ) pgd ON p.player_id = pgd.player_id
// GROUP BY
//     p.player_id,
//     p.player_name;
// `);
//       res.json(result.rows);
//     } catch (err) {
//       console.error("Error fetching players", err.stack);
//       res.status(500).json({ error: "Internal server error" });
//     }
//   });

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
        `SELECT * FROM
    players p
LEFT JOIN (
    SELECT
        p.player_id,
        g.game_id,
        g.game_date,
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
WHERE 
  p.player_id = $1;`,
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
    const players = req.body
    if(!Array.isArray(players)){
      return res.status(500).json({error: "array not provided"})
    }

    try {
      const placeholders = players.map((player, index) => `($${index * 2 + 1}, $${index * 2 + 2})`).join(', ')
      const values = players.flatMap(p => [p.name, p.preferred_position])
      const query = `
      INSERT INTO players (player_name, preferred_position) 
      VALUES ${placeholders} 
      RETURNING *
    `;
      const result = await client.query(query, values)
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

export default PlayerRoutes