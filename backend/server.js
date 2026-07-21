import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

//require('dotenv').config()
import dotenv from "dotenv";

dotenv.config({
    path: './.env'
})

const app = express();


const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (like Postman)
    if (!origin) return callback(null, true);

    if (
      origin.includes("vercel.app") ||
      origin.includes("localhost")
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
};

// ✅ Apply CORS middleware
app.use(cors(corsOptions));
//configuratios!!!!!!!!!!!!!!!!!!1
app.use(express.json({limit: "10mb"}))
app.use(express.urlencoded({extended: true, limit: "10mb"}))
app.use(express.static("public"))
app.use(cookieParser())

const PORT = process.env.PORT || 8000


app.on("error", (error) => {
    console.error("ERROR",error);
    throw error;
})
app.listen(PORT, () => {
    console.log(`SERVER IS LISTENING AT PORT ${PORT}`)
})

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/canvas-ai", async (req, res) => {
  // 1. Destructure user input text, the base64 canvas image, and layout dimensions
  // 2. Load Google Gen AI Client using process.env.GEMINI_API_KEY
  // 3. Prepare the multimodal prompt (text instructions + image data)
  // 4. Send to gemini-2.5-flash or gemini-2.5-pro model
  // 5. Parse and return the JSON commands to the frontend
});

export {app}