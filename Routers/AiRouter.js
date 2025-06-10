import express, { response } from "express";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { Console } from "console";
import { initializeApp } from "firebase-admin/app";
const verifyToken = require("./authMiddleware");

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const prePrompt = fs.readFileSync("./prePrompt.txt", "utf-8");

const AiRoutes = (client) => {
  router.post("/", verifyToken, async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
      return res
        .status(400)
        .json({ error: "Prompt is required in the request body." });
    }

    const currentDate = new Date().toISOString().split("T")[0]; 
    const finalPrompt = prePrompt
      .replace("{current_date_from_your_server}", currentDate)
      .replace("{user_question_from_frontend}", prompt);

    async function main() {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: finalPrompt,
      });
      return response.text;
    }

    const generatedText = await main();

    const cleanSql = generatedText
      .replace(/```sql\n|```/g, "")
      .replace(/\s+/g, " ")
      .replace(/\n/g, " ")
      .trim();

    try {
      const result = await client.query(cleanSql);
      res.json(result.rows);
    } catch (error) {
      console.error(error);
    }
  });

  return router;
};

export default AiRoutes;
