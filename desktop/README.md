# KietStation cho Windows (.exe)

Đóng gói KietStation thành bộ cài Windows chạy được không cần server online: backend Python (FastAPI, TensorFlow/DeepFace, ...) nằm luôn trong app.

## Build

```powershell
powershell -ExecutionPolicy Bypass -File desktop\build.ps1 -BuildDir D:\KietStation-build -Version 1.0.0
```

Kết quả: `D:\KietStation-build\out\KietStation-Setup-1.0.0.exe`.

Máy build cần: Node.js, Rust (MSVC) + Visual Studio Build Tools (C++), Inno Setup 6 (`winget install JRSoftware.InnoSetup`), ffmpeg (`winget install Gyan.FFmpeg`), có mạng. Thư mục build chiếm khoảng 6–8 GB. Lần build sau nhanh hơn nhiều vì Python và các gói chỉ được cài lại khi `requirements.txt` thay đổi.

`-IncludeEnv` nhét file `.env` (MongoDB, API key) vào bộ cài để đăng nhập hoạt động. **Không gửi bộ cài build với `-IncludeEnv` cho người khác**: ai có file cũng đọc được các khoá đó. Cách khác: chép `.env` vào `%LOCALAPPDATA%\Programs\KietStation\server\` sau khi cài.

## Cách app chạy

`KietStation.exe` (Tauri, dùng WebView2 có sẵn trên Windows 10/11) hiện màn hình chờ, chạy `python\python.exe -m uvicorn main:app` trên `127.0.0.1:17860`, rồi mở giao diện trong cửa sổ. Đóng cửa sổ thì backend tắt theo. Log backend: `%LOCALAPPDATA%\Programs\KietStation\server.log`.

## Chạy offline được gì

| Không cần mạng | Vẫn cần mạng |
|---|---|
| Giao diện (Tailwind, font, icon đã đóng gói sẵn) | Nghe nhạc YouTube, tìm kiếm, trending |
| Quét tâm trạng bằng camera (DeepFace) | Xem phim |
| Beat có sẵn, nhạc đã tạo, Photobooth tách nền | Đăng nhập (MongoDB Atlas), cộng đồng, AI chat |
| | Studio: giọng hát (edge-tts), sinh beat bằng Hugging Face |
