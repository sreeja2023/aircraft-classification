// server.js
require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const { spawn } = require('child_process');
const path    = require('path');
const cors    = require('cors');
const { Pool } = require('pg');

// ─── PICK A PORT ────────────────────────────────────────────────────────────────
// Locally: always 5000.  In production: use the RENDER‐supplied PORT env var.
const PORT =
  process.env.NODE_ENV === 'production'
    ? Number(process.env.PORT)
    : 5000;

// ─── DATABASE URL CHECK ──────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL environment variable is required');
  process.exit(1);
}

// ─── POSTGRES POOL ───────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
pool.on('error', err => {
  console.error('🔴 Unexpected Postgres client error:', err);
  process.exit(-1);
});

// ─── EXPRESS SETUP ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── HEALTH CHECK ────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.send('OK'));

// ─── MULTER UPLOAD SETUP ─────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_, file, cb) => {
    cb(null, `upload_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// ─── PREDICTION ENDPOINT ─────────────────────────────────────────────────────────
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const imgPath = req.file.path;

  // Call your YOLO script
  const py = spawn('python3', ['pred.py', imgPath]);
  let output = '';
  py.stdout.on('data', chunk => (output += chunk.toString()));
  py.stderr.on('data', chunk => console.error('🔴 Python error:', chunk.toString()));

  py.on('close', async code => {
    if (code !== 0) {
      return res.status(500).json({ error: `Prediction script exited with code ${code}` });
    }
    const result = output.replace(/^Detections:\s*/i, '').trim();

    // Store in Postgres
    try {
      const { rows } = await pool.query(
        `INSERT INTO predictions (image_path, result)
         VALUES ($1, $2)
         RETURNING id, image_path, result, timestamp`,
        [imgPath, result]
      );
      res.json(rows[0]);
    } catch (err) {
      console.error('🔴 DB insert error:', err);
      res.status(500).json({ error: 'Failed to save prediction' });
    }
  });
});

// ─── SERVE REACT IN PRODUCTION ───────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.resolve(__dirname, '../frontend/build');
  app.use(express.static(clientBuild));
  app.get('*', (_, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// ─── START SERVER ────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
