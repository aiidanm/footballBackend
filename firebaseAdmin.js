import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prodPath = "/etc/secrets/creds.json";
const localPath = path.join(__dirname, "creds.json");

let serviceAccount;

if (existsSync(prodPath)) {
  serviceAccount = JSON.parse(readFileSync(prodPath));
} else if (existsSync(localPath)) {
  serviceAccount = JSON.parse(readFileSync(localPath));
} else {
  throw new Error("Firebase credentials file not found at /etc/secrets/creds.json or locally.");
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export default admin;