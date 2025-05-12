// server.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const { spawnSync } = require('child_process');

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 5000;

// On Render, set this in Dashboard → your service → Environment:
//   Key:   DATABASE_URL
//   Value: postgresql://…your-credentials…@…/your_db
const MONGO_URI = process.env.DATABASE_URL;
if (!MONGO_URI) {
  console.error('❌  Missing env var DATABASE_URL');
  process.exit(1);
}

// ─── BUILD REACT (only if there's no build folder) ─────────────────────────────
const clientBuildPath = path.join(__dirname, '../frontend/build');
if (!require('fs').existsSync(clientBuildPath)) {
  console.log('🏗  No build folder found – running React build…');
  // This runs: npm install --prefix ../frontend && npm run build --prefix ../frontend
  const result = spawnSync('npm', [
    'install',
    '--prefix',
    '../frontend'
  ], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status);

  const buildResult = spawnSync('npm', [
    'run',
    'build',
    '--prefix',
    '../frontend'
  ], { stdio: 'inherit' });
  if (buildResult.status !== 0) process.exit(buildResult.status);
}

// ─── MONGOOSE ──────────────────────────────────────────────────────────────────
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('✅  MongoDB Connected'))
  .catch(err => {
    console.error('❌  MongoDB connection error:', err);
    process.exit(1);
  });

// ─── EXPRESS SETUP ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── MULTER FOR IMAGE UPLOADS ─────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) => {
    const name = `uploaded_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

// ─── PREDICTION ENDPOINT ──────────────────────────────────────────────────────
const Prediction = mongoose.model('Prediction', new mongoose.Schema({
  imagePath: String,
  result:    String,
  timestamp: { type: Date, default: Date.now }
}));

app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const imgPath = req.file.path;
  const py = spawnSync('python', ['pred.py', imgPath]);
  if (py.status !== 0) {
    console.error(py.stderr.toString());
    return res.status(500).json({ error: 'Python error' });
  }
  const cleaned = py.stdout.toString().replace(/^Detections:\s*/i, '').trim();
  Prediction.create({ imagePath: imgPath, result: cleaned })
    .then(record => res.json({ message: 'Prediction saved', data: record }))
    .catch(err => {
      console.error('DB save error:', err);
      res.status(500).json({ error: 'Failed to save prediction' });
    });
});

// ─── SERVE React FRONTEND ──────────────────────────────────────────────────────
app.use(express.static(clientBuildPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// ─── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀  Server listening on port ${PORT}`);
});
