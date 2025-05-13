import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './PredictPage.css';

export default function PredictPage() {
  const [file, setFile] = useState(null);
  const [history, setHistory] = useState([]);
  const [predictionResult, setPredictionResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    return () => {
      // Cleanup previews on unmount
      if (preview) URL.revokeObjectURL(preview);
      history.forEach(entry => URL.revokeObjectURL(entry.image));
    };
    // Only run on unmount
  }, []);

  const validateFile = file => {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];

    if (!allowed.includes(file.type)) {
      throw new Error('Upload only JPEG or PNG images.');
    }
    if (file.size > maxSize) {
      throw new Error('Image must be smaller than 5 MB.');
    }
  };

  const handleFileChange = e => {
    const f = e.target.files[0];
    if (!f) return;

    try {
      validateFile(f);
      setFile(f);
      setError(null);
      setPreview(URL.createObjectURL(f));
    } catch (err) {
      setError(err.message);
      setFile(null);
      setPreview(null);
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!file) {
      setError('Please select an image first.');
      return;
    }

    setLoading(true);
    setError(null);

    const form = new FormData();
    form.append('image', file);

    try {
      // POST to `/upload` and let CRA proxy it to your backend on port 5000
      const { data } = await axios.post('/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (data.message === 'Prediction saved') {
        const imageUrl = URL.createObjectURL(file);
        const entry = {
          image: imageUrl,
          label: data.data.result,
          timestamp: new Date().toLocaleString(),
        };
        setHistory(prev => [entry, ...prev]);
        setPredictionResult(data.data.result);
      } else {
        throw new Error(data.message || 'Unknown server response');
      }
    } catch (err) {
      if (err.code === 'ERR_NETWORK') {
        setError('Cannot connect to the server. Is it running on port 5000?');
      } else if (err.response) {
        setError(`Server error: ${err.response.data?.message || err.response.statusText}`);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
      setFile(null);
      setPreview(null);
    }
  };

  return (
    <div
      className="predict-page-wrapper"
      style={{
        backgroundImage: 'url("/img4.jpg")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: '100vh',
        padding: '2rem 0',
      }}
    >
      <div className="white-box">
        <div className="box-header logo-only">
          <div className="logo">✈️ Aerial Vehicle Detector</div>
        </div>

        <div className="box-body">
          <h1>Snap. Upload. Detect</h1>
          <p>Upload an image to classify it as Military, Civilian, UAV or Unknown</p>

          <form onSubmit={handleSubmit} className="upload-form">
            <label htmlFor="file-upload" className="drop-box">
              {preview ? (
                <div className="preview-container">
                  <img src={preview} alt="Preview" className="preview-image" />
                  <p>{file.name}</p>
                </div>
              ) : (
                '📁 Drop an image here or click to upload'
              )}
              <input
                type="file"
                id="file-upload"
                accept="image/jpeg,image/png,image/jpg"
                onChange={handleFileChange}
                hidden
              />
            </label>
            <button
              type="submit"
              className="submit-btn"
              disabled={loading || !file}
            >
              {loading ? '🚀 Predicting...' : '🚀 Predict'}
            </button>
          </form>

          {error && <div className="error-message">{error}</div>}

          {predictionResult && (
            <div className="prediction-result" style={{ margin: '0 auto' }}>
              <h3>Prediction Result</h3>
              <p className="result-text">
                {predictionResult.split('\n').filter(Boolean).pop()}
              </p>
            </div>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="history-box">
          <h2>Prediction History</h2>
          <div className="history-table-container">
            <table>
              <thead>
                <tr>
                  <th>Image</th>
                  <th>Prediction</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, idx) => (
                  <tr key={idx}>
                    <td>
                      <img src={entry.image} alt="Prediction" className="history-img" />
                    </td>
                    <td>{entry.label.split('\n').filter(Boolean).pop()}</td>
                    <td>{entry.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
