// server.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

// ─── Environment ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/yolo_predictions';

// ─── MongoDB Connection ─────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log(`MongoDB connected: ${MONGO_URI}`))
  .catch(err => console.error('MongoDB connection error:', err));

// ─── Mongoose Schema & Model ───────────────────────────────────────────────────
const predictionSchema = new mongoose.Schema({
  imagePath: String,
  result: String,
  timestamp: { type: Date, default: Date.now }
});
const Prediction = mongoose.model('Prediction', predictionSchema);

// ─── Ensure Uploads Directory Exists ───────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ─── Express App Setup ─────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── Multer File Upload Setup ──────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const filename = `uploaded_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, filename);
  }
});
const upload = multer({ storage });

// ─── Prediction Endpoint ───────────────────────────────────────────────────────
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const imgPath = req.file.path;
  const py = spawn('python', ['pred.py', imgPath]);

  let output = '';
  py.stdout.on('data', data => output += data.toString());
  py.stderr.on('data', data => console.error(`Python error: ${data}`));

  py.on('close', async code => {
    if (code !== 0) {
      console.error(`Python process exited with code ${code}`);
      return res.status(500).json({ error: `Prediction script error (code ${code})` });
    }

    const resultText = output.replace(/^Detections:\s*/i, '').trim();
    try {
      const record = await Prediction.create({ imagePath: imgPath, result: resultText });
      return res.json({ message: 'Prediction saved', data: record });
    } catch (err) {
      console.error('DB save error:', err);
      return res.status(500).json({ error: 'Failed to save prediction' });
    }
  });
});

// ─── Serve React App in Production ─────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../frontend/build');
  app.use(express.static(clientBuildPath));
  app.get('/*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// ─── Start Server ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
