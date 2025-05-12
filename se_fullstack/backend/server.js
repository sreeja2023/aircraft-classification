// server.js
require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const mongoose   = require('mongoose');
const multer     = require('multer');
const { spawn }  = require('child_process');
const path       = require('path');

// ─── Environment ───────────────────────────────────────────────────────────────
const PORT      = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/yolo_predictions';

// ─── MongoDB Setup ─────────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log(`✔️  MongoDB connected: ${MONGO_URI}`))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ─── Mongoose Schema ───────────────────────────────────────────────────────────
const predictionSchema = new mongoose.Schema({
  imagePath: String,
  result:    String,
  timestamp: { type: Date, default: Date.now }
});
const Prediction = mongoose.model('Prediction', predictionSchema);

// ─── Express App ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── Multer Setup ──────────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const name = `uploaded_${Date.now()}${path.extname(file.originalname)}`;
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
  // spawn your Python script (make sure pred.py is in the same folder)
  const py = spawn('python', [ path.join(__dirname, 'pred.py'), imgPath ]);

  let output = '';
  py.stdout.on('data', data => {
    output += data.toString();
  });
  py.stderr.on('data', data => {
    console.error(`🐍 Python error: ${data}`);
  });

  py.on('close', async code => {
    if (code !== 0) {
      return res.status(500).json({ error: `Python exited with code ${code}` });
    }

    const cleaned = output.replace(/^Detections:\s*/i, '').trim();
    try {
      const record = await Prediction.create({
        imagePath: imgPath,
        result:    cleaned
      });
      res.json({ message: 'Prediction saved', data: record });
    } catch (err) {
      console.error('💾 DB save error:', err);
      res.status(500).json({ error: 'Failed to save prediction', details: err.message });
    }
  });
});

// ─── Serve React in Production ─────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirname, '../frontend/build');
  app.use(express.static(clientBuildPath));

  // all other GETs not handled before will return React's index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// ─── Start Server ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
