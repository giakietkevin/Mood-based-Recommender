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

# --- 1. TỪ KHÓA TÌM KIẾM (MUSIC) ---
MUSIC_KEYWORDS = {
    "happy": "nhạc trẻ remix vui vẻ tiktok", 
    "sad": "nhạc suy tâm trạng buồn",
    "angry": "nhạc edm bass cực căng",
    "neutral": "nhạc lofi chill tiếng việt dễ ngủ",
    "fear": "nhạc nhẹ nhàng thư giãn giảm stress",
    "surprise": "nhạc hot trend tiktok hiện nay",
    "disgust": "nhạc chia tay người yêu cũ"
}

# --- 2. TỪ KHÓA TÌM KIẾM (PODCAST) ---
# Mapping mood to podcast topics: Business, Healing, Lessons
PODCAST_KEYWORDS = {
    "happy": "podcast phát triển bản thân kinh doanh",   # Business/Growth for high energy
    "sad": "podcast chữa lành tâm hồn",                 # Healing for low energy
    "angry": "podcast kiểm soát nóng giận cảm xúc",     # Management for anger
    "neutral": "podcast bài học cuộc sống tri thức",    # Lessons/Knowledge for focus
    "fear": "podcast thiền bình an vượt qua nỗi sợ",    # Calming/Healing
    "surprise": "podcast tin tức công nghệ xu hướng",   # News/Trends
    "disgust": "podcast buông bỏ chữa lành"             # Healing
}

# --- 3. BỘ NHỚ ĐỆM (CACHE) ---
CONTENT_CACHE = {} 

BACKUP_CONTENT = [
    {"title": "Podcast Chữa Lành", "link": "https://www.youtube.com/watch?v=2eR3F5jHkG8", "thumbnail": "https://via.placeholder.com/120", "duration": "PODCAST"},
    {"title": "Bài Học Kinh Doanh", "link": "https://www.youtube.com/watch?v=C7Nf1e5-CLQ", "thumbnail": "https://via.placeholder.com/120", "duration": "PODCAST"}
]

def search_content_by_mood(mood, content_type="music"):
    # Tạo key cache unique: ví dụ "happy_music" hoặc "sad_podcast"
    cache_key = f"{mood}_{content_type}"

    # KIỂM TRA CACHE
    if cache_key in CONTENT_CACHE:
        print(f"🚀 Dùng Cache cho: {cache_key}")
        return CONTENT_CACHE[cache_key]

    # Chọn từ khóa dựa trên loại nội dung
    if content_type == "podcast":
        query = PODCAST_KEYWORDS.get(mood, "podcast hay nhất")
    else:
        query = MUSIC_KEYWORDS.get(mood, "nhạc trẻ hay nhất")
    
    print(f"🔍 Đang tìm {content_type} trên YouTube: {query}...")
    
    try:
        videos_search = VideosSearch(query, limit=10)
        results = videos_search.result()
        
        recommendations = []
        if not results or 'result' not in results:
            return BACKUP_CONTENT

        for video in results['result']:
            if video.get('type') != 'video': continue 
            
            thumb = video['thumbnails'][0]['url'] if video.get('thumbnails') else ""
            recommendations.append({
                "title": video.get('title', 'No Title'),
                "link": video.get('link', '#'),
                "duration": video.get('duration', ''),
                "thumbnail": thumb
            })
            if len(recommendations) >= 7: break
        
        if not recommendations: return BACKUP_CONTENT

        # LƯU VÀO CACHE
        CONTENT_CACHE[cache_key] = recommendations
        return recommendations

    except Exception as e:
        print(f"❌ Lỗi tìm kiếm: {e}")
        return BACKUP_CONTENT

@app.get("/")
async def serve_index():
    return FileResponse("index.html")

@app.post("/recommend")
async def recommend(file: UploadFile = File(...), type: str = "music"): # Thêm tham số type
    temp_filename = f"temp_{file.filename}"
    try:
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # --- AI NHẬN DIỆN ---
        analysis = DeepFace.analyze(
            img_path=temp_filename, 
            actions=['emotion'], 
            enforce_detection=False,
            detector_backend='ssd', 
            expand_percentage=10
        )
        
        result = analysis[0] if isinstance(analysis, list) else analysis
        detected_mood = result['dominant_emotion'] 
        print(f"✅ Mood: {detected_mood} | Type: {type}")

        # Tìm kiếm theo mood và type (music/podcast)
        recommendations = search_content_by_mood(detected_mood, content_type=type)

        return {"mood": detected_mood, "recommendations": recommendations}

    except Exception as e:
        print(f"💀 Lỗi: {e}")
        return {"mood": "error", "recommendations": BACKUP_CONTENT}
    finally:
        if os.path.exists(temp_filename): os.remove(temp_filename)