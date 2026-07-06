---
title: KietStation - Mood-Based AI Recommender & Streaming Platform
emoji: 🎵🎬
short_description: AI Music Studio, Stream, Watch Party & Mood Detection
sdk: docker
---

# KietStation (Mood-based-Recommender) 🎵🎬

Hệ thống giải trí trực tuyến đa chức năng tích hợp trí tuệ nhân tạo (AI) nhận diện khuôn mặt để đề xuất nội dung (nhạc & phim), hỗ trợ Studio sản xuất nhạc AI, mạng xã hội mini và tính năng Watch Party chia sẻ qua WebRTC.

---

## 🛠️ Các Công Nghệ Sử Dụng (Tech Stack)

Dự án được xây dựng dựa trên sự kết hợp giữa các framework hiện đại và các mô hình AI tiên tiến:

### 1. Frontend (Giao diện người dùng)
- **HTML5, CSS3, Vanilla JavaScript**: Xây dựng kiến trúc SPA (Single Page Application) mà không phụ thuộc vào framework nặng.
- **Tailwind CSS**: Framework CSS utility-first giúp thiết kế giao diện Glassmorphism nhanh chóng và responsive trên mọi thiết bị.
- **HLS.js**: Thư viện phát luồng video HTTP Live Streaming (.m3u8), dùng cho hệ thống xem phim.
- **MediaPipe (Google)**: Sử dụng mô hình `Selfie Segmentation` để tách nền theo thời gian thực (dùng trong Photobooth).
- **WebRTC & SimplePeer**: Công nghệ truyền tải dữ liệu thời gian thực (P2P), cốt lõi của tính năng Watch Party và Study Room.

### 2. Backend & API Services
- **Python & FastAPI**: Xây dựng core RESTful API siêu tốc, xử lý bất đồng bộ (async).
- **Uvicorn**: ASGI server chạy ứng dụng FastAPI.
- **Node.js & Express**: Máy chủ phụ (Tracker) quản lý kết nối P2P và WebTorrent cho phòng xem chung.
- **Supabase**: Quản lý cơ sở dữ liệu thời gian thực (PostgreSQL), xác thực người dùng (Authentication) và lưu trữ trạng thái mạng xã hội (bài đăng, bình luận).

### 3. Trí Tuệ Nhân Tạo (AI) & Xử lý Âm Thanh
- **DeepFace (TensorFlow/Keras)**: Mô hình Computer Vision để nhận diện cảm xúc khuôn mặt người dùng thông qua Webcam, từ đó đề xuất nhạc/phim phù hợp (Mood-based).
- **Hugging Face Transformers & MusicGen**: Tích hợp mô hình Text-To-Music (sinh nhạc từ văn bản) tự động tạo beat theo mô tả.
- **Edge-TTS**: Công cụ Text-to-Speech chuyển đổi văn bản thành giọng hát/đọc.
- **RVC (Retrieval-based Voice Conversion)**: Đổi giọng ca sĩ bằng AI.
- **FFmpeg & Pydub**: Xử lý, cắt ghép, mix âm thanh (thêm hiệu ứng reverb, delay) ở tầng backend.

---

## 📖 Hướng Dẫn Sử Dụng 

KietStation được chia thành nhiều không gian (Tab) với các chức năng riêng biệt:

### 🎵 1. Music (Bảng điều khiển & Nghe nhạc)
- Khám phá các bài hát đang thịnh hành và nghe nhạc trực tuyến.
- **Tính năng Đề xuất Cảm xúc (Mood Detection)**: Bật camera, hệ thống AI sẽ quét khuôn mặt bạn, nhận diện cảm xúc (Vui, Buồn, Bình thường, Ngạc nhiên...) và tự động phát playlist phù hợp với tâm trạng hiện tại.

### 🎬 2. Film (Rạp phim & Watch Party)
- Xem phim miễn phí được cấp bởi **OPhim API** với độ phân giải cao.
- **Watch Party (Phòng xem chung)**:
  - Tạo phòng và gửi mã ID cho bạn bè.
  - Mọi người cùng xem phim đồng bộ thời gian thực (Sync).
  - Tích hợp bật Webcam/Mic để trò chuyện và thả biểu cảm (Reaction) ngay trên màn hình.

### 🎹 3. Studio (KietSound Pro - AI Music)
- Nhập mô tả (Prompt) để AI tự động sáng tác Beat nhạc.
- Viết lời bài hát (Lyrics) và chọn giọng ca sĩ ảo để hệ thống mix thành một bài hát hoàn chỉnh (hỗ trợ Auto-mastering).

### 📸 4. Photobooth (Chụp ảnh AI)
- Không gian chụp ảnh phong cách Hàn Quốc.
- Ứng dụng AI **MediaPipe** để tự động tách nền, cho phép bạn ghép các phông nền (Background) ảo ngay trên trình duyệt mà không cần phông xanh.

### 📚 5. Library & Social Feed (Trạm Dừng Chân)
- **Library**: Quản lý danh sách phát nhạc (Playlist), phim yêu thích (Watchlist) cá nhân.
- **Social Feed (Trạm Dừng Chân)**: Nơi người dùng có thể đăng bài (Post), chia sẻ bài hát/phim đang xem, bình luận và tương tác (Thả tim) giống như một mạng xã hội thu nhỏ.

### 🎧 6. Focus / DJ Radio
- **Focus Room**: Không gian học tập/làm việc chung kết hợp đồng hồ đếm ngược (Pomodoro) và nhạc Lofi thư giãn.
- Có thể bật camera để cùng học với người khác.

---

## 🚀 Hướng Dẫn Cài Đặt & Khởi Chạy (Dành cho Developer)

### 1. Yêu cầu Hệ thống
- **OS**: Windows 10/11, Linux, macOS.
- **Python**: `3.10+`.
- **Node.js**: `v18+`.
- **Phần mềm bên thứ 3**: Phải cài đặt **FFmpeg** và đưa vào môi trường hệ thống (System PATH).

### 2. Cài đặt Dependencies

**Môi trường Python (Backend chính):**
```bash
pip install -r requirements.txt
```

**Môi trường Node.js (WebTorrent & Tracker Server):**
```bash
npm install
```

### 3. Vận hành dịch vụ

**Bước 1:** Chạy máy chủ P2P Tracker (Terminal 1)
```bash
node torrent_server.js
```

**Bước 2:** Khởi động máy chủ AI & API FastAPI (Terminal 2)
```bash
python main.py
```

Sau khi Terminal báo khởi động thành công, mở trình duyệt và truy cập vào: 
👉 **[http://localhost:7860](http://localhost:7860)**

---

## 🔒 Vấn đề Pháp lý & Giới hạn
- Đây là dự án mã nguồn mở phục vụ quá trình R&D các mảng công nghệ WebRTC, TTS, Video Streaming, Computer Vision.
- Tất cả nội dung phim được cung cấp từ Endpoint Public, ứng dụng không lưu trữ file Media MP4 hoặc m3u8 vào ổ cứng Server tĩnh. Vui lòng tuân thủ bản quyền của nền tảng sở hữu nội dung.
