import admin from "../firebaseAdmin.js";
import { getUserLeagueData } from "../utils.js";

const createVerifyToken = (client) => async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(403).send("Unauthorized");
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    console.log(decodedToken)
    const uid = decodedToken.uid;
    const {league_id, role} = await getUserLeagueData(client, uid)
    req.league_id = league_id;
    req.role = role;

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

export {createVerifyToken, verifyLeague};
