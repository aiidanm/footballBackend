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
    req.league_id = result.rows.length > 0 ? result.rows[0].league_id : null;

    next();
  } catch (error) {
    res.status(403).send({msg : "Unauthorized", error});
  }
};

const verifyLeague = (req, res, next) => {
  if(!req.league_id || req.league_id === 0){
    return res.status(403).json({message: "no league id assigned to account", needsOnboarding: true})
  }
  next()
}

export default {createVerifyToken, verifyLeague};
