// routes/GameRoutes.js
const express = require('express');
const router = express.Router();

module.exports = (client) => {
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const gameId = parseInt(id, 10);

    if (isNaN(gameId)) {
      return res.status(400).json({ error: 'Invalid game ID' });
    }

    try {
      // Basic game info
      const gameResult = await client.query(`
        SELECT game_id, game_date, team1_score, team2_score, winning_team_id
        FROM games
        WHERE game_id = $1
      `, [gameId]);

      if (gameResult.rows.length === 0) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const gameInfo = gameResult.rows[0];

      // Team and player details for this game
      const teamPlayersResult = await client.query(`
        SELECT teams.team_id, teams.team_name,
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
      `, [gameId]);

      // Group players by team
      const teamsMap = {};
      for (const row of teamPlayersResult.rows) {
        const { team_id, team_name, player_id, player_name, goals_scored, kicked_over_fence } = row;

        if (!teamsMap[team_id]) {
          teamsMap[team_id] = {
            team_id,
            team_name,
            players: []
          };
        }

        teamsMap[team_id].players.push({
          player_id,
          player_name,
          goals_scored,
          kicked_over_fence
        });
      }

      const teamsArray = Object.values(teamsMap);

      // Construct the final response
      const responseData = {
        game_id: gameInfo.game_id,
        game_date: gameInfo.game_date,
        team1_score: gameInfo.team1_score,
        team2_score: gameInfo.team2_score,
        winning_team_id: gameInfo.winning_team_id,
        teams: teamsArray
      };

      res.json(responseData);
    } catch (err) {
      console.error('Error fetching game details:', err.stack);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Record a new game
  router.post('/', async (req, res) => {
    const { date, players } = req.body;
    try {
      const gameResult = await client.query(
        'INSERT INTO games (date) VALUES ($1) RETURNING *',
        [date]
      );
      const gameId = gameResult.rows[0].id;

      for (const player of players) {
        await client.query(
          'INSERT INTO player_game_stats (game_id, player_id, played, scored, assisted) VALUES ($1, $2, $3, $4, $5)',
          [gameId, player.id, player.played, player.scored, player.assisted]
        );
      }

      res.json({ message: 'Game recorded successfully' });
    } catch (err) {
      console.error('Error recording game', err.stack);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get a list of games
  router.get('/', async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 10;
  try {
    const result = await client.query(`
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
    `, [limit]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching games', err);
    res.status(500).json({ error: err });
  }
});

  return router;
};
