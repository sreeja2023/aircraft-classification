// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── DATABASE ──────────────────────────────────────────────────────────────────
// Make sure you've set DATABASE_URL in Render's Environment settings!
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

// On Render, SSL is required by default for Postgres
const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test & create a table if missing
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS predictions (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Postgres table ready');
  } catch (err) {
    console.error('❌ Postgres error:', err);
    process.exit(1);
  }
})();

// ─── FILE UPLOAD ────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
    filename: (req, file, cb) => {
      // give each file a timestamp‐prefixed name
      const name = `${Date.now()}__${file.originalname}`;
      cb(null, name);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ─── API ROUTES ────────────────────────────────────────────────────────────────
app.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  // TODO: integrate your real ML model here instead of "dummy"
  const fakeLabel = ['Military','Civilian','UAV','Unknown'][Math.floor(Math.random()*4)];
  
  try {
    await pool.query(
      'INSERT INTO predictions(filename,label) VALUES($1,$2)',
      [req.file.filename, fakeLabel]
    );
    return res.json({
      message: 'Prediction saved',
      data: { result: fakeLabel }
    });
  } catch (err) {
    console.error('DB insert error:', err);
    return res.status(500).json({ message: 'Database error' });
  }
});

// ─── SERVE REACT APP ───────────────────────────────────────────────────────────
// point to your React build output
const buildPath = path.join(__dirname, '../frontend/build');
app.use(express.static(buildPath));

// all remaining requests return index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// ─── START ─────────────────────────────────────────────────────────────────────
// Render will set process.env.PORT for you. Locally it'll default to 5000.
const PORT = parseInt(process.env.PORT, 10) || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
