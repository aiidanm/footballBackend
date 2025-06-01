import express, { response } from "express";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { Console } from "console";

const router = express.Router();
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const prePrompt = fs.readFileSync("./prePrompt.txt", "utf-8");

const AiRoutes = (client) => {
  router.post("/", async (req, res) => {
    //AI Section
    try {
      const { prompt } = req.body;

      if (!prompt) {
        return res
          .status(400)
          .json({ error: "Prompt is required in the request body." });
      }

      const currentDate = new Date().toISOString().split("T")[0]; // Format as 'YYYY-MM-DD'
      const finalPrompt = prePrompt
        .replace("{current_date_from_your_server}", currentDate)
        .replace("{user_question_from_frontend}", prompt);

      const result = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: finalPrompt,
      });

      console.log(result);

      const response = await result.response;
      const generatedText = response.text();

      // =================================================================
      // 3. NEW: Clean the Response to get Pure SQL
      // =================================================================

      // Remove markdown formatting (```sql ... ```) to isolate the query
      const cleanSql = generatedText.replace(/```sql\n|```/g, "").trim();

      console.log("Extracted and Cleaned SQL:", cleanSql);

      // For now, send the cleaned SQL back to the frontend to verify it works
      res.json({
        final_prompt: fullPrompt, // Optional: for debugging
        generated_sql: cleanSql,
      });
    } catch (error) {
      console.error(error);
    }

    //database Section
    // try {
    //   const result = await client.query(generatedSql);
    //   res.json(result.rows);
    // } catch (error) {
    //   console.error(error);
    // }
  });

  return router;
};

export default AiRoutes;
