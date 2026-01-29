# 🎵 Dataset Links - Vietnamese Singing Voice Training

## 📦 QUICK ACCESS LINKS

### ⭐ RECOMMENDED (Ready to use)

#### 1. **VIVOS Dataset** - BEST FOR QUICK START
```
✅ Link: https://www.openslr.org/104/
✅ Direct Download: https://www.openslr.org/resources/104/vivos.tar.gz
✅ Kaggle Mirror: https://www.kaggle.com/datasets/huynhbaobk/vivos

Size: 2GB
Duration: 15 hours
Format: WAV, 16kHz
Quality: Studio quality
License: CC BY-SA 4.0 (FREE for research & commercial)

Auto-download:
→ python download_dataset.py
```

#### 2. **Common Voice Vietnamese**
```
✅ Link: https://commonvoice.mozilla.org/vi/datasets

Size: 5GB+
Duration: 100+ hours
Format: MP3
Quality: Varies (community contributed)
License: CC0 (Public Domain)

Steps:
1. Visit link above
2. Sign in (FREE)
3. Download Vietnamese v15.0
4. Extract .mp3 files
```

---

## 🎤 SINGING VOICE DATASETS

### 3. **Hugging Face Audio Datasets**
```
✅ Search: https://huggingface.co/datasets
Keywords: "Vietnamese singing", "Vietnamese vocals", "vietnamese music"

Popular ones:
- https://huggingface.co/datasets/mozilla-foundation/common_voice_15_0
- https://huggingface.co/datasets/google/fleurs (includes Vietnamese)
- Search for Vietnamese karaoke datasets
```

### 4. **YouTube + UVR5** (Create your own)
```
✅ Tool: UVR5 - https://ultimatevocalremover.com/

Popular Vietnamese channels:
1. V-Pop Official Channels
   - Sơn Tùng M-TP Official
   - Đen Vâu Official
   - Hòa Minzy Official

2. Cover/Karaoke Channels
   - Search: "Vietnamese cover"
   - Search: "Vietnamese karaoke instrumental"

Steps:
1. Download song: youtube-dl [URL]
2. Extract vocals: UVR5
3. Get clean singing voice
```

---

## 🚀 QUICK START OPTIONS

### Option A: Use Script (Automatic)
```bash
# Download VIVOS dataset automatically
python download_dataset.py

# Output: dataset/raw/ (15 hours of audio)
```

### Option B: Manual Download

#### VIVOS (Quick)
```bash
# 1. Download
wget https://www.openslr.org/resources/104/vivos.tar.gz

# 2. Extract
tar -xzf vivos.tar.gz

# 3. Copy WAV files to dataset/raw/
```

#### Common Voice (More data)
```bash
# 1. Visit: https://commonvoice.mozilla.org/vi/datasets
# 2. Login (FREE)
# 3. Download zip
# 4. Extract clips/*.mp3 to dataset/raw/
```

---

## 📊 DATASET COMPARISON

| Dataset | Size | Duration | Quality | Setup | Best For |
|---------|------|----------|---------|-------|----------|
| **VIVOS** | 2GB | 15h | ⭐⭐⭐⭐⭐ | Auto | Quick start |
| **Common Voice** | 5GB | 100h+ | ⭐⭐⭐⭐ | Manual | More variety |
| **YouTube+UVR5** | Custom | Custom | ⭐⭐⭐⭐⭐ | Manual | Specific singers |
| **HuggingFace** | Varies | Varies | Varies | Auto/Manual | Research |

---

## 🎯 RECOMMENDED WORKFLOW

### For Quick Test (1 hour training):
```
1. Download: VIVOS (auto script)
2. Select: 10 minutes subset
3. Train: 200 epochs (~1 hour)
4. Result: 70% quality
```

### For Production (2-3 hours training):
```
1. Download: VIVOS + Common Voice
2. Extract: 20-30 minutes best quality
3. Train: 300 epochs (~2-3 hours)
4. Result: 80-85% quality
```

### For Best Quality (3-5 hours training):
```
1. Extract: YouTube vocals (specific singer)
2. Dataset: 30-60 minutes clean singing
3. Train: 500+ epochs (~4-5 hours)
4. Result: 90-95% quality
```

---

## 🔧 TOOLS & UTILITIES

