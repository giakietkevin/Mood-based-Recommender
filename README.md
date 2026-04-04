---
title: KietSound Pro - AI Music & Film Studio
emoji: 🎵🎬
short_description: AI Music Studio with Mood Detection & Film Streaming
sdk: docker
---

# 🎵 KietSound Pro - AI Music & Film Studio

Hệ thống giải trí cao cấp tích hợp AI nhận diện khuôn mặt để đề xuất nhạc và xem phim chất lượng cao.

## ✨ Tính năng nổi bật

### 🎬 KietFilm Player
- **Stream Tốc Độ Cao**: Tích hợp OPhim API, hỗ trợ định dạng HLS (.m3u8) truyền tải mượt mà.
- **Không Quảng Cáo**: Trải nghiệm xem phim sạch, không popup khó chịu.
- **Phụ Đề Tiếng Việt**: Tự động đồng bộ sub cho mọi đại lộ phim.
- **Lịch Sử Xem**: Ghi nhớ phim đang xem dở để tiếp tục bất cứ lúc nào.

### 🎭 Đề xuất theo cảm xúc (Mood-Based)
- **Face AI**: Sử dụng thư viện DeepFace phân tích biểu cảm từ Webcam.
- **Smart Mapping**: Tự động chuyển đổi cảm xúc (Vui, Buồn, Giận dữ...) thành từ khóa tìm kiếm nhạc/phim phù hợp.
- **Đa nền tảng**: Tìm kiếm trực tiếp trên YouTube và Podcast.

### 🎹 Trình tạo nhạc AI (Text-to-Music)
- **Vocal chuyên nghiệp**: Sử dụng Edge-TTS tạo giọng hát tự nhiên với nhiều tùy chọn vùng miền.
- **Xử lý âm thanh Studio**: Tự động Mix & Master, thêm hiệu ứng Reverb, Delay, và Compression theo Style.
- **Cấu trúc bài hát**: Auto-generate Intro, Verse, Chorus, Outro.

---

## 🛠️ Yêu cầu hệ thống
- **OS**: Windows 10/11, Linux hoặc macOS.
- **Python**: 3.10 trở lên.
- **RAM**: Tối thiểu 4GB (Khuyên dùng 8GB để chạy AI mượt hơn).
- **Phần cứng**: Webcam (để dùng tính năng nhận diện cảm xúc).

---

## 🚀 Hướng dẫn cài đặt

### 1. Cài đặt các công cụ bổ trợ
Bạn cần cài đặt **FFmpeg** để xử lý âm thanh và video:
- **Windows**: Tải tại [ffmpeg.org](https://ffmpeg.org/download.html) và thêm vào PATH.
- **Linux**: `sudo apt install ffmpeg`

### 2. Cài đặt Python Dependencies
Mở Terminal/Command Prompt tại thư mục dự án và chạy:
```bash
pip install -r requirements.txt
```

### 3. Khởi chạy ứng dụng
Chạy lệnh sau để bắt đầu:
```bash
python main.py
```
Sau đó truy cập địa chỉ: `http://localhost:8000` trên trình duyệt.

---

## 🏗️ Kiến trúc kỹ thuật
- **Backend**: FastAPI (Python) - Xử lý logic AI và API.
- **Frontend**: Vanilla JS, HTML5, CSS3 (Tailwind-style) - Giao diện hiện đại, responsive.
- **AI Models**: DeepFace (Emotion Detection).
- **Streaming**: HLS.js cho trình phát video.
- **Database/Auth**: Firebase Integration.

## 📝 Lưu ý bản quyền
Dự án được xây dựng phục vụ mục đích học tập và nghiên cứu công nghệ AI. Chúng tôi không lưu trữ bất kỳ tệp video nào trên máy chủ. Mọi dữ liệu phim được lấy từ các API công cộng.