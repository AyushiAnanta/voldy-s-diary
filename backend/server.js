const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/generative-ai"); // Standard Gemini SDK imports

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Canvas images might be large

/**
 * Health check endpoint
 */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "PenEcho Backend Server is running" });
});

/**
 * Canvas AI reasoning endpoint placeholder.
 * This endpoint will handle receiving cropped canvas chunks/atlas image (base64)
 * and spatial ink coordinate geometry, sending them to the Gemini API,
 * and returning structured commands (e.g. write_text, draw, plot_function).
 */
app.post("/api/canvas-ai", async (req, res) => {
  try {
    const { image, text, context, intent } = req.body;

    // TODO: Implement your Gemini multimodal API call here!
    // Example step-by-step guideline:
    // 1. Initialize the GoogleGenAI instance using process.env.GEMINI_API_KEY.
    // 2. Prepare the prompt (see original PenEcho system prompts).
    // 3. Send the image (base64 buffer) and prompt to the model (e.g., gemini-2.5-flash).
    // 4. Return the structured JSON response containing canvas commands.

    console.log("Received request from frontend:", {
      hasImage: !!image,
      inputText: text,
      intent,
    });

    // Baseline fallback mock response
    res.json({
      intent: "answer",
      observedText: text || "",
      message: "Scaffolding received your canvas input. Implement Gemini API call to return real strokes/text!",
      commands: [
        {
          tool: "write_text",
          x: 10000,
          y: 10000,
          text: "Scaffolded Response: Add your Gemini implementation in backend/server.js!",
          fontSize: 16,
          maxWidth: 400,
          lineHeight: 1.35
        }
      ]
    });
  } catch (error) {
    console.error("Error processing Canvas AI request:", error);
    res.status(500).json({ error: "Internal Server Error", detail: error.message });
  }
});

// Start listening
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
