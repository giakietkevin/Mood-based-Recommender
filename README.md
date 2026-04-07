---
title: KietStation - Mood-Based AI Recommender & Streaming Platform
emoji: 🎵🎬
short_description: AI Music Studio, Stream, Watch Party & Mood Detection
sdk: docker
---

# KietStation (Mood-based-Recommender) 🎵🎬

Hệ thống giải trí trực tuyến đa chức năng tích hợp trí tuệ nhân tạo (AI) nhận diện khuôn mặt để đề xuất nội dung (nhạc & phim), hỗ trợ Studio sản xuất nhạc AI, và tính năng Watch Party chia sẻ qua WebRTC.

## ✨ Tính năng cốt lõi

### 🎬 KietFilm Player & Streaming
- **Stream Tốc Độ Cao**: Tích hợp OPhim API & TMDB API, hỗ trợ định dạng HLS (.m3u8).
- **Trải nghiệm Premium**: Giao diện không quảng cáo, tự động đồng bộ phụ đề.
- **Lưu trữ Cục bộ**: Quản lý lịch sử xem phim và danh sách phát cá nhân.

### 🎭 Mood-Based Recommendation (Đề xuất theo cảm xúc)
- **Công nghệ Face AI**: Tích hợp module DeepFace theo dõi biểu cảm thông qua Webcam.
- **Dynamic Search**: Tự động ánh xạ cảm xúc (Vui, Buồn, Ngạc nhiên...) thành ngữ cảnh, truy vấn song song YouTube Music và Podcast.

### 🎹 KietSound Pro - AI Music Studio
- **Sinh Nhạc AI (Text-To-Music)**: Tích hợp Hugging Face MusicGen tạo beat thủ công.
- **Tổng hợp giọng hát**: Tích hợp Edge-TTS tạo vocals, có hỗ trợ RVC Engine để biến đổi giọng thật/AI.
- **Xử lý âm thanh (Mix & Master)**: Auto-mix với delay, reverb, compression (pydub/ffmpeg). Hỗ trợ chia Intro, Verse, Chorus.

### 🎉 Watch Party (WebRTC)
- **Đồng bộ thời gian thực**: Sử dụng WebRTC và WebTorrent để stream âm thanh/video cho nhiều người cùng lúc.
- **Tương tác nhóm**: Toggle Microphone, chia sẻ camera, thả biểu cảm thời gian thực trên màn hình chung.
- **Peer-to-Peer**: Tối ưu hóa băng thông bằng truyền tải P2P và Node.js tracker.

---

## 🏗️ Kiến trúc Công nghệ

- **Backend / Core REST API**: Python, `FastAPI`, `Uvicorn`.
- **AI & Data Analysis**: `deepface` (Emotion), Transformers (Hugging Face CLI), Edge-TTS, `RVC`.
- **Media Processing**: `ffmpeg-python`, `pydub`, `librosa`.
- **Frontend**: HTML5, CSS3 (Styling hiện đại), JS (Vanilla/ES6 Module).
- **Video Player**: `hls.js`.
- **Real-time Media & Torrent**: `WebTorrent`, Node.js `Express`, `cors`.

**Cấu trúc thư mục tham khảo**:
- `main.py`: Core FastAPI Server.
- `hf_music_gen.py` / `rvc_engine.py`: Các file quản lý pipeline Audio & AI Generation.
- `torrent_server.js`: Tracker và Bridge cho WebTorrent / Watch Party.
- `index.html`: Giao diện ứng dụng Client-Side.

---

## 🚀 Hướng dẫn Cài đặt & Khởi chạy

### 1. Cài đặt Hệ thống & Yêu cầu Bắt buộc
- **OS**: Windows 10/11, Linux, macOS.
- **Python**: `3.10+`.
- **Node.js**: `v18+` (cho torrent server).
- **Phần mềm bên thứ 3**: Cài đặt **FFmpeg** và đưa vào môi trường hệ thống (PATH).

### 2. Cài đặt Dependencies

**Môi trường Python:**
```bash
pip install -r requirements.txt
```

**Môi trường Node.js (WebTorrent & Express):**
```bash
npm install
```

### 3. Vận hành dịch vụ

Chạy **Torrent/WebRTC Backend** (Khởi chạy trên Port khác/quy định):
```bash
node torrent_server.js
```

Khởi động **FastAPI Main Service**:
```bash
python main.py
```

Sau khi Terminal báo thành công, mở truy cập vào: [http://localhost:8000](http://localhost:8000)

---

## 🔒 Vấn đề Pháp lý & Giới hạn
- Dự án mã nguồn mở phục vụ R&D các mảng công nghệ WebRTC, TTS, Video Streaming, Computer Vision.
- Tất cả nội dung phim được cung cấp từ Endpoint Public, ứng dụng không lưu trữ file Media MP4 hoặc m3u8 vào ổ cứng Server tĩnh. Vui lòng tuân thủ bản quyền của nền tảng sở hữu (TMDB/OPhim).