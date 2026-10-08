"""
Hybrid Mood-Based Recommender Service
=====================================
Integrates:
1. Russell's 2D Circumplex Model (Valence - Arousal)
2. User Music Profile & Preferences (MongoDB Atlas / Local Storage)
3. Dynamic Candidate Generation & Scoring
4. Implicit & Explicit Feedback Loop (Like, Listen >30s, Skip <10s)
"""

import math
import random
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

try:
    from auth import MongoDBConnection
    MONGODB_READY = True
except Exception:
    MONGODB_READY = False

# ==============================================================================
# 1. RUSSELL'S CIRCUMPLEX MODEL (VALENCE - AROUSAL)
# ==============================================================================
# Valence: [-1.0, 1.0] (Negative/Sad to Positive/Happy)
# Arousal: [-1.0, 1.0] (Calm/Low Energy to Excited/High Energy)
EMOTION_COORDINATES: Dict[str, Dict[str, Any]] = {
    "happy": {
        "display": "Vui vẻ & Sôi động 😄",
        "valence": 0.8,
        "arousal": 0.7,
        "energy": "high",
        "tempo_range": (115, 140),
        "descriptors": ["vui tươi", "upbeat", "catchy", "pop sôi động", "yêu đời"],
        "music_queries": [
            "nhạc việt vui tươi sôi động chill",
            "nhạc pop upbeat yêu đời",
            "nhạc dance acoustic vui vẻ"
        ],
        "podcast_query": "podcast truyền cảm hứng tích cực"
    },
    "surprise": {
        "display": "Bất ngờ & Đột phá 😲",
        "valence": 0.5,
        "arousal": 0.85,
        "energy": "high",
        "tempo_range": (120, 150),
        "descriptors": ["remix", "hot trend", "electronic", "sôi động", "tiktok viral"],
        "music_queries": [
            "nhạc remix hot trend tiktok",
            "nhạc edm vinahouse thịnh hành",
            "nhạc mashup trending"
        ],
        "podcast_query": "podcast khám phá điều thú vị bất ngờ"
    },
    "neutral": {
        "display": "Bình thản & Thư thái 😐",
        "valence": 0.0,
        "arousal": -0.2,
        "energy": "medium",
        "tempo_range": (85, 110),
        "descriptors": ["lofi", "chill", "acoustic", "mộc mạc", "thư giãn"],
        "music_queries": [
            "nhạc lofi chill nhẹ nhàng thư giãn",
            "nhạc acoustic nhẹ nhàng mộc mạc",
            "nhạc indie việt nhẹ nhàng"
        ],
        "podcast_query": "podcast kiến thức thú vị cuộc sống"
    },
    "disgust": {
        "display": "Thư giãn & Dễ chịu 🍃",
        "valence": 0.2,
        "arousal": -0.5,
        "energy": "low",
        "tempo_range": (75, 100),
        "descriptors": ["chillout", "indie", "dễ chịu", "không lời"],
        "music_queries": [
            "nhạc lofi chill giải tỏa tâm trạng",
            "nhạc indie nhẹ nhàng chữa lành",
            "nhạc không lời thư giãn êm dịu"
        ],
        "podcast_query": "podcast câu chuyện cuộc sống nhẹ nhàng"
    },
    "sad": {
        "display": "U buồn & Lắng đọng 😢",
        "valence": -0.75,
        "arousal": -0.6,
        "energy": "low",
        "tempo_range": (60, 85),
        "descriptors": ["ballad tâm trạng", "piano buồn", "lofi acoustic buồn", "suy"],
        "music_queries": [
            "nhạc buồn tâm trạng ballad nhẹ nhàng",
            "nhạc lofi suy tâm trạng đêm khuya",
            "nhạc piano acoustic buồn lắng đọng"
        ],
        "podcast_query": "podcast tâm sự đêm khuya chữa lành"
    },
    "angry": {
        "display": "Giải tỏa Căng thẳng 😡",
        "valence": -0.55,
        "arousal": 0.85,
        "energy": "high",
        "tempo_range": (120, 160),
        "descriptors": ["rock mạnh mẽ", "rap xả stress", "hard beat", "bùng nổ"],
        "music_queries": [
            "nhạc rock việt giải tỏa căng thẳng stress",
            "nhạc rap việt flow căng giải tỏa tâm trạng",
            "nhạc beat mạnh mẽ giải phóng năng lượng"
        ],
        "podcast_query": "podcast thư giãn tâm trí giải tỏa âu lo"
    },
    "fear": {
        "display": "An yên & Chữa lành 😨",
        "valence": -0.4,
        "arousal": 0.1,
        "energy": "low-medium",
        "tempo_range": (65, 95),
        "descriptors": ["nhạc thiền", "healing piano", "chữa lành tâm hồn", "bình yên"],
        "music_queries": [
            "nhạc lofi thư giãn bình yên không lời",
            "nhạc thiền healing piano chữa lành tâm hồn",
            "nhạc sóng não tần số thư giãn giảm lo âu"
        ],
        "podcast_query": "podcast chữa lành tâm hồn an yên"
    }
}


