# Python 3.11: yt-dlp (needed for streaming) dropped Python 3.9, and an old yt-dlp no longer works with YouTube
FROM python:3.11

# Cài đặt thư viện hệ thống (OpenCV, FFmpeg, Audio Processing)
RUN apt-get update && apt-get install -y ffmpeg \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    rubberband-cli \
    librubberband-dev \
    libsndfile1 \
    libsamplerate0 \
    libsamplerate0-dev \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20: yt-dlp uses it to solve YouTube's JavaScript challenges. A failure here must not break the build.
RUN apt-get update && apt-get install -y curl ca-certificates \
    && (curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs || true) \
    && rm -rf /var/lib/apt/lists/*

# Tạo thư mục làm việc
WORKDIR /code

# Copy file requirements và cài đặt thư viện
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy toàn bộ code vào
COPY . /code

# Tạo thư mục cache cho DeepFace để tránh lỗi permission
RUN mkdir -p /.deepface && chmod -R 777 /.deepface
ENV DEEPFACE_HOME="/.deepface"
ENV PYTHONUNBUFFERED=1

# Chạy server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]