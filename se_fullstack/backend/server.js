require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const path    = require('path');
const { Pool } = require('pg');

const app = express();

// middlewares
app.use(cors());
app.use(express.json());

// file uploads
const upload = multer();

// Postgres client
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS predictions (
      id SERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ Postgres table ready');
}
initDb().catch(err => {
  console.error('DB init error:', err);
  process.exit(1);
});

// health‐check
app.get('/health', (_q, res) => res.json({ status: 'OK' }));

// prediction endpoint
app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // ── replace this with your actual model
    const options = ['Military','Civilian','UAV','Unknown'];
    const result  = options[Math.floor(Math.random()*options.length)];

    await pool.query(
      'INSERT INTO predictions(label) VALUES($1)',
      [result]
    );

    res.json({ message:'Prediction saved', data:{ result } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message:'Internal server error' });
  }
});

// serve React build in production
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../frontend/build');
  app.use(express.static(buildPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

// listen on Render’s port
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
