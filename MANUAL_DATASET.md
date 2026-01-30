# 📥 MANUAL DATASET DOWNLOAD GUIDE

## ⚠️ Automatic download không hoạt động?

Đừng lo! Có 3 cách manual đơn giản:

---

## 🎯 **OPTION 1: YouTube + UVR5 (KHUYẾN NGHỊ - DỄ NHẤT!)**

### **⏱️ Thời gian: 30-45 phút**
### **✅ Chất lượng: Tốt nhất cho singing voice**

### **Bước 1: Download UVR5**
```
Link: https://ultimatevocalremover.com/
→ Click "Download" 
→ Chọn version cho Windows/Mac/Linux
→ Install (FREE, không cần đăng ký)
```

### **Bước 2: Tìm Vietnamese songs**
Tìm 5-10 bài hát Vietnamese trên:
- YouTube (V-Pop, Ballad, Rap)
- Spotify (record hoặc download)
- SoundCloud

**Khuyến nghị:**
```
✓ Chọn giọng ca rõ ràng
✓ Chọn nhiều style khác nhau
✓ Tránh bài có auto-tune quá nhiều
✓ Total: 10-20 phút audio
```

### **Bước 3: Download audio**
Dùng một trong các tools:
- **youtube-dl**: `youtube-dl -x --audio-format wav [URL]`
- **4K Video Downloader**: https://www.4kdownload.com/
- **Online converter**: https://ytmp3.cc/

### **Bước 4: Extract vocals với UVR5**
```
1. Mở UVR5
2. Drag & drop các file audio vào
3. Model: chọn "MDX-Net"
4. Click "Start Processing"
5. Đợi 2-5 phút/bài
6. File output: [song_name]_Vocals.wav
```

### **Bước 5: Organize files**
```powershell
# Tạo folder
mkdir dataset\raw

# Copy tất cả *_Vocals.wav vào
# Đổi tên nếu muốn:
dataset\raw\song1_vocals.wav
dataset\raw\song2_vocals.wav
...
```

### **✅ DONE!**
```
Total files: 5-10 files
Total duration: 10-20 minutes
Quality: ⭐⭐⭐⭐⭐
```

---

## 🎯 **OPTION 2: VIVOS từ Google Drive**

### **⏱️ Thời gian: 15-30 phút**
### **✅ Chất lượng: Tốt cho speech**

### **Bước 1: Download**
```
Link: https://drive.google.com/drive/folders/1-3XQAQ5bQl3_i0nGaEPjHT5gvdVqaFwZ

Backup links:
- https://ailab.hcmus.edu.vn/datasets
- https://github.com/vietnlp/datasets
```

### **Bước 2: Extract**
```powershell
# Nếu file là vivos.tar.gz:
tar -xzf vivos.tar.gz

# Hoặc dùng 7-Zip (Windows):
# Right-click → 7-Zip → Extract Here
```

### **Bước 3: Organize**
```powershell
# Tạo folder
mkdir dataset\raw

# Copy WAV files
# Từ: vivos\train\waves\**\*.wav
# Đến: dataset\raw\
```

### **Bước 4: Select subset** (Optional)
Chọn ~200-300 files (đủ cho 10-15 mins)
```python
python
>>> import shutil
>>> from pathlib import Path
>>> files = list(Path("vivos/train").rglob("*.wav"))[:300]
>>> for f in files: shutil.copy(f, "dataset/raw/")
```

### **✅ DONE!**

---

## 🎯 **OPTION 3: Common Voice**

### **⏱️ Thời gian: 20-40 phút**
### **✅ Chất lượng: Tốt, nhiều giọng**

### **Bước 1: Sign up**
```
1. Visit: https://commonvoice.mozilla.org/vi
2. Sign up (FREE, email only)
3. Confirm email
```

### **Bước 2: Download**
```
1. Go to: https://commonvoice.mozilla.org/vi/datasets
2. Click "Download"
3. Select: "Vietnamese (vi)"
4. Format: "Single file" (TSV + MP3)
5. Download (~2-5GB)
```

### **Bước 3: Extract & organize**
```powershell
# Extract zip
# Sẽ có:
# - clips\ (folder chứa MP3)
# - train.tsv (metadata)

# Convert MP3 to WAV (if needed)
# Dùng ffmpeg:
cd clips
for %f in (*.mp3) do ffmpeg -i "%f" "..\dataset\raw\%~nf.wav"
```

### **Bước 4: Select subset**
Chọn ~200-400 files từ clips/

### **✅ DONE!**

---

## 📊 **SO SÁNH 3 OPTIONS:**

| Tiêu chí | YouTube+UVR5 | VIVOS | Common Voice |
|----------|--------------|-------|--------------|
| **Dễ dàng** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Chất lượng cho singing** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Thời gian** | 30-45 mins | 15-30 mins | 20-40 mins |
| **Dung lượng** | Custom | ~2GB | ~2-5GB |
| **Requires signup** | ❌ | ❌ | ✅ |
| **Khuyến nghị** | ✅ **BEST** | OK | Good |

