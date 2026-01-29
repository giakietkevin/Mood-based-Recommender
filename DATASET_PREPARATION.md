# 🎤 Dataset Preparation Guide - RVC Training

## 🎯 Mục Tiêu
Chuẩn bị **10-30 phút audio** giọng hát sạch (clean vocals) để train RVC model.

---

## 📋 Requirements

### ✅ Audio Quality:
```
✓ Format: WAV (recommended) hoặc MP3
✓ Sample Rate: 44.1kHz hoặc 48kHz
✓ Bit Depth: 16-bit minimum, 24-bit preferred
✓ Channels: Mono (1 channel)
✓ Clean vocals: NO background music
✓ No reverb/effects (dry vocals preferred)
✓ Clear pronunciation
✓ Consistent volume
```

### ✅ Duration:
```
Minimum: 10 minutes  → Quality: 70%
Good: 20 minutes     → Quality: 80%
Best: 30+ minutes    → Quality: 90%
```

---

## 🎵 3 Cách Lấy Clean Vocals

### **Option 1: Tự Thu Âm** (Best Quality)

**Tools cần:**
- Microphone (phone mic OK, USB mic better)
- Audacity (FREE)
- Quiet room

**Steps:**
1. Download Audacity: https://www.audacityteam.org/
2. Record yourself singing:
   - 10-15 songs (đủ thể loại)
   - Different tempos
   - Different emotions
3. Export as WAV 44.1kHz

**Pros:**
- ✅ 100% clean
- ✅ Your unique voice
- ✅ Best control

**Cons:**
- ❌ Need recording setup
- ❌ Time consuming

---

### **Option 2: Extract từ Bài Hát** ⭐ RECOMMENDED

**Tool: UVR5 (Ultimate Vocal Remover)**

**Download FREE:**
https://ultimatevocalremover.com/

**Steps:**

1. **Install UVR5**
   - Download & Install
   - Free, no signup required

2. **Prepare Songs**
   ```
   - Download 5-10 Vietnamese songs (MP3/WAV)
   - Diverse styles: Pop, Ballad, Rap, etc.
   - Clear vocals preferred
   ```

3. **Extract Vocals**
   ```
   a) Open UVR5
   b) Select Model: "UVR-MDX-NET Main" (best quality)
   c) Drag & drop songs
   d) Click "Start Processing"
   e) Wait 2-5 mins per song
   f) Output: song_Vocals.wav
   ```

4. **Clean Up (Optional)**
   ```
   - Use Audacity to:
     * Remove silence at start/end
     * Normalize volume
     * Remove noise (if any)
   ```

**Pros:**
- ✅ High quality separation
- ✅ Fast (2-5 mins per song)
- ✅ FREE
- ✅ No recording needed

**Cons:**
- ❌ May have artifacts
- ❌ Not 100% clean (90-95%)

---

### **Option 3: Download Datasets** (Quick Start)

**Free Vietnamese Vocal Datasets:**

1. **OpenSLR** (Speech datasets)
   - Link: https://www.openslr.org/
   - Vietnamese speech (not singing, but works)
   - FREE, open-source

2. **Hugging Face Datasets**
   - Search: "Vietnamese singing" or "Vietnamese vocals"
   - Link: https://huggingface.co/datasets
   - FREE, community-contributed

3. **YouTube Audio**
   - Use youtube-dl to download
   - Extract vocals with UVR5
   - ⚠️ Check copyright!

**Pros:**
- ✅ No recording needed
- ✅ Fast download
- ✅ Large variety

**Cons:**
- ❌ May be low quality
- ❌ Copyright issues
- ❌ Not your voice

---

## 📁 Organize Dataset

### Folder Structure:
```
dataset/
  └── raw/
      ├── song1_vocals.wav
      ├── song2_vocals.wav
      ├── song3_vocals.wav
      ├── song4_vocals.wav
      └── song5_vocals.wav

Total: 10-30 minutes
```

### File Naming:
```
✅ Good:
   ballad_1.wav
   pop_2.wav
   rap_3.wav

❌ Bad:
   !!!song.wav
   track (1).wav
   bài hát.wav  (no Vietnamese characters)
```

