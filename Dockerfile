# Sử dụng Python 3.9
FROM python:3.9

# Cài đặt thư viện hệ thống (OpenCV, FFmpeg, Audio Processing)
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    rubberband-cli \
    librubberband-dev \
    libsndfile1 \
    libsamplerate0 \
    libsamplerate0-dev \
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

# Chạy server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]