# ==============================================================================
# 2. USER MUSIC PROFILE EXTRACTION
# ==============================================================================
async def extract_user_music_profile(user_id: Optional[str] = None, guest_favorites: Optional[List[Dict]] = None) -> Dict[str, Any]:
    """
    Trích xuất gu âm nhạc của người dùng từ MongoDB (hoặc guest favorites)
    - favorite_artists: {artist_name: weight}
    - skipped_links: Set of song links with negative penalties
    - top_genres: Preferred music genres
    """
    profile = {
        "favorite_artists": {},
        "favorite_tracks": set(),
        "skipped_tracks": set(),
        "recent_listened": []
    }

    if not user_id:
        # Xử lý Guest User dựa trên danh sách favorites từ localStorage
        if guest_favorites:
            for s in guest_favorites:
                artist = s.get("artist", "").strip()
                link = s.get("link", "").strip()
                if artist and artist.lower() not in ["", "unknown", "youtube video"]:
                    profile["favorite_artists"][artist.lower()] = profile["favorite_artists"].get(artist.lower(), 0) + 3.0
                if link:
                    profile["favorite_tracks"].add(link)
        return profile

    try:
        db = MongoDBConnection.get_db()
        activity_col = db["user_activity"]
        interactions_col = db["user_interactions"]

        # 1. Lấy Favorites
        favorites = await activity_col.find({
            "user_id": user_id,
            "type": "favorite_music"
        }).to_list(length=100)

        for fav in favorites:
            data = fav.get("data", {})
            artist = data.get("artist", "").strip()
            link = data.get("link", "").strip()
            if artist and artist.lower() not in ["", "unknown", "youtube video"]:
                profile["favorite_artists"][artist.lower()] = profile["favorite_artists"].get(artist.lower(), 0) + 3.0
            if link:
                profile["favorite_tracks"].add(link)

        # 2. Lấy Lịch sử Tương tác (Interactions) trong 14 ngày gần nhất
        fourteen_days_ago = datetime.utcnow() - timedelta(days=14)
        interactions = await interactions_col.find({
            "user_id": user_id,
            "created_at": {"$gte": fourteen_days_ago}
        }).sort("created_at", -1).to_list(length=300)

        for inter in interactions:
            artist = inter.get("artist", "").strip().lower()
            link = inter.get("link", "").strip()
            itype = inter.get("interaction_type", "")

            if itype == "listen_30s":
                if artist:
                    profile["favorite_artists"][artist] = profile["favorite_artists"].get(artist, 0) + 1.5
                if link:
                    profile["recent_listened"].append(link)
            elif itype == "play":
                if artist:
                    profile["favorite_artists"][artist] = profile["favorite_artists"].get(artist, 0) + 0.5
            elif itype == "skip_10s":
                if link:
                    profile["skipped_tracks"].add(link)
                if artist:
                    profile["favorite_artists"][artist] = profile["favorite_artists"].get(artist, 0) - 1.0

    except Exception as e:
        print(f"[Recommender] Profile extraction error: {e}")

    return profile


# ==============================================================================
# 3. INTERACTION LOGGING (FEEDBACK LOOP)
# ==============================================================================
async def log_user_interaction(
    user_id: Optional[str],
    song_id: str,
    title: str,
    artist: str,
    link: str,
    interaction_type: str,
    mood_context: Optional[str] = None
) -> bool:
    """
    Ghi nhận phản hồi tương tác (play, listen_30s, skip_10s, like) vào MongoDB
    """
    if not user_id or not MONGODB_READY:
        return False

    try:
        db = MongoDBConnection.get_db()
        interactions_col = db["user_interactions"]

        # Ensure index on user_id and created_at
        await interactions_col.create_index([("user_id", 1), ("created_at", -1)])

        doc = {
            "user_id": user_id,
            "song_id": song_id,
            "title": title,
            "artist": artist,
            "link": link,
            "interaction_type": interaction_type,  # 'play' | 'listen_30s' | 'skip_10s' | 'like'
            "mood_context": mood_context or "neutral",
            "created_at": datetime.utcnow()
        }
        await interactions_col.insert_one(doc)
        return True
    except Exception as e:
        print(f"[Recommender] Log interaction error: {e}")
        return False


