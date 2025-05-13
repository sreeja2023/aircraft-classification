// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// --- 1) DATABASE SETUP ---
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// On startup, ensure our table exists
const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS predictions (
      id SERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC')
    )
  `);
  console.log('✅ Postgres table ready');
};
initDb().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// --- 2) MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// Multer for handling multipart/form-data (file upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// --- 3) UPLOAD ENDPOINT ---
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // TODO: Replace this stub with your real ML prediction logic
    const stubLabel = ['Military','Civilian','UAV','Unknown'][
      Math.floor(Math.random() * 4)
    ];

    // Save prediction to DB
    await pool.query(
      'INSERT INTO predictions(label) VALUES($1)',
      [ stubLabel ]
    );

    return res.json({
      message: 'Prediction saved',
      data: { result: stubLabel }
    });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// --- 4) STATIC FILE SERVING (React build) ---
const buildPath = path.join(__dirname, '../frontend/build');
app.use(express.static(buildPath));

// Always return index.html for any other route (so React Router works)
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// --- 5) START SERVER ---
const PORT = parseInt(process.env.PORT, 10) || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
