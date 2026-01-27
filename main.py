import os
import ssl
import shutil
from fastapi import FastAPI, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from deepface import DeepFace
from youtubesearchpython import VideosSearch 

# --- CẤU HÌNH ---
os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

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

# --- 1. TỪ KHÓA MOOD ---
MUSIC_KEYWORDS = {
    "happy": "nhạc trẻ remix vui vẻ tiktok", 
    "sad": "nhạc suy tâm trạng buồn",
    "angry": "nhạc edm bass cực căng",
    "neutral": "nhạc lofi chill tiếng việt dễ ngủ",
    "fear": "nhạc nhẹ nhàng thư giãn giảm stress",
    "surprise": "nhạc hot trend tiktok hiện nay",
    "disgust": "nhạc chia tay người yêu cũ"
}

PODCAST_KEYWORDS = {
    "happy": "podcast phát triển bản thân kinh doanh",
    "sad": "podcast chữa lành tâm hồn",
    "angry": "podcast kiểm soát nóng giận cảm xúc",
    "neutral": "podcast bài học cuộc sống tri thức",
    "fear": "podcast thiền bình an vượt qua nỗi sợ",
    "surprise": "podcast tin tức công nghệ xu hướng",
    "disgust": "podcast buông bỏ chữa lành"
}

# --- 2. BỘ NHỚ ĐỆM ---
CONTENT_CACHE = {} 
BACKUP_CONTENT = [
    {"title": "Podcast Chữa Lành", "link": "https://www.youtube.com/watch?v=2eR3F5jHkG8", "thumbnail": "https://via.placeholder.com/120", "duration": "PODCAST"},
    {"title": "Bài Học Kinh Doanh", "link": "https://www.youtube.com/watch?v=C7Nf1e5-CLQ", "thumbnail": "https://via.placeholder.com/120", "duration": "PODCAST"}
]

# Hàm tìm kiếm chung
def perform_youtube_search(query):
    try:
        print(f"🔍 Searching YouTube: {query}")
        videos_search = VideosSearch(query, limit=10)
        results = videos_search.result()
        
        recommendations = []
        if not results or 'result' not in results:
            return []

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
        
        return recommendations
    except Exception as e:
        print(f"❌ Search Error: {e}")
        return []

def search_content_by_mood(mood, content_type="music"):
    cache_key = f"{mood}_{content_type}"
    if cache_key in CONTENT_CACHE:
        return CONTENT_CACHE[cache_key]

    if content_type == "podcast":
        query = PODCAST_KEYWORDS.get(mood, "podcast hay nhất")
    else:
        query = MUSIC_KEYWORDS.get(mood, "nhạc trẻ hay nhất")
    
    results = perform_youtube_search(query)
    
    if not results: return BACKUP_CONTENT
    
    CONTENT_CACHE[cache_key] = results
    return results

@app.get("/")
async def serve_index():
    return FileResponse("index.html")

# --- API 1: TÌM KIẾM THEO TÊN (MỚI) ---
@app.get("/search")
async def search_manual(q: str = Query(..., min_length=1), type: str = "music"):
    # Kết hợp từ khóa người dùng nhập + loại (music/podcast) để kết quả chuẩn hơn
    search_query = f"{q} {type}" if type == "podcast" else f"{q} official mv"
    
    results = perform_youtube_search(search_query)
    if not results: results = BACKUP_CONTENT
    
    return {"mood": "manual", "recommendations": results}

# --- API 2: TÌM KIẾM THEO MOOD (CŨ) ---
@app.post("/recommend")
async def recommend(file: UploadFile = File(...), type: str = "music"):
    temp_filename = f"temp_{file.filename}"
    try:
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

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

        recommendations = search_content_by_mood(detected_mood, content_type=type)

        return {"mood": detected_mood, "recommendations": recommendations}

    except Exception as e:
        print(f"💀 Error: {e}")
        return {"mood": "error", "recommendations": BACKUP_CONTENT}
    finally:
        if os.path.exists(temp_filename): os.remove(temp_filename)