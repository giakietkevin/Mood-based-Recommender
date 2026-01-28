import os
import ssl
import shutil
from fastapi import FastAPI, UploadFile, File, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from deepface import DeepFace
from duckduckgo_search import DDGS  # <--- Thư viện tìm kiếm mới

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

# --- DANH SÁCH DỰ PHÒNG (LUÔN CÓ NHẠC ĐỂ NGHE) ---
# Nếu tìm kiếm lỗi, sẽ lấy nhạc ở đây
STATIC_PLAYLISTS = {
    "happy": [
        {"title": "Pharrell Williams - Happy", "link": "https://www.youtube.com/watch?v=ZbZSe6N_BXs", "thumbnail": "https://i.ytimg.com/vi/ZbZSe6N_BXs/hqdefault.jpg", "duration": "3:53"},
        {"title": "Uptown Funk - Mark Ronson", "link": "https://www.youtube.com/watch?v=OPf0YbXqDm0", "thumbnail": "https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg", "duration": "4:30"},
        {"title": "Can't Stop the Feeling!", "link": "https://www.youtube.com/watch?v=ru0K8uYEZWw", "thumbnail": "https://i.ytimg.com/vi/ru0K8uYEZWw/hqdefault.jpg", "duration": "4:45"},
        {"title": "Walking On Sunshine", "link": "https://www.youtube.com/watch?v=iPUmE-tne5U", "thumbnail": "https://i.ytimg.com/vi/iPUmE-tne5U/hqdefault.jpg", "duration": "3:50"}
    ],
    "sad": [
        {"title": "Tháng Tư Là Lời Nói Dối Của Em", "link": "https://www.youtube.com/watch?v=UCXao7aTDQM", "thumbnail": "https://i.ytimg.com/vi/UCXao7aTDQM/hqdefault.jpg", "duration": "5:00"},
        {"title": "Lạ Lùng - Vũ", "link": "https://www.youtube.com/watch?v=F5tS5m86bOI", "thumbnail": "https://i.ytimg.com/vi/F5tS5m86bOI/hqdefault.jpg", "duration": "4:20"},
        {"title": "Someone Like You - Adele", "link": "https://www.youtube.com/watch?v=hLQl3WQQoQ0", "thumbnail": "https://i.ytimg.com/vi/hLQl3WQQoQ0/hqdefault.jpg", "duration": "4:45"},
        {"title": "Let Her Go - Passenger", "link": "https://www.youtube.com/watch?v=RBumgq5yVrA", "thumbnail": "https://i.ytimg.com/vi/RBumgq5yVrA/hqdefault.jpg", "duration": "4:15"}
    ],
    "neutral": [
        {"title": "Lofi Hip Hop Radio - Beats to Relax", "link": "https://www.youtube.com/watch?v=jfKfPfyJRdk", "thumbnail": "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg", "duration": "LIVE"},
        {"title": "Bài Này Chill Phết - Đen", "link": "https://www.youtube.com/watch?v=2eR3F5jHkG8", "thumbnail": "https://i.ytimg.com/vi/2eR3F5jHkG8/hqdefault.jpg", "duration": "4:00"},
        {"title": "Weightless - Marconi Union", "link": "https://www.youtube.com/watch?v=UfcAVejslrU", "thumbnail": "https://i.ytimg.com/vi/UfcAVejslrU/hqdefault.jpg", "duration": "8:00"}
    ],
    "angry": [
        {"title": "Believer - Imagine Dragons", "link": "https://www.youtube.com/watch?v=7wtfhZwyrcc", "thumbnail": "https://i.ytimg.com/vi/7wtfhZwyrcc/hqdefault.jpg", "duration": "3:30"},
        {"title": "In The End - Linkin Park", "link": "https://www.youtube.com/watch?v=eVTXPUF4Oz4", "thumbnail": "https://i.ytimg.com/vi/eVTXPUF4Oz4/hqdefault.jpg", "duration": "3:38"}
    ]
}
# Các mood khác sẽ dùng chung Neutral nếu thiếu
STATIC_PLAYLISTS["fear"] = STATIC_PLAYLISTS["neutral"]
STATIC_PLAYLISTS["surprise"] = STATIC_PLAYLISTS["happy"]
STATIC_PLAYLISTS["disgust"] = STATIC_PLAYLISTS["sad"]