---

## 🔧 Audio Preprocessing

### Using Audacity (FREE):

1. **Normalize Volume**
   ```
   Effect → Normalize
   ✓ Remove DC offset
   ✓ Normalize peak to -1.0 dB
   ```

2. **Remove Silence**
   ```
   Effect → Truncate Silence
   Level: -40 dB
   Duration: 1 second
   ```

3. **Noise Reduction** (if needed)
   ```
   a) Select noise profile (silent part)
   b) Effect → Noise Reduction → Get Noise Profile
   c) Select all
   d) Effect → Noise Reduction → OK
   ```

4. **Convert to Mono**
   ```
   Tracks → Mix → Mix Stereo Down to Mono
   ```

5. **Resample to 44.1kHz**
   ```
   Tracks → Resample → 44100 Hz
   ```

6. **Export**
   ```
   File → Export → Export Audio
   Format: WAV (Microsoft)
   Encoding: Signed 16-bit PCM
   ```

---

## ✅ Quality Checklist

Before training, verify:

- [ ] Total duration: 10-30 minutes ✅
- [ ] All files: WAV format ✅
- [ ] Sample rate: 44.1kHz or 48kHz ✅
- [ ] Channels: Mono ✅
- [ ] No silence >2 seconds ✅
- [ ] No clipping (peaks not at 0 dB) ✅
- [ ] Clear vocals (no heavy effects) ✅
- [ ] Diverse content (different songs/styles) ✅
- [ ] Consistent volume across files ✅

---

## 🎯 Quick Start Examples

### Example 1: 10-Minute Dataset (Fast)
```
5 songs × 2 minutes each = 10 minutes
Train time: ~1 hour
Quality: 70-75%
Good for: Testing, prototyping
```

### Example 2: 20-Minute Dataset (Recommended)
```
10 songs × 2 minutes each = 20 minutes
Train time: ~2 hours
Quality: 75-85%
Good for: Production use
```

### Example 3: 30-Minute Dataset (Best)
```
15 songs × 2 minutes each = 30 minutes
Train time: ~3 hours
Quality: 85-95%
Good for: Professional quality
```

---

## 📊 Dataset Diversity Tips

### ✅ Include Variety:

**Styles:**
- Ballad (slow, emotional)
- Pop (medium, catchy)
- Rap (fast, rhythmic)
- Rock (powerful)

**Pitch Range:**
- Low notes
- Mid notes
- High notes

**Emotions:**
- Happy
- Sad
- Energetic
- Calm

**Tempos:**
- Slow (60-80 BPM)
- Medium (90-120 BPM)
- Fast (130-160 BPM)

---

## 🛠️ Tools Summary

| Tool | Purpose | Cost | Link |
|------|---------|------|------|
| **UVR5** | Vocal extraction | FREE | https://ultimatevocalremover.com/ |
| **Audacity** | Audio editing | FREE | https://www.audacityteam.org/ |
| **ffmpeg** | Format conversion | FREE | https://ffmpeg.org/ |
| **Colab** | Training | FREE | https://colab.research.google.com/ |

---

## 🚀 Next Steps

1. **Chuẩn bị dataset** (this guide) ✅
2. **Upload lên Colab** → See `RVC_TRAINING_COLAB.ipynb`
3. **Train model** (2-3 hours) → Colab notebook
4. **Download model** → Get .pth and .index files
5. **Integrate** → Put in `models/rvc/` folder
6. **Test** → Generate music with REAL singing voice! 🎤

---

## 💡 Pro Tips

1. **More data = Better quality**
   - 10 mins: OK
   - 20 mins: Good
   - 30+ mins: Excellent

2. **Quality > Quantity**
   - Clean vocals better than more noisy vocals

3. **Diversity helps**
   - Different styles, pitches, emotions

4. **Preprocessing matters**
   - Normalize, remove silence, reduce noise

5. **Test as you go**
   - Train with 10 mins first
   - Add more if needed

---

**Ready to prepare your dataset? Let's go! 🎵**
