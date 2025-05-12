// backend/server.js
require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const mongoose = require("mongoose");
const path = require("path");
const cors = require("cors");
const fs = require("fs");

// ─── Configuration ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI environment variable is required");
  process.exit(1);
}

// ─── MongoDB Setup ─────────────────────────────────────────────────────────────
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ─── Prediction Schema ─────────────────────────────────────────────────────────
const predictionSchema = new mongoose.Schema({
  imagePath: String,
  result: String,
  timestamp: { type: Date, default: Date.now },
});
const Prediction = mongoose.model("Prediction", predictionSchema);

// ─── Express App ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── Uploads Folder ────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
app.use("/uploads", express.static(UPLOADS_DIR));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// ─── History Endpoint ──────────────────────────────────────────────────────────
app.get("/history", async (req, res) => {
  try {
    const items = await Prediction.find()
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── File Upload & Predict ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_, file, cb) =>
    cb(null, `${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage });

app.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const fullPath = path.join(UPLOADS_DIR, req.file.filename);
  const py = spawn("python3", ["pred.py", fullPath]);

  let output = "";
  py.stdout.on("data", (d) => (output += d.toString()));
  py.stderr.on("data", (d) => console.error("🐍", d.toString()));

  py.on("close", async (code) => {
    if (code !== 0) {
      return res
        .status(500)
        .json({ error: `Python exited with code ${code}` });
    }
    const resultText = output.replace(/^Detections:\s*/i, "").trim();
    try {
      const record = await Prediction.create({
        imagePath: req.file.filename,
        result: resultText,
      });
      res.json({ data: record });
    } catch (err) {
      res.status(500).json({ error: "DB save error", details: err.message });
    }
  });
});

// ─── Serve React in Production ──────────────────────────────────────────────────
const clientBuildPath = path.resolve(__dirname, "../frontend/build");
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  // any GET that isn't /api or /uploads/* falls back to React
  app.get("*", (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"));
  });
}

// ─── Start Server ───────────────────────────────────────────────────────────────
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
