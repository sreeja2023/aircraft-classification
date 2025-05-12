// server.js
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

// ─── Environment ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/yolo_predictions';

// ─── MongoDB Setup ─────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected:', MONGO_URI))
.catch(err => console.error('MongoDB connection error:', err));

// ─── Express App ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── Multer Setup ──────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
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
  py.stdout.on('data', data => (output += data.toString()));
  py.stderr.on('data', data => console.error(`Python error: ${data}`));

  py.on('close', async code => {
    if (code !== 0) {
      return res.status(500).json({ error: `Python exited with code ${code}` });
    }

    const cleaned = output.replace(/^Detections:\s*/i, '').trim();
    try {
      const record = await Prediction.create({ imagePath: imgPath, result: cleaned });
      res.json({ message: 'Prediction saved', data: record });
    } catch (err) {
      console.error('DB save error:', err);
      res.status(500).json({ error: 'Failed to save prediction', details: err });
    }
  });
});

// ─── Serve React in Production ─────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../frontend/build');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// ─── Start Server ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
