import admin from "../firebaseAdmin.js";

const createVerifyToken = (client) => async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(403).send("Unauthorized");
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;

    const uid = decodedToken.uid;
    const result = await client.query('SELECT league_id FROM league_ids WHERE uid = $1', [uid]);
    console.log(result)
    if (result.rows.length === 0) {
      return res.status(403).send("User not found in database");
    }
    req.league_id = result.rows[0].league_id;

    next();
  } catch (error) {
    console.log("Error while verifying Firebase ID token or querying database:", error);
    res.status(403).send({msg : "Unauthorized", error});
  }
};

export default createVerifyToken;
