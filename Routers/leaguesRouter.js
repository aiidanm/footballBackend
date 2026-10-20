// routes/leagueRoutes.js
import express from "express";
import { getUserLeagueData } from "../utils.js";
const router = express.Router();

const LeaguesRouter = (client) => {
  router.post("/", async (req, res) => {
    const { uid, playerName, league_name } = req.body;
    const authenticatedUid = req.user?.uid;

    if (!authenticatedUid || !playerName || !league_name) {
      return res
        .status(400)
        .json({
          error: "Missing authenticated user, playerName, or league_name",
        });
    }

    if (uid && uid !== authenticatedUid) {
      return res
        .status(403)
        .json({ error: "UID does not match authenticated user" });
    }

    try {
      await client.query("BEGIN");

      const leagueResult = await client.query(
        `
        INSERT INTO leagues (league_name)
        VALUES ($1) 
        RETURNING id;
      `,
        [league_name],
      );
      const newLeagueId = leagueResult.rows[0].id;

      await client.query(
        `INSERT INTO users (uid, league_id, full_name, role, email)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          authenticatedUid,
          newLeagueId,
          playerName,
          "admin",
          req.user.email || null,
        ],
      );

      await client.query("COMMIT");
      res.status(201).json({
        message: "League registered successfully",
        league_id: newLeagueId,
      });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Error registering league:", err.stack);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/join", async (req, res) => {
    const { uid, leagueCode, playerName, email } = req.body;
    if (!uid || !leagueCode || !playerName) {
      return res.status(400).json({ error: "missing data in request" });
    }
    try {
      await client.query("BEGIN");

      const leagueCheck = await client.query(
        `
      SELECT id, league_name FROM leagues WHERE join_code = $1
      `,
        [leagueCode],
      );

      if (leagueCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "league code not found" });
      }
      const leagueId = leagueCheck.rows[0].id;

      const leaguejoin = await client.query(
        `
      INSERT INTO users  (uid, league_id, full_name, role, email)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING league_id;
      `,
        [uid, leagueId, playerName, "player", email],
      );

      const leagueIdAfter = leaguejoin.rows[0].league_id;
      await client.query("COMMIT");
      res
        .status(201)
        .json({ message: "registered success", league_id: leagueIdAfter });
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("error in joining league");
      res.status(500).json({ error: "server backend error" });
    }
  });

  router.post("/login", async (req, res) => {
    try {
      // Token is already verified by router middleware.
      const uid = req.user?.uid;

      if (!uid) {
        return res.status(401).json({ error: "No authenticated user found" });
      }

      const dbData = await getUserLeagueData(client, uid);
      return res.status(200).json({
        message: "Login successful",
        user: {
          uid: uid,
          role: dbData.role,
          league_id: dbData.league_id,
          playerName: dbData.full_name,
          email: dbData.email,
          league_name: dbData.league_name,
        },
      });
    } catch (error) {
      console.error("Error in /leagues/login:", error);
      return res
        .status(500)
        .json({ error: "Internal server error during login" });
    }
  });

  router.post("/leagueCode", async (req, res) => {
    const { uid, leagueId } = req.body;
    console.log(req.body);
    if (!uid || !leagueId) {
      return res.status(400).json({ error: "missing data in request" });
    }
    try {
      await client.query("BEGIN");

      const leagueCheck = await client.query(
        `
      SELECT join_code FROM leagues WHERE id = $1
      `,
        [leagueId],
      );

      if (leagueCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "league id not found" });
      }

      let leagueCode = leagueCheck.rows[0].join_code;

      await client.query("COMMIT");
      res
        .status(201)
        .json({ message: "league code success", league_code: leagueCode });
    } catch (e) {}
  });
  return router;
};

export default LeaguesRouter;
