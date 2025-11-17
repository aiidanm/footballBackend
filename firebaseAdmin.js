import admin from "firebase-admin";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccount = JSON.parse(
  readFileSync(path.join(__dirname, "/etc/secrets/creds.json"))
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export default admin;
