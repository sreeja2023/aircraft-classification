# Aerial Vehicle Detection  

An **AI-powered computer vision system** that leverages deep learning to automatically detect and classify aircraft into **Civilian, Military, or UAV** categories with high accuracy. The project combines **image recognition, scalable web technologies, and GPU-accelerated training** to deliver real-time classification through an intuitive web interface.  

---

## Key Features  
- Curated and processed a dataset of **60,000+ aircraft images**.  
- Implemented a **preprocessing pipeline** with OpenCV and TensorFlow for noise reduction and image normalization.  
- Built an **EfficientNet-based classifier**, achieving **90% classification accuracy**.  
- Developed a **full-stack application** with a ReactJS frontend, Node.js/Express backend, and MongoDB database.  
- Integrated a **user-friendly upload feature**, allowing users to classify their own images into **Military, Civilian, or UAV**.  
- Deployed and trained on **NVIDIA DGX A100 GPU hardware** for optimized performance.  

---

## Tech Stack  
- **Machine Learning / CV:** TensorFlow, OpenCV, EfficientNet  
- **Frontend:** ReactJS  
- **Backend:** Node.js, Express  
- **Database:** MongoDB  
- **Hardware:** NVIDIA DGX A100  

---

## Setup  

### 1. Clone the repository  
```bash
git clone https://github.com/Vyshhh/AerialVehicle_Detection.git
cd AerialVehicle_Detection
```
### 2. setting backend up
```bash
cd backend
npm install
node server.js
```
### 3. setting front end 
```bash
cd frontend
npm install
npm start
```