# --- KEYWORDS ---
MUSIC_KEYWORDS = {
    "happy": "nhạc trẻ remix vui vẻ tiktok", 
    "sad": "nhạc suy tâm trạng buồn",
    "angry": "nhạc edm bass cực căng",
    "neutral": "lofi chill beats vietnam",
    "fear": "relaxing piano music",
    "surprise": "trending tiktok music vietnam",
    "disgust": "nhạc chia tay buồn"
}

PODCAST_KEYWORDS = {
    "happy": "podcast phát triển bản thân",
    "sad": "podcast chữa lành",
    "angry": "podcast quản lý cảm xúc",
    "neutral": "podcast tri thức thú vị",
    "fear": "podcast thiền bình an",
    "surprise": "podcast công nghệ mới",
    "disgust": "podcast buông bỏ"
}

CONTENT_CACHE = {} 

# --- HÀM TÌM KIẾM DÙNG DUCKDUCKGO (KHÔNG BỊ CHẶN) ---
def search_via_duckduckgo(query):
    print(f"🔍 Searching via DDG: {query}")
    try:
        results = []
        # Tìm video trên site:youtube.com
        with DDGS() as ddgs:
            # Lấy 10 kết quả video
            ddg_gen = ddgs.videos(f"site:youtube.com {query}", max_results=10)
            
            for r in ddg_gen:
                link = r.get('content') or r.get('url') # Link youtube
                if not link: continue
                
                # Tạo thumbnail từ ID video (vì DDG đôi khi trả link ảnh lỗi)
                video_id = ""
                if "v=" in link: video_id = link.split("v=")[1].split("&")[0]
                elif "youtu.be" in link: video_id = link.split("/")[-1]
                
                thumb = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else "https://via.placeholder.com/120"

                results.append({
                    "title": r.get('title', 'No Title'),
                    "link": link,
                    "duration": r.get('duration', 'MV'),
                    "thumbnail": thumb
                })
        
        return results

    except Exception as e:
        print(f"❌ DDG Error: {e}")
        return []

def search_content_by_mood(mood, content_type="music"):
    cache_key = f"{mood}_{content_type}"
    if cache_key in CONTENT_CACHE:
        print(f"🚀 Cache hit: {cache_key}")
        return CONTENT_CACHE[cache_key]

    # 1. Thử tìm kiếm Online
    if content_type == "podcast":
        query = PODCAST_KEYWORDS.get(mood, "podcast hay")
    else:
        query = MUSIC_KEYWORDS.get(mood, "nhạc hay")
    
    online_results = search_via_duckduckgo(query)
    
    # 2. Nếu tìm được -> Trả về & Lưu Cache
    if online_results:
        CONTENT_CACHE[cache_key] = online_results
        return online_results

    # 3. Nếu lỗi/trống -> Dùng danh sách CỨNG (Fallback)
    print(f"⚠️ Search failed, using Backup Playlist for {mood}")
    return STATIC_PLAYLISTS.get(mood, STATIC_PLAYLISTS["neutral"])

@app.get("/")
async def serve_index():
    return FileResponse("index.html")

@app.get("/search")
async def search_manual(q: str = Query(..., min_length=1), type: str = "music"):
    search_query = f"{q} {type}" if type == "podcast" else f"{q} official mv"
    results = search_via_duckduckgo(search_query)
    
    # Nếu tìm tay mà vẫn lỗi thì trả về playlist Neutral để không trống trơn
    if not results: results = STATIC_PLAYLISTS["neutral"]
    
    return {"mood": "manual", "recommendations": results}

@app.post("/recommend")
async def recommend(file: UploadFile = File(...), type: str = "music"):
    temp_filename = f"temp_{file.filename}"
    try:
        with open(temp_filename, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # DeepFace config chuẩn cho server free
        analysis = DeepFace.analyze(
            img_path=temp_filename, 
            actions=['emotion'], 
            enforce_detection=False,
            detector_backend='opencv'
        )
        
        result = analysis[0] if isinstance(analysis, list) else analysis
        detected_mood = result['dominant_emotion'] 
        print(f"✅ Mood: {detected_mood}")

        recommendations = search_content_by_mood(detected_mood, content_type=type)
        return {"mood": detected_mood, "recommendations": recommendations}

    except Exception as e:
        print(f"💀 Error: {e}")
        # Fallback cuối cùng
        return {
            "mood": "neutral", 
            "recommendations": STATIC_PLAYLISTS["neutral"]
        }
    finally:
        if os.path.exists(temp_filename): os.remove(temp_filename)