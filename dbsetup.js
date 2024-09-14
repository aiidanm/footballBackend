

const { Client } = require('pg');
require('dotenv').config();

// Create a new PostgreSQL client using the connection string from Heroku
const client = new Client({
  connectionString: process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Function to create tables
const createTables = async () => {
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        preferred_position VARCHAR(50),
        goals INTEGER DEFAULT 0,
        assists INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        over_fence INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS games (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS player_game_stats (
        id SERIAL PRIMARY KEY,
        game_id INTEGER REFERENCES games(id),
        player_id INTEGER REFERENCES players(id),
        played VARCHAR(4),
        scored INTEGER,
        assisted INTEGER
      );
    `);

    console.log("Tables created successfully or already exist.");
  } catch (err) {
    console.error("Error creating tables: ", err);
  }
};

// Function to seed the database with initial data
const seedDatabase = async () => {
  try {
    await client.query(`
      INSERT INTO players (name, preferred_position, goals, assists, games_played, over_fence, wins)
      VALUES 
      ('Aidan', 'defender', 5, 1, 5, 2, 3),
      ('Bella', 'midfielder', 3, 4, 6, 0, 4),
      ('Charlie', 'forward', 8, 2, 5, 1, 5)
      ON CONFLICT DO NOTHING;
    `);

    console.log("Database seeded successfully.");
  } catch (err) {
    console.error("Error seeding database: ", err);
  }
};

// Main function to setup and seed the database
const setupDatabase = async () => {
  try {
    await client.connect(); // Connect to the database
    console.log('Connected to the database');

    await createTables();
    await seedDatabase();
  } catch (err) {
    console.error('Setup failed', err);
  } finally {
    await client.end(); // Close the database connection
    console.log('Database connection closed');
  }
};

// Execute the setup
setupDatabase().then(() => console.log('Setup completed')).catch(err => console.error('Setup failed', err));
