const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(bodyParser.json());
app.use(cors());

const pool = new Pool({
  user: 'your_postgres_user',
  host: 'localhost',
  database: 'football_stats',
  password: 'your_postgres_password',
  port: 5432,
});

// Add a new player
app.post('/players', async (req, res) => {
  const { name, preferred_position } = req.body;
  const result = await pool.query(
    'INSERT INTO players (name, preferred_position) VALUES ($1, $2) RETURNING *',
    [name, preferred_position]
  );
  res.json(result.rows[0]);
});

// Get all players
app.get('/players', async (req, res) => {
  const result = await pool.query('SELECT * FROM players');
  res.json(result.rows);
});

// Record a new game
app.post('/games', async (req, res) => {
  const { date, players } = req.body;
  const gameResult = await pool.query(
    'INSERT INTO games (date) VALUES ($1) RETURNING *',
    [date]
  );
  const gameId = gameResult.rows[0].id;

  for (const player of players) {
    await pool.query(
      'INSERT INTO player_game_stats (game_id, player_id, played, scored, assisted) VALUES ($1, $2, $3, $4, $5)',
      [gameId, player.id, player.played, player.scored, player.assisted]
    );
  }

  res.json({ message: 'Game recorded successfully' });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
