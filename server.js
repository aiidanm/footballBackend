

const express = require('express');
const { Client } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');

// Initialize the Express app
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Create a new PostgreSQL client using the connection string from Heroku
const client = new Client({
  connectionString: process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Connect to the PostgreSQL database
client.connect()
  .then(() => console.log('Connected to PostgreSQL database'))
  .catch(err => {
    console.error('Connection error:', err.stack);
    if (err.message.includes('ECONNREFUSED')) {
      console.error('Connection refused. Please check if the database server is running and accessible.');
    }
    if (err.message.includes('ENOTFOUND')) {
      console.error('Database host not found. Please verify the host address.');
    }
    // Add more specific error handling as needed
  });

// Example endpoint to fetch all players
app.get('/players', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM players');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching players', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Example endpoint to add a new player
app.post('/players', async (req, res) => {
  const { name, preferred_position } = req.body;
  try {
    const result = await client.query(
      'INSERT INTO players (name, preferred_position) VALUES ($1, $2) RETURNING *',
      [name, preferred_position]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error adding player', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Example endpoint to update a player by ID
app.put('/players/:id', async (req, res) => {
  const { id } = req.params;
  const { name, preferred_position, goals, assists, games_played, over_fence, wins } = req.body;
  try {
    const result = await client.query(
      'UPDATE players SET name = $1, preferred_position = $2, goals = $3, assists = $4, games_played = $5, over_fence = $6, wins = $7 WHERE id = $8 RETURNING *',
      [name, preferred_position, goals, assists, games_played, over_fence, wins, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating player', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Example endpoint to get a player by ID
app.get('/players/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await client.query('SELECT * FROM players WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching player', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Example endpoint to record a new game
app.post('/games', async (req, res) => {
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

// Example endpoint to get a list of games
app.get('/games', async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : 10;
  try {
    const result = await client.query(
      'SELECT * FROM games ORDER BY date DESC LIMIT $1',
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching games', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
