import express from "express";
import pkg from "pg";
const { Client } = pkg;
import cors from "cors";
import bodyParser from "body-parser";
import "dotenv/config";
import PlayerRoutes from "./Routers/playersRouter.js";
import GameRoutes from "./Routers/gamesRouter.js";
import AiRoutes from "./Routers/AiRouter.js";

const app = express();
app.use(cors({ origin: `*` }));
app.use(bodyParser.json());

const client = new Client({
  connectionString: process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

client
  .connect()
  .then(() => console.log("Connected to PostgreSQL database"))
  .catch((err) => {
    console.error("Connection error:", err.stack);
    if (err.message.includes("ECONNREFUSED")) {
      console.error(
        "Connection refused. Please check if the database server is running and accessible."
      );
    }
    if (err.message.includes("ENOTFOUND")) {
      console.error("Database host not found. Please verify the host address.");
    }
  });

app.use("/players", PlayerRoutes(client));
app.use("/games", GameRoutes(client));
app.use("/ai", AiRoutes(client));

const PORT = process.env.PORT || 5142;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
