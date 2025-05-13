require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_BUILD_PATH = path.join(__dirname, '../frontend/build');

// --- Postgres setup ---
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Make sure the table exists
;(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS predictions (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  console.log('✅ Postgres table ready');
})().catch(err => {
  console.error('Postgres setup error:', err);
  process.exit(1);
});

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(express.static(CLIENT_BUILD_PATH));

// Multer setup (storing uploads in memory)
const upload = multer({ storage: multer.memoryStorage() });

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// --- File upload & prediction stub ---
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // TODO: run your ML model here on req.file.buffer
    // For now we’ll just pick a dummy label:
    const dummyResult = 'Unknown';

    // Store in Postgres
    await pool.query(
      `INSERT INTO predictions(filename, result) VALUES($1,$2)`,
      [req.file.originalname, dummyResult]
    );

    res.json({
      message: 'Prediction saved',
      data: { result: dummyResult }
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- Serve React for all other routes ---
app.get('*', (req, res) => {
  res.sendFile(path.join(CLIENT_BUILD_PATH, 'index.html'));
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
