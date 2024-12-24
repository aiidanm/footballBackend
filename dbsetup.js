const { Client } = require("pg");
require("dotenv").config();

// Create a new PostgreSQL client using the connection string from Heroku
const client = new Client({
  connectionString: process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const dropTables = async () => {
  try {
    await client.query(
      `DROP TABLE IF EXISTS player_game_stats CASCADE; DROP TABLE IF EXISTS team_members CASCADE; DROP TABLE IF EXISTS teams CASCADE; DROP TABLE IF EXISTS games CASCADE; DROP TABLE IF EXISTS players CASCADE;`
    );
    console.log("tables dropped done");
  } catch (err) {
    console.log("error dropping tables", err);
  }
};

// Function to create tables without foreign keys
const createTables = async () => {
  try {
    await client.query(`
      CREATE TABLE players (
          player_id SERIAL PRIMARY KEY,
          player_name VARCHAR(100) NOT NULL UNIQUE
      );

      CREATE TABLE teams (
          team_id SERIAL PRIMARY KEY,
          game_id INT NOT NULL, 
          team_name VARCHAR(50) NOT NULL,
          UNIQUE (game_id, team_name)
      );

      CREATE TABLE games (
          game_id SERIAL PRIMARY KEY,
          game_date DATE NOT NULL UNIQUE,
          team1_score INT,
          team2_score INT,
          winning_team_id INT 
      );

      CREATE TABLE team_members (
          team_id INT NOT NULL,
          player_id INT NOT NULL,
          PRIMARY KEY (team_id, player_id)
      );

      CREATE TABLE player_game_stats (
          game_id INT NOT NULL,
          player_id INT NOT NULL,
          goals_scored INT DEFAULT 0,
          kicked_over_fence INT DEFAULT 0,
          PRIMARY KEY (game_id, player_id)
      );
    `);

    console.log("Tables created successfully.");
  } catch (err) {
    console.error("Error creating tables: ", err);
  }
};

// Function to add foreign key constraints
const alterTables = async () => {
  try {
    await client.query(`
      ALTER TABLE teams
      ADD CONSTRAINT fk_game_id
      FOREIGN KEY (game_id)
      REFERENCES games(game_id);

      ALTER TABLE games
      ADD CONSTRAINT fk_winning_team_id
      FOREIGN KEY (winning_team_id)
      REFERENCES teams(team_id);

      ALTER TABLE team_members
      ADD CONSTRAINT fk_team_id
      FOREIGN KEY (team_id)
      REFERENCES teams(team_id),
      ADD CONSTRAINT fk_player_id
      FOREIGN KEY (player_id)
      REFERENCES players(player_id);

      ALTER TABLE player_game_stats
      ADD CONSTRAINT fk_game_id_stats
      FOREIGN KEY (game_id)
      REFERENCES games(game_id),
      ADD CONSTRAINT fk_player_id_stats
      FOREIGN KEY (player_id)
      REFERENCES players(player_id);
    `);

    console.log("Foreign key constraints added successfully.");
  } catch (err) {
    console.error("Error adding foreign key constraints: ", err);
  }
};

// Main function to setup the database
const setupDatabase = async () => {
  try {
    await client.connect(); // Connect to the database
    console.log("Connected to the database");
    await dropTables();
    await createTables();
    await alterTables();
  } catch (err) {
    console.error("Setup failed", err);
  } finally {
    await client.end(); // Close the database connection
    console.log("Database connection closed");
  }
};

// Execute the setup
setupDatabase()
  .then(() => console.log("Setup completed"))
  .catch((err) => console.error("Setup failed", err));
