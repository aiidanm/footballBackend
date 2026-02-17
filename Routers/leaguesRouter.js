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


  router.post("/join", async (req, res) => {
    const {uid, userName, leagueCode, Name} = req.body
    if(!uid || !leagueCode || !Name ){
      return res.status(400).json({error: "missing data in request"})
    }
    try {
      await client.query('BEGIN');

      const leagueCheck = await client.query(`
      SELECT id FROM leagues WHERE joinCode = $1
      `, [leagueCode])

      if (leagueCheck.rows.length === 0) {
        return res.status(404).json({error: "league code not found"})
      }
      const leagueId = leagueCheck.rows[0].id

      const leaguejoin = await client.query(`
      INSERT INTO league_ids  (uid, league_id, User, role)
      VALUES ($1, $2, $3, $4)
      RETURNING league_id;
      `, [uid, leagueId, Name, "player"])

      const leagueIdAfter = leaguejoin.rows[0].league_id
        res.status(201).json({message: "registered success", league_id: leagueIdAfter})
    } catch (e){
      console.error("error in joining league")
      res.status(500).json({error: "server backend error"})
    }

  })
  return router;


};






export default LeaguesRouter;
