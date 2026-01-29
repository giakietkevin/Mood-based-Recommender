import os
import time
import random
import yt_dlp

# Danh sách beat cần tải (Style và BPM)
BEAT_LIST = [
    ("Pop", 120), ("Rock", 140), ("Punk", 160), ("Electronic", 128),
    ("Rap", 90), ("Metal", 150), ("HardRock", 135), ("Alternative", 110),
    ("Funk", 115), ("PopRock", 125), ("PopPunk", 155), ("Swing", 100),
    ("DarkFolk", 80), ("LoFi", 85), ("SadRap", 75), ("Dubstep", 140),
    ("EDM", 128), ("Ballad", 65), ("RnB", 95), ("Jazz", 110),
    ("Blues", 80), ("Country", 100), ("Soul", 90), ("Reggae", 75),
    ("Latin", 105), ("House", 124), ("Techno", 130), ("Trance", 138),
    ("Indie", 100)
]

OUTPUT_FOLDER = "beats"

def download_beats():
    if not os.path.exists(OUTPUT_FOLDER):
        os.makedirs(OUTPUT_FOLDER)

    print(f"🚀 Bắt đầu tải {len(BEAT_LIST)} beats (Chế độ Android Client)...")

    # Cấu hình yt-dlp để giả lập Android (Tránh lỗi 403 Forbidden)
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        # QUAN TRỌNG: Giả lập Client Android để Youtube không chặn
        'extractor_args': {
            'youtube': {
                'player_client': ['android', 'web']
            }
        }
    }

    for style, bpm in BEAT_LIST:
        filename = f"{style}_{bpm}.mp3"
        filepath = os.path.join(OUTPUT_FOLDER, filename)
        
        if os.path.exists(filepath):
            print(f"✅ Đã có: {filename}")
            continue

        # Tìm kiếm trực tiếp bằng cú pháp ytsearch1:
        search_query = f"ytsearch1:{style} instrumental beat {bpm} bpm no copyright"
        
        # Đặt tên file đầu ra
        ydl_opts['outtmpl'] = os.path.join(OUTPUT_FOLDER, f"{style}_{bpm}")

        try:
            print(f"⬇️  Đang tải: {style} ({bpm} BPM)...")
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([search_query])
            print(f"🎉 Thành công: {filename}")
            
            # Nghỉ ngơi ngắn để tránh spam
            time.sleep(random.uniform(1, 3))

        except Exception as e:
            print(f"☠️ Lỗi tải {style}: {e}")

    print("\n🏁 HOÀN TẤT! Kiểm tra thư mục 'beats'.")

if __name__ == "__main__":
    download_beats()