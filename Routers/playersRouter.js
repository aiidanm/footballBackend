// routes/PlayerRoutes.js
import express from "express";
const router = express.Router();

const PlayerRoutes = (client) => {
  router.get("/", async (req, res) => {
    const league_id = req.league_id;
    const year = req.query.year ? parseInt(req.query.year, 10) : null;

    const queryParams = [league_id];
    let yearFilterSub = "";
    let yearFilterMain = "";

    // Safely handle the year filter parameters
    if (year) {
      queryParams.push(`${year}-01-01`, `${year + 1}-01-01`);
      yearFilterSub = `AND g_inner.game_date >= $2 AND g_inner.game_date < $3`;
      yearFilterMain = `AND g.game_date >= $2 AND g.game_date < $3`;
    }

    const query = `
      SELECT
        p.player_id,
        p.player_name,
        p.preferred_position,
        
        -- Form Subquery (Recent 10 games)
        (
          SELECT STRING_AGG(result, '' ORDER BY game_date ASC, game_id ASC)
          FROM (
            SELECT
              g_inner.game_date,
              g_inner.game_id,
              CASE
                WHEN t_inner.team_id = gt_inner.team1_id AND g_inner.team1_score > g_inner.team2_score THEN 'W'
                WHEN t_inner.team_id = gt_inner.team1_id AND g_inner.team1_score < g_inner.team2_score THEN 'L'
                WHEN t_inner.team_id = gt_inner.team2_id AND g_inner.team2_score > g_inner.team1_score THEN 'W'
                WHEN t_inner.team_id = gt_inner.team2_id AND g_inner.team2_score < g_inner.team1_score THEN 'L'
                WHEN g_inner.team1_score = g_inner.team2_score THEN 'D'
              END AS result
            FROM team_members tm_inner
            JOIN teams t_inner ON tm_inner.team_id = t_inner.team_id
            JOIN games g_inner ON t_inner.game_id = g_inner.game_id
            JOIN (
                SELECT game_id, MIN(team_id) AS team1_id, MAX(team_id) AS team2_id
                FROM teams WHERE league_id = $1 GROUP BY game_id
            ) AS gt_inner ON g_inner.game_id = gt_inner.game_id
            WHERE tm_inner.player_id = p.player_id
              AND tm_inner.league_id = $1
              ${yearFilterSub}
            ORDER BY g_inner.game_date DESC, g_inner.game_id DESC
            LIMIT 10
          ) AS RecentGames
        ) AS form,
        
        COALESCE(SUM(pgs.goals_scored), 0) AS total_goals_scored,
        COALESCE(SUM(pgs.kicked_over_fence), 0) AS total_kicked_over_fence,
        COALESCE(SUM(pgs.own_goals), 0) AS own_goals,

        COUNT(DISTINCT g.game_id) AS games_played,
        
        COALESCE(SUM(CASE
            WHEN tm.team_id = gt.team1_id AND g.team1_score > g.team2_score THEN 1
            WHEN tm.team_id = gt.team2_id AND g.team2_score > g.team1_score THEN 1
            ELSE 0
        END), 0) AS total_wins,
        COALESCE(SUM(CASE
            WHEN tm.team_id = gt.team1_id AND g.team1_score < g.team2_score THEN 1
            WHEN tm.team_id = gt.team2_id AND g.team2_score < g.team1_score THEN 1
            ELSE 0
        END), 0) AS total_losses,
        COALESCE(SUM(CASE
            WHEN g.game_id IS NOT NULL AND g.team1_score = g.team2_score THEN 1
            ELSE 0
        END), 0) AS total_draws
        
      FROM players p 
      LEFT JOIN team_members tm ON p.player_id = tm.player_id AND tm.league_id = $1
      LEFT JOIN teams t ON tm.team_id = t.team_id AND t.league_id = $1
      LEFT JOIN games g ON t.game_id = g.game_id AND g.league_id = $1 ${yearFilterMain}
      LEFT JOIN player_game_stats pgs ON p.player_id = pgs.player_id AND g.game_id = pgs.game_id AND pgs.league_id = $1
      LEFT JOIN (
        SELECT game_id, MIN(team_id) AS team1_id, MAX(team_id) AS team2_id
        FROM teams WHERE league_id = $1 GROUP BY game_id
      ) AS gt ON g.game_id = gt.game_id
      WHERE p.league_id = $1
      GROUP BY p.player_id, p.player_name, p.preferred_position;`;

    try {
      const result = await client.query(query, queryParams);
      res.json(result.rows);
    } catch (err) {
      console.error("Error fetching players", err.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/:id", async (req, res) => {
    const playerId = parseInt(req.params.id, 10);
    const league_id = req.league_id;
    const year = req.query.year ? parseInt(req.query.year, 10) : null;

    if (isNaN(playerId)) {
      return res.status(400).json({ error: "Invalid player ID" });
    }

    try {
      const playerCheck = await client.query(
        `SELECT * FROM players WHERE player_id = $1 AND league_id = $2`,
        [playerId, league_id],
      );

      if (playerCheck.rows.length === 0) {
        return res.status(404).json({ error: "Player not found" });
      }

      const queryParams = [playerId, league_id];
      let yearFilter = "";

      if (year) {
        queryParams.push(`${year}-01-01`, `${year + 1}-01-01`);
        yearFilter = `AND g.game_date >= $3 AND g.game_date < $4`;
      }

      const statsQuery = `
        SELECT 
            p.player_id, p.player_name,
            pgd.game_id, pgd.game_date,
            pgd.goals_scored, pgd.kicked_over_fence, pgd.own_goals,
            pgd.is_winning_team
        FROM players p
        LEFT JOIN (
            SELECT
                tm.player_id, g.game_id, g.game_date,
                COALESCE(pgs.goals_scored, 0) AS goals_scored,
                COALESCE(pgs.kicked_over_fence, 0) AS kicked_over_fence,
                COALESCE(pgs.own_goals, 0) AS own_goals,
                CASE
                    WHEN (g.team1_score > g.team2_score AND tm.team_id = gt.team1_id) OR
                         (g.team2_score > g.team1_score AND tm.team_id = gt.team2_id) THEN 1
                    ELSE 0
                END AS is_winning_team
            FROM team_members tm
            JOIN teams t ON tm.team_id = t.team_id AND t.league_id = $2
            JOIN games g ON t.game_id = g.game_id AND g.league_id = $2 ${yearFilter}
            LEFT JOIN player_game_stats pgs ON tm.player_id = pgs.player_id 
                 AND g.game_id = pgs.game_id AND pgs.league_id = $2
            LEFT JOIN (
                SELECT game_id, MIN(team_id) AS team1_id, MAX(team_id) AS team2_id 
                FROM teams WHERE league_id = $2 GROUP BY game_id
            ) gt ON g.game_id = gt.game_id
            WHERE tm.league_id = $2
        ) pgd ON p.player_id = pgd.player_id
        WHERE p.player_id = $1 AND p.league_id = $2
        ORDER BY pgd.game_date DESC;`;

      const statsResult = await client.query(statsQuery, queryParams);

      // Since the first row contains the player info, and stats are joined:
      const playerInfo = playerCheck.rows[0];
      const gameHistory = statsResult.rows
        .filter((row) => row.game_id !== null) // Remove the empty join row if player hasn't played
        .map((row) => ({
          game_id: row.game_id,
          game_date: row.game_date,
          goals_scored: row.goals_scored,
          kicked_over_fence: row.kicked_over_fence,
          is_winning_team: row.is_winning_team,
        }));

      res.json({
        ...playerInfo,
        stats: gameHistory,
      });
    } catch (err) {
      console.error("Error fetching player details:", err.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/", async (req, res) => {
    const players = req.body;
    const league_id = req.league_id;
    if (!Array.isArray(players)) {
      return res.status(500).json({ error: "array not provided" });
    }

    try {
      const placeholders = players
        .map(
          (player, index) =>
            `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3})`,
        )
        .join(", ");
      const values = players.flatMap((p) => [
        p.name,
        p.preferred_position,
        league_id,
      ]);
      const query = `
      INSERT INTO players (player_name, preferred_position, league_id) 
      VALUES ${placeholders} 
      RETURNING *
    `;
      const result = await client.query(query, values);
      res.json(result.rows);
    } catch (err) {
      console.error("Error adding player", err.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.put("/", async (req, res) => {
    const players = req.body;
    const league_id = req.league_id;
    if (!Array.isArray(players)) {
      return res.status(500).json({ error: "array not provided" });
    }

    if (players.length === 0) {
      return res.json([]);
    }

    try {
      const placeholders = players
        .map(
          (_, index) =>
            `($${index * 3 + 1}::int, $${index * 3 + 2}::text, $${index * 3 + 3}::text)`,
        )
        .join(", ");
      const values = [
        ...players.flatMap((p) => [
          p.id || p.player_id,
          p.name || p.player_name || null,
          p.preferred_position || null,
        ]),
        league_id,
      ];
      const leagueIdParamIndex = players.length * 3 + 1;

      const query = `
        UPDATE players AS p
        SET 
          player_name = COALESCE(v.player_name, p.player_name),
          preferred_position = COALESCE(v.preferred_position, p.preferred_position)
        FROM (VALUES ${placeholders}) AS v(player_id, player_name, preferred_position)
        WHERE p.player_id = v.player_id AND p.league_id = $${leagueIdParamIndex}
        RETURNING p.*;
      `;
      const result = await client.query(query, values);
      res.json(result.rows);
    } catch (err) {
      console.error("Error updating players", err.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const league_id = req.league_id;
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
        "UPDATE players SET name = $1, preferred_position = $2, goals = $3, assists = $4, games_played = $5, over_fence = $6, wins = $7, league_id=$8 WHERE id = $9 RETURNING *",
        [
          name,
          preferred_position,
          goals,
          assists,
          games_played,
          over_fence,
          wins,
          league_id,
          id,
        ],
      );
      res.json(result.rows);
    } catch (err) {
      console.error("Error updating player", err.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
};

export default PlayerRoutes;
