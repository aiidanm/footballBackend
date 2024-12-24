const express = require('express');
const { Client } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');

const PlayerRoutes = require('./Routers/playersRouter');
const GameRoutes = require('./Routes/gamesRouter');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const client = new Client({
  connectionString: process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

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
  });

// Mount the routes, passing in the client
app.use('/players', PlayerRoutes(client));
app.use('/games', GameRoutes(client));


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