# ==============================================================================
# 4. HYBRID CANDIDATE GENERATION & RE-RANKING
# ==============================================================================
async def generate_hybrid_recommendations(
    mood: str,
    search_func,
    user_profile: Dict[str, Any],
    custom_query: str = "",
    item_type: str = "music",
    limit: int = 8
) -> List[Dict[str, Any]]:
    """
    Thuật toán tạo danh sách gợi ý Hybrid:
    - Bước 1: Thu thập candidate pool đa nguồn (Mood queries + User taste seeds)
    - Bước 2: Chấm điểm theo Valence-Arousal, User Affinity, Skip Penalty, Novelty
    - Bước 3: Re-ranking và gán nhãn giải thích cho từng bài hát
    """
    mood_key = mood.lower() if mood else "neutral"
    mood_info = EMOTION_COORDINATES.get(mood_key, EMOTION_COORDINATES["neutral"])

    candidate_pool: List[Dict[str, Any]] = []
    seen_links = set()

    def add_candidates(items: List[Dict], source_tag: str):
        for it in items:
            link = it.get("link")
            if link and link not in seen_links:
                seen_links.add(link)
                candidate_copy = dict(it)
                candidate_copy["_source"] = source_tag
                candidate_pool.append(candidate_copy)

    # 1. Thu thập Candidate Pool từ Mood Queries (60% weight)
    if custom_query:
        mood_q = f"{custom_query} {mood_info['descriptors'][0]}"
        res = search_func(mood_q, type=item_type, limit=10)
        add_candidates(res, "custom_mood")
    else:
        # Chọn ngẫu nhiên 2 query từ danh sách biến thiên để tránh lặp kết quả
        queries = mood_info.get("music_queries", [mood_info.get("descriptors", [""])[0]])
        sampled_queries = random.sample(queries, min(2, len(queries)))
        for q in sampled_queries:
            res = search_func(q, type=item_type, limit=8)
            add_candidates(res, "mood_query")

    # 2. Thu thập Candidate Pool từ Gu cá nhân hóa (Personalized Seeds - 40% weight)
    fav_artists = user_profile.get("favorite_artists", {})
    if fav_artists and item_type == "music":
        # Sắp xếp lấy top 2 nghệ sĩ yêu thích nhất
        top_artists = sorted(fav_artists.items(), key=lambda x: x[1], reverse=True)[:2]
        for artist_name, _ in top_artists:
            if artist_name:
                personalized_q = f"{artist_name} {mood_info['descriptors'][0]}"
                res = search_func(personalized_q, type="music", limit=6)
                add_candidates(res, "personalized_artist")

    # 3. Chấm điểm & Re-ranking (Scoring)
    scored_candidates = []
    fav_artists_lower = {k.lower(): v for k, v in fav_artists.items()}
    skipped_links = user_profile.get("skipped_tracks", set())
    fav_links = user_profile.get("favorite_tracks", set())

    for cand in candidate_pool:
        title = cand.get("title", "").lower()
        artist = cand.get("artist", "").lower()
        link = cand.get("link", "")

        score = 5.0  # Base score

        # A. Mood relevance bonus
        for desc in mood_info.get("descriptors", []):
            if desc.lower() in title:
                score += 1.5

        # B. User Artist Affinity bonus
        match_artist = False
        for fa, weight in fav_artists_lower.items():
            if fa and (fa in artist or fa in title):
                score += min(weight, 5.0)  # Thưởng theo độ ưa thích nghệ sĩ
                match_artist = True
                break

        # C. Favorite track bonus
        if link in fav_links:
            score += 2.0

        # D. Skip Penalty (Phạt nặng các bài hay bị skip)
        if link in skipped_links:
            score -= 4.5

        # E. Novelty / Randomness (thêm độ tươi mới cho danh sách)
        score += random.uniform(-0.5, 0.5)

        # F. Match reason explanation
        if match_artist:
            reason = "Dựa trên gu nghệ sĩ bạn yêu thích"
        elif cand.get("_source") == "custom_mood":
            reason = f"Phù hợp với tìm kiếm & tâm trạng {mood_info['display']}"
        elif cand.get("_source") == "personalized_artist":
            reason = "Đề xuất theo sở thích của bạn"
        else:
            reason = f"Phù hợp cảm xúc {mood_info['display']}"

        cand["match_reason"] = reason
        cand["score"] = round(score, 2)
        scored_candidates.append(cand)

    # 4. Sắp xếp theo điểm giảm dần và lấy Top-K
    scored_candidates.sort(key=lambda x: x["score"], reverse=True)
    return scored_candidates[:limit]
