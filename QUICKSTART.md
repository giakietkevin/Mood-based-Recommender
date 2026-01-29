# 🚀 QUICK START - KietSound Pro với Giọng Hát RVC

## ⚡ AUTO SETUP (1 Click)

### Windows:
```cmd
SETUP_AUTO.bat
```

### Linux/Mac:
```bash
chmod +x setup_auto.sh
./setup_auto.sh
```

**Chờ 5-10 phút → Done!** ✅

---

## 📋 Manual Setup (Nếu Auto Fail)

### Bước 1: Install Dependencies
```bash
pip install -r requirements.txt
```

### Bước 2: Download RVC Models
```bash
python setup_rvc.py
```

### Bước 3: Run Server
```bash
python main.py
```

### Bước 4: Open Browser
```
http://localhost:7860
```

---

## 🎤 Sử Dụng

### 1. Vào Tab STUDIO

### 2. Nhập Thông Tin:
- **Tên bài hát**: Đặt tên
- **Lời bài hát**: 
  ```
  Hôm nay trời đẹp quá.
  Em có muốn đi chơi không?
  Cùng anh dạo phố này.
  Tay trong tay em nhé.
  ```

### 3. Chọn Options:
- **Style**: Pop, Rap, Ballad, EDM, etc.
- **Mood**: Joy, Sadness, Energetic, etc.
- **Voice**: Female/Male
- **Tempo**: Fast/Medium/Slow

### 4. Click GENERATE TRACK

### 5. Chờ 30-60s → Nghe Giọng Hát! 🎵

---

## 🎯 Chất Lượng Giọng Hát

### ✅ Với RVC Models:
- Giọng hát thật (không phải TTS)
- Vibrato tự nhiên
- Breath sounds
- Emotional expression
- **Quality: 70-85%** của ca sĩ thật

### ⚠️ Không có RVC (Fallback):
- Enhanced TTS
- Simulated vibrato
- Expressive prosody
- **Quality: 50-60%** (vẫn OK)

---

## 🔧 Troubleshooting

### Lỗi: "RVC not available"
**Giải pháp:**
```bash
python setup_rvc.py
```
Nếu vẫn lỗi → App sẽ dùng enhanced TTS (vẫn chạy được)

### Lỗi: "Module not found"
**Giải pháp:**
```bash
pip install -r requirements.txt --force-reinstall
```

### Lỗi: "Download failed"
**Giải pháp:**
- Check internet connection
- Thử lại: `python setup_rvc.py`
- Hoặc dùng VPN nếu HuggingFace bị chặn

### Generation quá chậm
**Giải pháp:**
- Bình thường: 30-60s
- Nếu >2 phút → Check CPU/RAM
- Hoặc tạm thời disable RVC:
  ```python
  # Trong main.py, comment dòng:
  # from rvc_engine import get_rvc_engine
  ```

---

## 📊 System Requirements

### Minimum (Enhanced TTS):
- CPU: 2 cores
- RAM: 4GB
- Storage: 2GB
- Time: 20-40s per song

### Recommended (RVC):
- CPU: 4 cores
- RAM: 8GB
- Storage: 3GB (models + cache)
- Time: 30-60s per song

### Optimal (RVC + GPU):
- GPU: RTX 3060+ (optional)
- RAM: 16GB
- Time: 10-20s per song

---

## 🎵 Tips cho Giọng Hát Tốt Nhất

### 1. Viết Lời
- Mỗi dòng = 1 câu hát
- Không quá dài (max 15 từ/dòng)
- Dùng dấu chấm (.) để nghỉ

### 2. Chọn Style
- **Ballad/Soul**: Giọng sâu lắng, emotion
- **Pop**: Bright, catchy
- **Rap**: Flow nhanh, rhythmic
- **EDM**: Energetic, synthetic

### 3. Chọn Tempo
- **Slow**: Cho câu dài, ít từ
- **Medium**: Balanced
- **Fast**: Cho câu ngắn, nhiều từ (Rap)

### 4. Voice Type
- **Female**: Cao, sáng
- **Male**: Trầm, ấm
- **Young**: Tươi trẻ
- **Mature**: Chín chắn

---

## 🚀 Deploy Lên HuggingFace

### Bước 1: Push Code
```bash
git add .
git commit -m "Add RVC singing voice"
git push
```

### Bước 2: Đợi Build
- Build time: 15-20 phút
- Check logs: HF Space → Logs

### Bước 3: Test
- Open: https://YOUR-SPACE.hf.space
- Generate music
- Enjoy! 🎉

**Note:** 
- RVC trên HF Free tier sẽ chậm hơn (CPU only)
- Fallback vẫn hoạt động tốt
- Upgrade HF PRO ($9/mo) nếu cần GPU

---

## 🎓 Advanced: Train Custom Voice

### Nếu muốn giọng ca sĩ cụ thể:

1. **Prepare Dataset**
   - 10-30 phút audio sạch
   - Clean vocals (no music)
   - 44.1kHz, mono

2. **Train on Google Colab** (FREE)
   - Search: "RVC training colab"
   - Upload audio
   - Train 1-2 giờ
   - Download model

3. **Integrate Model**
   ```bash
   # Copy model vào:
   models/rvc/custom_voice.pth
   
   # Update rvc_engine.py:
   model_name = "custom_voice"
   ```

4. **Done!**

---

## 💡 FAQ

**Q: RVC có free không?**
A: Có! 100% FREE. Models open-source, training trên Colab FREE.

**Q: Chất lượng thế nào?**
A: 70-85% của ca sĩ thật. Tốt hơn nhiều so với TTS thuần.

**Q: Cần GPU không?**
A: Không bắt buộc. CPU vẫn chạy được, chỉ chậm hơn.

**Q: Deploy HuggingFace được không?**
A: Được! Nhưng trên Free tier sẽ chậm. Pro tier ($9/mo) có GPU.

**Q: Giọng nghe như ca sĩ nào?**
A: Tùy model. Pre-trained là generic Vietnamese. Custom trained = bất kỳ ca sĩ nào.

**Q: Có thể commercial use không?**
A: Check license của từng model. Hầu hết là OK.

---

## 📞 Support

- Issues: GitHub Issues
- Docs: README.md, OPTIMIZATION_GUIDE.md
- Community: Discord/Forum (TBA)

---

**Chúc bạn tạo nhạc vui vẻ! 🎵**
