// routes/leagueRoutes.js
import express from "express";
const router = express.Router();

const LeaguesRouter = (client) => {
  router.post("/", async (req, res) => {
    const { uid, userName } = req.body;

    if (!uid || !userName) {
      return res.status(400).json({ error: "Missing uid or userName" });
    }

    try {
      // 2. Use placeholders ($1, $2) to prevent SQL injection
      // We use "user_name" as a column name since "User" is often a reserved word in SQL
      const query = `
        INSERT INTO league_ids (uid, player_name)
        VALUES ($1, $2) 
        RETURNING league_id;
      `;
      
      const result = await client.query(query, [uid, userName]);

      // 3. Send the new ID back to the frontend
      const newLeagueId = result.rows[0].league_id;
      res.status(201).json({ 
        message: "League registered successfully", 
        league_id: newLeagueId 
      });

    } catch (err) {
      console.error("Error registering league:", err.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  return router;
};

export default LeaguesRouter;