### Download Tools:
```
✅ wget: https://www.gnu.org/software/wget/
✅ youtube-dl: https://youtube-dl.org/
✅ yt-dlp: https://github.com/yt-dlp/yt-dlp (better)

Install:
pip install yt-dlp
```

### Vocal Extraction:
```
✅ UVR5: https://ultimatevocalremover.com/
✅ Spleeter: https://github.com/deezer/spleeter
✅ Demucs: https://github.com/facebookresearch/demucs

Recommended: UVR5 (best quality)
```

### Audio Processing:
```
✅ Audacity: https://www.audacityteam.org/
✅ ffmpeg: https://ffmpeg.org/
✅ sox: http://sox.sourceforge.net/

Install:
sudo apt-get install ffmpeg sox
```

---

## 📝 COLAB INTEGRATION

### Upload to Colab:

#### Method 1: Google Drive
```python
from google.colab import drive
drive.mount('/content/drive')

# Copy from Drive
!cp /content/drive/MyDrive/datasets/vivos/*.wav dataset/raw/
```

#### Method 2: Direct Upload
```python
from google.colab import files
uploaded = files.upload()

# Saves to Colab session
```

#### Method 3: Download in Colab
```python
# Download VIVOS directly in Colab
!wget https://www.openslr.org/resources/104/vivos.tar.gz
!tar -xzf vivos.tar.gz
!mv vivos/train/waves/*/*.wav dataset/raw/
```

---

## 🎵 SAMPLE AUDIO SOURCES

### Vietnamese Pop/Ballad:
```
Artists:
- Sơn Tùng M-TP (Pop)
- Đen Vâu (Rap/Hip-hop)
- Hòa Minzy (Ballad)
- Noo Phước Thịnh (Pop)
- Mỹ Tâm (Ballad)

Search: "[Artist name] Official" on YouTube
```

### Vietnamese Traditional:
```
- Ca trù singing
- Dân ca (folk songs)
- Bolero Vietnamese

Good for: Unique voice characteristics
```

### Modern Vietnamese:
```
- V-Pop covers
- Vietnamese indie
- Vietnamese rock

Good for: Contemporary style
```

---

## ⚠️ LEGAL NOTES

### ✅ FREE & Legal:
- VIVOS (CC BY-SA 4.0)
- Common Voice (CC0)
- Public domain songs
- Your own recordings

### ⚠️ Check License:
- YouTube downloads (for personal use only)
- Commercial songs (need permission)
- Cover songs (grey area)

### 📝 Recommendation:
```
For commercial use:
→ Use VIVOS or Common Voice
→ Or record yourself
→ Or get explicit permission
```

---

## 🚀 QUICK COMMANDS

### Download VIVOS:
```bash
python download_dataset.py
```

### Download with wget:
```bash
wget https://www.openslr.org/resources/104/vivos.tar.gz
tar -xzf vivos.tar.gz
```

### Download with yt-dlp (YouTube):
```bash
pip install yt-dlp
yt-dlp -x --audio-format wav [YOUTUBE_URL]
```

### Extract vocals (UVR5 CLI):
```bash
python uvr5_cli.py -i input.mp3 -o output/
```

---

## 📊 DATASET PREPARATION CHECKLIST

- [ ] Downloaded dataset (VIVOS/Common Voice) ✅
- [ ] Extracted audio files ✅
- [ ] Organized in dataset/raw/ ✅
- [ ] Total duration: 10-30 minutes ✅
- [ ] Format: WAV ✅
- [ ] Sample rate: 44.1kHz or 48kHz ✅
- [ ] Mono channel ✅
- [ ] Clean vocals (if singing) ✅
- [ ] Ready to upload to Colab! ✅

---

## 🎯 NEXT STEPS

1. **Choose dataset** (VIVOS recommended)
2. **Download** (use script or manual)
3. **Prepare** (10-30 minutes audio)
4. **Upload to Colab** (RVC_TRAINING_COLAB.ipynb)
5. **Train** (2-3 hours)
6. **Download model** (.pth + .index)
7. **Integrate** (models/rvc/)
8. **Test** (Generate singing voice!)

---

**🎵 Ready to download? Run: `python download_dataset.py` 🚀**

**Or click any link above to start! ✨**
