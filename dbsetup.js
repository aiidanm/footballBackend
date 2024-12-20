

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

const dropTables = async () => {
  try {
    await client.query(`
    DROP TABLE IF EXISTS player_game_stats CASCADE;
    DROP TABLE IF EXISTS team_members CASCADE;
    DROP TABLE IF EXISTS teams CASCADE;
    DROP TABLE IF EXISTS games CASCADE;
    DROP TABLE IF EXISTS players CASCADE;
    `)
  } catch(err){
    console.log("error dropping tables", err)
  }
}


const createTables = async () => {
  try {
    await client.query(`
    CREATE TABLE players (
        player_id SERIAL PRIMARY KEY,
        player_name VARCHAR(100) NOT NULL UNIQUE
    );

    CREATE TABLE games (
        game_id SERIAL PRIMARY KEY,
        game_date DATE NOT NULL UNIQUE,
        team1_score INT,
        team2_score INT,
        winning_team_id INT REFERENCES teams(team_id)
    );

    CREATE TABLE teams (
        team_id SERIAL PRIMARY KEY,
        game_id INT NOT NULL REFERENCES games(game_id),
        team_name VARCHAR(50) NOT NULL,
        UNIQUE (game_id, team_name)
    );

    CREATE TABLE team_members (
        team_id INT NOT NULL REFERENCES teams(team_id),
        player_id INT NOT NULL REFERENCES players(player_id),
        PRIMARY KEY (team_id, player_id)
    );

    CREATE TABLE player_game_stats (
        game_id INT NOT NULL REFERENCES games(game_id),
        player_id INT NOT NULL REFERENCES players(player_id),
        goals_scored INT DEFAULT 0,
        kicked_over_fence INT DEFAULT 0,
        PRIMARY KEY (game_id, player_id)
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
    await dropTables()
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
