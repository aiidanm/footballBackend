import express, { response } from "express";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { Console } from "console";
import { initializeApp } from "firebase-admin/app";
import verifyToken from "./authMiddleware.js";

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const prePrompt = fs.readFileSync("./prePrompt.txt", "utf-8");

const AiRoutes = (client) => {
  router.post("/", verifyToken, async (req, res) => {
    // const { prompt } = req.body;

    // if (!prompt) {
    //   return res
    //     .status(400)
    //     .json({ error: "Prompt is required in the request body." });
    // }

    // const currentDate = new Date().toISOString().split("T")[0];
    // const finalPrompt = prePrompt
    //   .replace("{current_date_from_your_server}", currentDate)
    //   .replace("{user_question_from_frontend}", prompt);

    // async function main() {
    //   const response = await ai.models.generateContent({
    //     model: "gemini-2.0-flash",
    //     contents: finalPrompt,
    //   });
    //   return response.text;
    // }

    // const generatedText = await main();

    // const cleanSql = generatedText
    //   .replace(/```sql\n|```/g, "")
    //   .replace(/\s+/g, " ")
    //   .replace(/\n/g, " ")
    //   .trim();

    // try {
    //   const result = await client.query(cleanSql);
    // } catch (error) {
    //   console.error(error);
    // }


    // async function formatRes() {
    //   const response = await ai.models.generateContent({
    //     model: "gemini-2.0-flash",
    //     contents: 'here is the result from a database of football stats for a personal football league, please return this in a easy to read format in a sentance structure' + result.rows,
    //   });
    //   return response.text;
    // }
    try {
      const { prompt } = req.body;

      if (!prompt) {
        return res
          .status(400)
          .json({ error: "Prompt is required in the request body." });
      }

      // 1. GENERATE THE SQL QUERY
      const currentDate = new Date().toISOString().split("T")[0];
      const sqlGenerationPrompt = prePrompt
        .replace("{current_date_from_your_server}", currentDate)
        .replace("{user_question_from_frontend}", prompt);

      const sqlResponse = await ai.models.generateContent({
        model: "gemini-1.5-flash-latest", // Corrected model name
        contents: sqlGenerationPrompt,
      });

      const cleanSql = sqlResponse.text
        .replace(/```sql\n|```/g, "")
        .replace(/\s+/g, " ")
        .replace(/\n/g, " ")
        .trim();

      // For debugging: log the SQL before executing
      console.log("Executing SQL:", cleanSql);

      // 2. EXECUTE THE QUERY
      const dbResult = await client.query(cleanSql);

     
      const dbResultString = JSON.stringify(dbResult.rows);

      const formattingPrompt = `Here is the result from a database of football stats for a personal football league: ${dbResultString}. Please return this in an easy-to-read format using sentence structure.`;

      const formattedResponse = await ai.models.generateContent({
        model: "gemini-1.5-flash-latest", 
        contents: formattingPrompt,
      });

      res.json({ result: formattedResponse.text });
      
    } catch (error) {
      console.error("An error occurred in the AI route:", error);
      res.status(500).json({ error: "An internal server error occurred." });
    }
  });

  return router;
};

export default AiRoutes;
