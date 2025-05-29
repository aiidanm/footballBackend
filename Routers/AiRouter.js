import express from "express";

const router = express.Router();
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "YOUR_API_KEY" });

const AiRoutes = (client) => {
  router.post("/", async (req, res) => {
    const prompt = req.body;

    async function main() {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: "Explain how AI works in a few words",
      });
      console.log(response.text);
    }
  });

  return router;
};

export default AiRoutes
