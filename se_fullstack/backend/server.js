// server.js
require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const { spawn } = require('child_process');
const path    = require('path');
const cors    = require('cors');
const { Pool } = require('pg');

// ─── Config & Validation ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL environment variable is required');
  process.exit(1);
}

// ─── Postgres Pool ─────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
pool.on('error', err => {
  console.error('Unexpected Postgres error', err);
  process.exit(-1);
});

// ─── Express App ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.send('OK');
});

// ─── Multer for File Uploads ───────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const filename = `upload_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, filename);
  }
});
const upload = multer({ storage });

// ─── Prediction Endpoint ──────────────────────────────────────────────────────
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const imgPath = req.file.path;
  // call your Python script
  const py = spawn('python3', ['pred.py', imgPath]);

  let output = '';
  py.stdout.on('data', data => {
    output += data.toString();
  });
  py.stderr.on('data', data => {
    console.error('🔴 Python error:', data.toString());
  });

  py.on('close', async code => {
    if (code !== 0) {
      return res
        .status(500)
        .json({ error: `Prediction script exited with code ${code}` });
    }

    // clean up your script’s output
    const result = output.replace(/^Detections:\s*/i, '').trim();

    // save into Postgres
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

// ─── Serve React in Production ─────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.resolve(__dirname, '../frontend/build');
  app.use(express.static(clientBuildPath));
  // all other routes serve index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// ─── Start Server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
