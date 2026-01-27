# 🎵 Mood-based Music Recommender AI

An intelligent mood detection and music recommendation system that analyzes your facial expression to suggest music tailored to your emotional state.

## ✨ Features

- **Real-time Mood Detection**: Uses DeepFace AI to detect emotions from your webcam (Happy, Sad, Angry, Neutral, Fear, Surprise, Disgust)
- **Smart Music Recommendations**: Automatically searches YouTube for music that matches your detected mood
- **Caching System**: Fast recommendations by caching previously searched moods
- **Web-based Interface**: Modern, user-friendly dark theme UI
- **CORS Enabled**: Full cross-origin support for seamless integration

## 🚀 Quick Start

### Prerequisites

- Python 3.8+ (tested on Python 3.12)
- Webcam access
- Internet connection

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/Mood-based-Recommender.git
cd Mood-based-Recommender
```

2. **Create a virtual environment** (optional but recommended)
```bash
python -m venv venv
venv\Scripts\activate  # On Windows
source venv/bin/activate  # On macOS/Linux
```

3. **Install dependencies**
```bash
pip install -r requirements.txt
```

### Running the Application

1. **Start the server**
```bash
uvicorn main:app --reload
```

2. **Open in browser**
```
http://127.0.0.1:8000
```

3. **Use the app**
   - Click "Start Webcam" to enable your camera
   - Capture your face to detect mood
   - Get instant music recommendations based on your emotion

## 📋 Requirements

See `requirements.txt` for all dependencies:

- **fastapi**: Web framework for building the API
- **uvicorn**: ASGI server for running FastAPI
- **deepface**: AI model for emotion detection from facial expressions
- **opencv-python**: Image processing
- **youtubesearchpython**: YouTube search integration
- **tensorflow/tf-keras**: Deep learning backend

## 🎯 How It Works

1. **Image Upload**: User captures an image from webcam
2. **Emotion Detection**: DeepFace analyzes facial expression and detects emotion
3. **Music Search**: Based on detected mood, the app searches YouTube for relevant music
4. **Caching**: Results are cached to provide instant recommendations for repeated moods
5. **Display**: Recommendations shown with title, link, thumbnail, and duration

## 🔧 API Endpoints

### GET `/`
Serves the main HTML interface

### POST `/recommend`
Accepts image file and returns mood detection + music recommendations

**Request**: `multipart/form-data` with image file
**Response**:
```json
{
  "mood": "happy",
  "recommendations": [
    {
      "title": "Song Title",
      "link": "https://youtube.com/watch?v=...",
      "thumbnail": "...",
      "duration": "4:30"
    }
  ]
}
```

## 🎨 Emotion Categories

- **Happy**: Upbeat, energetic music
- **Sad**: Melancholic, emotional songs
- **Angry**: High-energy, bass-heavy music
- **Neutral**: Chill lofi beats
- **Fear**: Calm, soothing music for relaxation
- **Surprise**: Trending, energetic hits
- **Disgust**: Breakup songs

## ⚙️ Configuration

Key environment variables in `main.py`:
- `TF_USE_LEGACY_KERAS=1`: For Python 3.12 compatibility
- `TF_ENABLE_ONEDNN_OPTS=0`: Improves stability

## 🐛 Troubleshooting

**Import Error - LocallyConnected2D**
```bash
pip install --upgrade tf-keras tensorflow
```

**SSL Certificate Error**
The app includes SSL certificate handling for YouTube searches

**Webcam Not Detected**
- Check browser permissions for camera access
- Ensure webcam driver is installed

## 📝 License

This project is open source and available for educational use.

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 👨‍💻 Author

Created with ❤️ for music lovers and AI enthusiasts
