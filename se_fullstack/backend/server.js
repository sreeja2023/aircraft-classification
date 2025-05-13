// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const { Pool } = require('pg');

// ─── Environment ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('✖️  DATABASE_URL environment variable is required');
  process.exit(1);
}

// ─── Postgres Setup ────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS predictions (
      id SERIAL PRIMARY KEY,
      image_path TEXT NOT NULL,
      result TEXT NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT now()
    );
  `);
  console.log('✔️  Postgres table ready');
}

// ─── Express App ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(require('cors')());

// ─── Multer Setup ──────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) => {
    const name = 'uploaded_' + Date.now() + path.extname(file.originalname);
    cb(null, name);
  }
});
const upload = multer({ storage });

// ─── Prediction Route ──────────────────────────────────────────────────────────
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const imgPath = req.file.path;
  const py = spawn('python', ['pred.py', imgPath]);

  let output = '';
  py.stdout.on('data', data => output += data.toString());
  py.stderr.on('data', data => console.error(`🐍 Python error: ${data}`));

  py.on('close', async code => {
    if (code !== 0) {
      return res.status(500).json({ error: `Python exited with code ${code}` });
    }
    const cleaned = output.replace(/^Detections:\s*/i, '').trim();
    try {
      const { rows } = await pool.query(
        `INSERT INTO predictions(image_path, result)
         VALUES($1, $2)
         RETURNING *;`,
        [imgPath, cleaned]
      );
      res.json({ message: 'Prediction saved', data: rows[0] });
    } catch (err) {
      console.error('💾 DB insert error:', err);
      res.status(500).json({ error: 'Failed to save prediction' });
    }
  });
});

// ─── Serve React in Production ───────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../frontend/build');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// ─── Start Server ───────────────────────────────────────────────────────────────
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server listening on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to initialize database:', err);
    process.exit(1);
  });
