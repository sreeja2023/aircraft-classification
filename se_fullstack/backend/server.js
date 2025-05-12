// server.js
require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const { spawn } = require('child_process');
const { Pool } = require('pg');
const path    = require('path');
const cors    = require('cors');

// ─── Configuration ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

// ─── Postgres Pool ──────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});
pool.on('error', err => {
  console.error('🛑 Unexpected PG error', err);
  process.exit(1);
});

// ─── Express Setup ──────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── Healthcheck ────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Multer (file upload) ───────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    cb(null, `uploaded_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// ─── Prediction Route ──────────────────────────────────────────────────────────
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const imgPath = req.file.path;

  // Spawn your Python script
  const py = spawn('python', ['pred.py', imgPath]);
  let output = '';
  py.stdout.on('data', chunk => (output += chunk.toString()));
  py.stderr.on('data', err => console.error('Python error:', err.toString()));

  py.on('close', async code => {
    if (code !== 0) {
      return res.status(500).json({ error: `Prediction script exited with ${code}` });
    }
    const cleaned = output.replace(/^Detections:\s*/i, '').trim();
    try {
      const { rows } = await pool.query(
        `INSERT INTO predictions (image_path, result) VALUES ($1,$2) RETURNING *`,
        [imgPath, cleaned]
      );
      res.json({ message: 'Prediction saved', data: rows[0] });
    } catch (err) {
      console.error('DB insert error:', err);
      res.status(500).json({ error: 'Failed to save prediction' });
    }
  });
});

// ─── Serve React App ────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const buildDir = path.join(__dirname, '../frontend/build');
  app.use(express.static(buildDir));
  // All other routes serve index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(buildDir, 'index.html'));
  });
}

// ─── Start Server ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
