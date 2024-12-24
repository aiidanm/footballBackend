const { Client } = require("pg");
require("dotenv").config();

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

const createTables = async () => {
  try {
    await client.query(`
      CREATE TABLE players (
          player_id SERIAL PRIMARY KEY,
          player_name VARCHAR(100) NOT NULL UNIQUE,
          preferred_position VARCHAR(20)
      );

      CREATE TABLE teams (
          team_id SERIAL PRIMARY KEY,
          game_id INT NOT NULL
      );

      CREATE TABLE games (
          game_id SERIAL PRIMARY KEY,
          game_date DATE NOT NULL UNIQUE,
          team1_score INT,
          team2_score INT
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

const alterTables = async () => {
  try {
    await client.query(`
      ALTER TABLE teams
      ADD CONSTRAINT fk_game_id
      FOREIGN KEY (game_id)
      REFERENCES games(game_id);

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

const seedPlayers = async () => {
  try {
    await client.query(`
      INSERT INTO players (player_name, preferred_position) VALUES
      ('Alice', 'defender'), ('Bob', 'defender'), ('Charlie', 'defender'), ('David', 'defender'), ('Emily', 'defender'),
      ('Frank', 'defender'), ('Grace', 'defender'), ('Henry', 'defender'), ('Isabelle', 'defender'), ('Jack', 'defender')
      ON CONFLICT DO NOTHING;
    `);
    console.log("Players seeded successfully.");
  } catch (err) {
    console.error("Error seeding players: ", err);
  }
};

const seedTeams = async () => {
  try {
    await client.query(`
      INSERT INTO teams (game_id) VALUES
      (1), (1), (2), (2) -- Two teams per game
      ON CONFLICT DO NOTHING;
    `);
    console.log("Teams seeded successfully.");
  } catch (err) {
    console.error("Error seeding teams: ", err);
  }
};

const seedGames = async () => {
  try {
    await client.query(`
      INSERT INTO games (game_date, team1_score, team2_score) VALUES
      ('2024-12-20', 5, 3)
      ON CONFLICT DO NOTHING;
    `);

    await client.query(`
      INSERT INTO games (game_date, team1_score, team2_score)
      VALUES ('2024-12-19', 2, 4) -- Assuming Team D has team_id 4
      ON CONFLICT DO NOTHING;
    `);
    console.log("Games seeded successfully.");
  } catch (err) {
    console.error("Error seeding games: ", err);
  }
};

const seedPlayerGameStats = async () => {
  try {
    await client.query(`
      INSERT INTO player_game_stats (game_id, player_id, goals_scored, kicked_over_fence) VALUES
      (1, 1, 2, 0), (1, 3, 1, 1), (1, 6, 1, 0), (1, 8, 2, 1), -- Stats for the first game
      (2, 1, 1, NULL), (2, 4, 2, NULL)  -- Stats for the second game
      ON CONFLICT DO NOTHING;
    `);
    console.log("Player game stats seeded successfully.");
  } catch (err) {
    console.error("Error seeding player game stats: ", err);
  }
};

const seedTeamMembers = async () => {
  try {
    await client.query(`
      INSERT INTO team_members (team_id, player_id) VALUES
      (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), -- Team A, game 1
      (2, 6), (2, 7), (2, 8), (2, 9), (2, 10), -- Team B, game 1
      (3, 1), (3, 3), (3, 5), (3, 7), -- Team C, game 2
      (4, 2), (4, 4), (4, 8)  -- Team D, game 2
      ON CONFLICT DO NOTHING;
    `);
    console.log("Team members seeded successfully.");
  } catch (err) {
    console.error("Error seeding team members: ", err);
  }
};

const setupDatabase = async () => {
  try {
    await client.connect();
    console.log("Connected to the database");
    await dropTables();
    await createTables();
    await alterTables();
    await seedPlayers();
    await seedGames();
    await seedTeams();
    await seedTeamMembers();
    await seedPlayerGameStats();
  } catch (err) {
    console.error("Setup failed", err);
  } finally {
    await client.end();
    console.log("Database connection closed");
  }
};

setupDatabase()
  .then(() => console.log("Setup completed"))
  .catch((err) => console.error("Setup failed", err));
