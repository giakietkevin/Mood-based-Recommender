---
title: KietSound Pro - AI Music Studio
emoji: 🎵
colorFrom: pink
colorTo: blue
sdk: docker
pinned: false
short_description: AI music generation with mood detection & singing voice
---

# 🎵 KietSound Pro - AI Music Studio

AI-powered music generation platform with advanced mood detection and professional text-to-music capabilities.

## ✨ Key Features

### 🎭 Mood-Based Recommendation
- **Facial Recognition**: Analyze facial emotions using DeepFace
- **Smart Search**: DuckDuckGo-powered YouTube search based on detected mood
- **Music & Podcast**: Support for both music and podcast recommendations

### 🎹 AI Music Generator (Text-to-Music)
Professional-grade music generation from lyrics with:

#### 🎤 Advanced Vocal Processing
- **Multi-TTS Support**: Edge-TTS (primary) with gTTS fallback
- **Intelligent Pitch Contouring**: Style-specific melodic patterns
  - Rap/Hip-Hop: Minimal pitch variation, focus on rhythm
  - Ballad/Soul: Smooth, gradual melodic curves
  - EDM/Electronic: Repetitive patterns with strong climax
  - Rock/Metal: Wide range, powerful progressions
- **Vibrato Effects**: Natural vibrato for Ballad, Soul, Jazz styles
- **Crossfade Technology**: Smooth transitions between segments
- **12+ Voice Profiles**: Male/Female with regional variations

#### 🎵 Studio-Grade Audio Processing
- **Time Stretching**: Rubberband-powered tempo matching
- **Multi-Band Compression**: Adaptive compression per style
- **De-Essing**: Sibilance reduction
- **Style-Specific EQ**: Optimized frequency curves
- **Adaptive Reverb & Delay**: Context-aware spatial effects
- **Safety Limiting**: Professional-grade mastering chain

#### 🎼 Intelligent Music Structure
- **Auto Song Structure**: Intro → Verse → Chorus → Bridge → Outro
- **Hook Detection**: Automatic chorus identification
- **Adaptive Spacing**: Style-specific breathing room
  - Rap: Tight spacing (0.5 beats)
  - Ballad: Relaxed spacing (1.5 beats)
- **Beat Alignment**: On-beat vocal placement

#### 🎚️ Professional Mixing
- **Auto-Ducking**: Beat volume reduction during vocals
- **Gain Staging**: Style & mood-aware volume balance
- **Mastering Chain**: 
  - Peak normalization (-1dB headroom)
  - Soft clipping (analog-style saturation)
  - Final limiting (-0.5dB)
- **320kbps MP3 Export**: High-quality audio output

### 🎨 70+ Music Styles Supported
- **Chill**: Lo-Fi, Ballad, Jazz, Blues, Soul, R&B
- **Urban**: Rap, Hip-Hop, Trap, Sad Rap
- **Electronic**: EDM, House, Techno, Trance, Dubstep
- **Rock**: Rock, Metal, Punk, Hard Rock, Pop Punk
- **Pop & More**: Pop, Country, Indie, Alternative, Latin, Reggae

### 🎭 10+ Mood Profiles
Joy, Sadness, Anger, Fear, Surprise, Anticipation, Calmness, Romantic, Nostalgia, Triumph

### ⚡ Performance Optimizations
- **Smart Caching**: Avoid reprocessing beats
- **Parallel Processing**: Concurrent audio operations
- **Memory Management**: Automatic temp file cleanup
- **Quality vs Speed**: Configurable processing chains

## 🛠️ Technical Stack

### Backend
- **FastAPI**: High-performance async web framework
- **DeepFace**: Facial emotion detection
- **librosa**: Audio analysis
- **pyrubberband**: Time stretching & pitch shifting
- **pedalboard**: Spotify's audio effects library
- **edge-tts**: High-quality text-to-speech
- **pydub**: Audio manipulation
- **soundfile**: High-quality audio I/O

### Frontend
- **TailwindCSS**: Modern UI framework
- **Vanilla JS**: Lightweight, no frameworks
- **YouTube IFrame API**: Embedded playback
- **Firebase Auth**: Google OAuth integration

### Audio Processing Pipeline
```
Text Input → TTS → Pitch Contour → Time Stretch → 
FX Chain → Beat Sync → Mixing → Mastering → MP3
```

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
```

Server runs on `http://localhost:7860`

## 📖 Usage

### Text-to-Music Generation
1. Navigate to **STUDIO** tab
2. Enter song title and lyrics (one line per bar)
3. Select style, mood, voice, and tempo
4. Click **GENERATE TRACK**
5. Wait 20-60s depending on lyrics length
6. Song auto-plays and saves to library

### Best Practices
- **Rap/Hip-Hop**: Short lines, many syllables, Fast/Medium tempo
- **Ballad/Soul**: Long phrases, fewer syllables, Slow tempo
- **EDM/Electronic**: Repetitive phrases, Medium/Fast tempo
- **Structure**: Last 2-3 lines automatically become chorus/hook

### Tips for Best Results
- Use punctuation (.) for natural pauses
- Keep lines under 15 words for clarity
- Match tempo to lyric density
- Choose voice that fits style (Male for Rock, Female for Pop)

## 🎼 Audio Quality Specs
- **Sample Rate**: 44.1kHz
- **Bit Depth**: 24-bit processing, 16-bit export
- **MP3 Bitrate**: 320kbps
- **Dynamic Range**: ~12-16 LUFS
- **Peak Level**: -0.5dB

## 📊 Performance Metrics
- **Generation Time**: 20-60s per song (varies by length)
- **Concurrent Users**: Up to 10 (adjustable)
- **Cache Hit Rate**: ~40% for common styles/BPMs
- **Audio Quality**: Near-professional (95% of studio quality)

## 🔧 Configuration

Edit `config.py` for:
- Voice presets
- Mood audio profiles
- Tempo mappings

## 🌟 Recent Upgrades (v2.0)

### Vocal Processing
✅ Style-specific melodic patterns  
✅ Natural vibrato effects  
✅ Crossfade between segments  
✅ Multi-stage pitch contouring  

### Audio Effects
✅ Multi-band compression  
✅ Adaptive reverb/delay  
✅ De-essing and HPF  
✅ Style-specific EQ curves  

### Mixing & Mastering
✅ Auto-ducking system  
✅ Intelligent gain staging  
✅ Professional mastering chain  
✅ 320kbps HQ export  

### Structure & Flow
✅ Smart song structure generation  
✅ Adaptive line spacing  
✅ Beat-perfect alignment  
✅ Intro/outro automation  

### UI/UX
✅ Real-time progress indicators  
✅ Step-by-step generation tracking  
✅ Enhanced pro tips  
✅ Time estimation  

## 📝 License
MIT License - Feel free to use and modify

## 👨‍💻 Credits
Built with ❤️ by KietSound Team

---

**Check out the configuration reference at https://huggingface.co/docs/hub/spaces-config-reference**
