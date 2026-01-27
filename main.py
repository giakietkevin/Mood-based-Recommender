import os
import ssl
import shutil
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from deepface import DeepFace
from youtubesearchpython import VideosSearch 

# --- CẤU HÌNH ---
os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

# Fix lỗi SSL
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. TỪ KHÓA TÌM KIẾM ---
MOOD_KEYWORDS = {
    "happy": "nhạc trẻ remix vui vẻ tiktok", 
    "sad": "nhạc suy tâm trạng buồn",
    "angry": "nhạc edm bass cực căng",
    "neutral": "nhạc lofi chill tiếng việt dễ ngủ",
    "fear": "nhạc nhẹ nhàng thư giãn giảm stress`",
    "surprise": "nhạc hot trend tiktok hiện nay",
    "disgust": "nhạc chia tay người yêu cũ"
}

# --- 2. BỘ NHỚ ĐỆM (CACHE) ---
# Giúp chế độ tự động chạy siêu nhanh, không phải tìm lại nếu cảm xúc không đổi
MUSIC_CACHE = {} 

BACKUP_MUSIC = [
    {"title": "Bài Này Chill Phết - Đen", "link": "https://www.youtube.com/watch?v=2eR3F5jHkG8", "thumbnail": "https://i.ytimg.com/vi/2eR3F5jHkG8/hqdefault.jpg", "duration": "MV"},
    {"title": "Chúng Ta Của Tương Lai", "link": "https://www.youtube.com/watch?v=C7Nf1e5-CLQ", "thumbnail": "https://i.ytimg.com/vi/C7Nf1e5-CLQ/hqdefault.jpg", "duration": "MV"}
]

def search_music_by_mood(mood):
    # KIỂM TRA CACHE: Nếu đã tìm mood này rồi thì trả về ngay (Siêu nhanh)
    if mood in MUSIC_CACHE:
        print(f"🚀 Dùng Cache cho: {mood}")
        return MUSIC_CACHE[mood]

    query = MOOD_KEYWORDS.get(mood, "nhạc trẻ hay nhất")
    print(f"🔍 Đang tìm mới trên YouTube: {mood}...")
    
    try:
        videos_search = VideosSearch(query, limit=10)
        results = videos_search.result()
        
        recommendations = []
        if not results or 'result' not in results:
            return BACKUP_MUSIC

        for video in results['result']:
            if video.get('type') != 'video': continue # Bỏ qua playlist
            
            thumb = video['thumbnails'][0]['url'] if video.get('thumbnails') else ""
            recommendations.append({
                "title": video.get('title', 'No Title'),
                "link": video.get('link', '#'),
                "duration": video.get('duration', ''),
                "thumbnail": thumb
            })
            if len(recommendations) >= 7: break
        
        if not recommendations: return BACKUP_MUSIC

        # LƯU VÀO CACHE ĐỂ LẦN SAU DÙNG LẠI
        MUSIC_CACHE[mood] = recommendations
        return recommendations

    except Exception as e:
        print(f"❌ Lỗi tìm kiếm: {e}")
        return BACKUP_MUSIC

@app.get("/")
async def serve_index():
    return FileResponse("index.html")

@app.post("/recommend")
async def recommend(file: UploadFile = File(...)):
    temp_filename = f"temp_{file.filename}"
    try:
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # --- NÂNG CẤP ĐỘ CHÍNH XÁC ---
        # detector_backend='ssd': Chậm hơn xíu nhưng nhận diện mặt CHUẨN hơn opencv
        # expand_percentage: Mở rộng vùng mặt để lấy thêm tóc/tai -> AI đoán tốt hơn
        analysis = DeepFace.analyze(
            img_path=temp_filename, 
            actions=['emotion'], 
            enforce_detection=False,
            detector_backend='ssd', # Thay đổi quan trọng giúp chính xác hơn
            expand_percentage=10
        )
        
        result = analysis[0] if isinstance(analysis, list) else analysis
        detected_mood = result['dominant_emotion'] 
        print(f"✅ Mood: {detected_mood}")

        recommendations = search_music_by_mood(detected_mood)

        return {"mood": detected_mood, "recommendations": recommendations}

    except Exception as e:
        print(f"💀 Lỗi: {e}")
        return {"mood": "error", "recommendations": BACKUP_MUSIC}
    finally:
        if os.path.exists(temp_filename): os.remove(temp_filename)