// server.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

// ─── Config ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/yolo_predictions';

// ─── MongoDB Connection ────────────────────────────────────────────────────────
mongoose
  .connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log(`MongoDB connected at ${MONGO_URI}`))
  .catch((err) => console.error('MongoDB error:', err));

// ─── Mongoose Schema ───────────────────────────────────────────────────────────
const predictionSchema = new mongoose.Schema({
  imagePath: String,
  result: String,
  timestamp: { type: Date, default: Date.now },
});
const Prediction = mongoose.model('Prediction', predictionSchema);

// ─── Express Setup ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── Static Uploads Serving ────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadDir));

// ─── Multer Configuration ──────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `upload_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage });

// ─── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (_req, res) => res.json({ status: 'OK' }));

// Upload & Predict
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const imgPath = req.file.path;
  const py = spawn('python', ['pred.py', imgPath], { cwd: __dirname });

  let output = '';
  py.stdout.on('data', (data) => (output += data.toString()));
  py.stderr.on('data', (data) => console.error('Python error:', data.toString()));

  py.on('close', async (code) => {
    if (code !== 0) {
      return res.status(500).json({ error: `Python exited with code ${code}` });
    }
    const result = output.replace(/^Detections:\s*/i, '').trim();
    try {
      const record = await Prediction.create({ imagePath, result });
      res.json({ message: 'Prediction saved', data: record });
    } catch (dbErr) {
      console.error('DB save error:', dbErr);
      res.status(500).json({ error: 'Failed to save prediction' });
    }
  });
});

// Fetch prediction history (most recent first)
app.get('/history', async (_req, res) => {
  try {
    const all = await Prediction.find().sort({ timestamp: -1 }).lean();
    res.json(all);
  } catch (err) {
    console.error('History fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ─── Serve React Frontend in Production ────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../frontend/build');
  app.use(express.static(buildPath));
  app.get('/*', (_req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

// ─── Start Server ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  app.get('*', (req, res) =>
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'))
  );
}