---

## 🎯 **KHUYẾN NGHỊ:**

### **Cho Singing Voice (HÁT):**
→ **YouTube + UVR5** ← Best choice!

**Lý do:**
- Data từ bài hát thật → singing style
- Có melody, rhythm tự nhiên
- Có vibrato, breath sounds
- Quality cao nhất

### **Cho Speech-to-Singing (ĐỌC → HÁT):**
→ **VIVOS hoặc Common Voice** ← OK

**Lý do:**
- Data từ speech → cần convert nhiều hơn
- Không có melody/rhythm sẵn
- Model phải học từ đầu

---

## ✅ **VERIFICATION - KIỂM TRA DATASET**

### **Check trước khi train:**

```powershell
# 1. Count files
dir dataset\raw\*.wav | Measure-Object

# Should see: 5-300+ files

# 2. Check total size
dir dataset\raw | Measure-Object -Property Length -Sum

# Should see: 100MB - 2GB

# 3. Play một file test
# Windows:
start dataset\raw\[file_name].wav

# Mac/Linux:
afplay dataset\raw\[file_name].wav
```

### **Requirements:**
```
✓ Format: WAV (hoặc MP3)
✓ Sample rate: 16kHz - 48kHz (tự động convert)
✓ Channels: Mono or Stereo (tự động convert)
✓ Duration: 10+ phút total
✓ Quality: Clean vocals (no heavy background music)
```

---

## 🚀 **NEXT STEPS:**

```
✅ Dataset ready in: dataset/raw/

Next:
1. Upload to Google Drive (for Colab)
2. Open RVC_TRAINING_COLAB.ipynb
3. Follow training steps
4. Done!
```

---

## 💡 **TIPS:**

### **Tip 1: Mix datasets**
```
Tốt nhất: Kết hợp cả 3!
- 5 bài từ YouTube (singing)
- 50 clips từ VIVOS (speech)
- 50 clips từ Common Voice (diverse)
→ Kết quả: More versatile voice!
```

### **Tip 2: Quality > Quantity**
```
10 phút clean vocals > 1 giờ noisy audio
```

### **Tip 3: Diverse data**
```
✓ Different tempos: fast, medium, slow
✓ Different pitches: high, mid, low  
✓ Different emotions: happy, sad, neutral
→ Better generalization!
```

### **Tip 4: Preprocessing**
```
Sau khi có dataset:
- Normalize volume (Audacity)
- Remove silence (Audacity: Truncate Silence)
- Trim edges (start/end)
→ Cleaner training!
```

---

## 🆘 **TROUBLESHOOTING:**

### **Q: File không phải WAV?**
```bash
# Convert to WAV using ffmpeg:
ffmpeg -i input.mp3 -ar 48000 -ac 1 output.wav
```

### **Q: Volume quá nhỏ/lớn?**
```bash
# Normalize using ffmpeg:
ffmpeg -i input.wav -filter:a loudnorm output.wav
```

### **Q: Có background noise?**
→ Dùng UVR5 extract lại
→ Hoặc Audacity: Effect → Noise Reduction

### **Q: File quá dài (>10 mins mỗi file)?**
```bash
# Split using ffmpeg:
ffmpeg -i long.wav -f segment -segment_time 30 -c copy output_%03d.wav
```

---

## 📞 **LINKS HỮU ÍCH:**

### **Download tools:**
- UVR5: https://ultimatevocalremover.com/
- youtube-dl: https://youtube-dl.org/
- 4K Downloader: https://www.4kdownload.com/
- ffmpeg: https://ffmpeg.org/download.html
- Audacity: https://www.audacityteam.org/

### **Datasets:**
- VIVOS: https://ailab.hcmus.edu.vn/datasets
- Common Voice: https://commonvoice.mozilla.org/vi/datasets
- Vietnamese songs: YouTube, Spotify, SoundCloud

### **Audio processing:**
- Audacity guide: https://manual.audacityteam.org/
- ffmpeg guide: https://ffmpeg.org/ffmpeg.html
- UVR5 tutorial: https://www.youtube.com/watch?v=... (search)

---

## ✅ **CHECKLIST:**

```
BEFORE STARTING:
[ ] Tool downloaded (UVR5 or 7-Zip)
[ ] Songs selected (5-10 bài) OR dataset link ready
[ ] ~2-5GB free space
[ ] Internet stable (for download)

DATASET READY WHEN:
[ ] Files in: dataset/raw/
[ ] Format: *.wav
[ ] Total: 10+ phút audio
[ ] Quality: Clean vocals
[ ] Tested: 1-2 files play OK

READY FOR TRAINING:
[ ] Dataset verified
[ ] Uploaded to Drive (if Colab)
[ ] RVC_TRAINING_COLAB.ipynb ready
[ ] GPU enabled in Colab
```

---

**DONE! SẴN SÀNG TRAIN! 🚀**

**Hãy làm theo OPTION 1 (YouTube+UVR5) để có kết quả tốt nhất!**
