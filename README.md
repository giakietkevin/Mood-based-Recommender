---
title: KietSound Pro - AI Music & Film Studio
emoji: 🎵🎬
colorFrom: pink
colorTo: blue
sdk: docker
pinned: false
short_description: AI Music Studio with Mood Detection & Film Streaming
---

# 🎵 KietSound Pro - AI Music & Film Studio

An all-in-one entertainment platform featuring AI-powered music generation, facial mood-based music recommendations, and high-speed Vietnamese movie streaming.

## ✨ Key Features

### 🎬 KietFilm Player (New!)
- **Seamless Movie Streaming**: Integrated with the Open OPhim API for lightning-fast, ad-free movie streaming.
- **HLS Architecture**: Uses `HLS.js` to deliver native, high-performance video streaming without heavy backend proxies.
- **Auto-Subtitles**: All movies are pre-equipped with high-quality Vietnamese subtitles perfectly synced.
- **Smart History**: Automatically tracks your recently watched movies for easy resume/replay.

### 🎭 Mood-Based Recommendation
- **Facial Recognition**: Analyze facial emotions using DeepFace.
- **Smart Search**: DuckDuckGo-powered YouTube search based on detected mood.
- **Music & Podcast**: Support for both music and podcast recommendations.

### 🎹 AI Music Generator (Text-to-Music)
Professional-grade music generation from lyrics with:

#### 🎤 Advanced Vocal Processing
- **Multi-TTS Support**: Edge-TTS (primary) with gTTS fallback.
- **Intelligent Pitch Contouring**: Custom melodic patterns tailored for Rap, Ballad, EDM, Rock, and more.
- **Vibrato Effects**: Natural vibrato for Ballad, Soul, Jazz styles.
- **12+ Voice Profiles**: Wide range of Male/Female regional variations.

#### 🎵 Studio-Grade Audio Processing
- **Time Stretching**: Rubberband-powered tempo matching.
- **Multi-Band Compression**: Adaptive compression per style.
- **Style-Specific EQ**: Optimized frequency curves.
- **Adaptive Reverb & Delay**: Context-aware spatial effects.

#### 🎼 Intelligent Music Structure
- **Auto Song Structure**: Intro → Verse → Chorus → Bridge → Outro.
- **Hook Detection**: Automatic chorus identification.
- **Adaptive Spacing**: Style-specific breathing room.

#### 🎚️ Professional Mixing
- **Auto-Ducking**: Beat volume reduction during vocals.
- **Gain Staging**: Style & mood-aware volume balance.
- **Mastering Chain**: Peak normalization, soft clipping, final limiting.
- **320kbps MP3 Export**: High-quality audio output.

### 🎨 70+ Music Styles Supported
- Chill, Urban, Electronic, Rock, Pop & More

### 🎭 10+ Mood Profiles
Joy, Sadness, Anger, Fear, Surprise, Anticipation, Calmness, Romantic, Nostalgia, Triumph.

## 🛠️ Technical Stack

### Backend
- **FastAPI**: High-performance async web framework
- **DeepFace**: Facial emotion detection
- **OPhim API**: Comprehensive Vietnamese movie streaming
- **librosa & pydub**: Audio analysis and manipulation
- **pyrubberband & pedalboard**: Pitch shifting, time stretching, effects
- **edge-tts**: High-quality text-to-speech

### Frontend
- **TailwindCSS**: Modern UI framework
- **Vanilla JS**: Lightweight, zero-dependency components
- **HLS.js**: Lightning-fast `.m3u8` video streaming
- **YouTube IFrame API**: Embedded playback
- **Firebase Auth**: Google OAuth integration

## 🚀 Installation

### Requirements
- Python 3.10+
- FFmpeg (included in repo)
- 4GB RAM minimum (8GB recommended)

### Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Run server
python main.py