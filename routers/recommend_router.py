"""
Recommend Router — Hybrid Personalized Mood Recommendation
- POST /recommend  : Nhận diện cảm xúc + Gợi ý lai cá nhân hoá
- POST /api/interaction : Ghi nhận phản hồi tương tác (like / listen_30s / skip_10s)
"""
import asyncio
import json
import os
import shutil
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from services.recommender_service import (
    EMOTION_COORDINATES,
    extract_user_music_profile,
    generate_hybrid_recommendations,
    log_user_interaction,
)

router = APIRouter(tags=["Recommendation"])

# Lazily import heavy deps to avoid circular
security = HTTPBearer(auto_error=False)


def _get_search_func():
    """Lấy hàm search từ main module (tránh circular import)"""
    from main import search_youtube_tracks
    return search_youtube_tracks


def _get_deepface():
    try:
        from deepface import DeepFace
        return DeepFace
    except Exception:
        return None


async def _get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[str]:
    """Lấy user_id nếu đã login, trả về None nếu là guest (không raise lỗi)."""
    if not credentials:
        return None
    try:
        from auth import verify_token, MongoDBConnection
        from bson import ObjectId
        user_id_str = verify_token(credentials.credentials)
        db = MongoDBConnection.get_db()
        user = await db["users"].find_one({"_id": ObjectId(user_id_str)})
        if user:
            return user_id_str
    except Exception:
        pass
    return None


# ==============================================================================
# POST /recommend — Nhận ảnh → Phân tích cảm xúc → Gợi ý Hybrid
# ==============================================================================
@router.post("/recommend")
async def recommend_hybrid(
    file: UploadFile = File(...),
    type: str = "music",
    q: str = Query(""),
    guest_favorites: Optional[str] = Form(None),
    user_id: Optional[str] = Depends(_get_optional_user),
):
    """
    Endpoint gợi ý nhạc Hybrid 3 lớp:
    1. Nhận diện cảm xúc từ ảnh (DeepFace chạy async qua run_in_executor)
    2. Trích xuất gu âm nhạc cá nhân từ MongoDB (Favorites + Interactions)
    3. Tạo danh sách gợi ý hybrid (Mood + Taste + Re-ranking)
    """
    temp_id = str(uuid.uuid4())
    t = f"temp_rec_{temp_id}.jpg"

    try:
        # Ghi file ảnh tạm
        with open(t, "wb") as b:
            shutil.copyfileobj(file.file, b)

        # ── Bước 1: Nhận diện cảm xúc (async, không chặn event loop) ──
        mood = "neutral"
        DeepFace = _get_deepface()
        if DeepFace:
            try:
                loop = asyncio.get_event_loop()
                res = await loop.run_in_executor(
                    None,
                    lambda: DeepFace.analyze(
                        t,
                        actions=["emotion"],
                        enforce_detection=False,
                        detector_backend="opencv"
                    )
                )
                mood = res[0]["dominant_emotion"]
            except Exception:
                try:
                    res = await loop.run_in_executor(
                        None,
                        lambda: DeepFace.analyze(
                            t,
                            actions=["emotion"],
                            enforce_detection=False,
                            detector_backend="ssd"
                        )
                    )
                    mood = res[0]["dominant_emotion"]
                except Exception as e:
                    print(f"[Recommend] DeepFace fallback error: {e}")
                    mood = "neutral"
    finally:
        if os.path.exists(t):
            try:
                os.remove(t)
            except Exception:
                pass

    mood_key = mood.lower()
    mood_info = EMOTION_COORDINATES.get(mood_key, EMOTION_COORDINATES["neutral"])

    # ── Bước 2: Trích xuất User Music Profile ──
    guest_favs_list = []
    if guest_favorites:
        try:
            guest_favs_list = json.loads(guest_favorites)
        except Exception:
            pass

    user_profile = await extract_user_music_profile(
        user_id=user_id,
        guest_favorites=guest_favs_list
    )

    # ── Bước 3: Sinh danh sách gợi ý Hybrid ──
    search_func = _get_search_func()
    recommendations = await generate_hybrid_recommendations(
        mood=mood_key,
        search_func=search_func,
        user_profile=user_profile,
        custom_query=q.strip(),
        item_type=type,
        limit=8
    )

    # Fallback nếu không có kết quả
    if not recommendations:
        fallback_query = mood_info["music_queries"][0] if type == "music" else mood_info.get("podcast_query", "podcast thư giãn")
        raw = search_func(fallback_query, type=type, limit=8)
        recommendations = [{**r, "match_reason": f"Phù hợp cảm xúc {mood_info['display']}"} for r in raw]

    return {
        "status": "success",
        "mood": mood,
        "mood_display": mood_info["display"],
        "valence": mood_info["valence"],
        "arousal": mood_info["arousal"],
        "recommendations": recommendations,
        "personalized": bool(user_profile.get("favorite_artists"))
    }


# ==============================================================================
# POST /api/interaction — Ghi nhận phản hồi (Feedback Loop)
# ==============================================================================
try:
    from pydantic import BaseModel
except Exception:
    from auth import BaseModel


class InteractionPayload(BaseModel):
    song_id: Optional[str] = ""
    title: Optional[str] = ""
    artist: Optional[str] = ""
    link: str
    interaction_type: str  # 'play' | 'listen_30s' | 'skip_10s' | 'like'
    mood_context: Optional[str] = "neutral"


@router.post("/api/interaction")
async def record_interaction(
    payload: InteractionPayload,
    user_id: Optional[str] = Depends(_get_optional_user),
):
    """
    Ghi nhận sự kiện tương tác của người dùng để cải thiện gợi ý:
    - play        → Người dùng bắt đầu nghe bài
    - listen_30s  → Nghe quá 30 giây (tín hiệu dương)
    - skip_10s    → Bỏ qua dưới 10 giây (tín hiệu âm)
    - like        → Bấm yêu thích (tín hiệu dương mạnh)
    """
    VALID_TYPES = {"play", "listen_30s", "skip_10s", "like"}
    if payload.interaction_type not in VALID_TYPES:
        return {"status": "error", "message": f"Invalid interaction_type. Must be one of: {VALID_TYPES}"}

    if not payload.link:
        return {"status": "error", "message": "link is required"}

    saved = await log_user_interaction(
        user_id=user_id,
        song_id=payload.song_id or payload.link,
        title=payload.title or "",
        artist=payload.artist or "",
        link=payload.link,
        interaction_type=payload.interaction_type,
        mood_context=payload.mood_context
    )

    return {
        "status": "saved" if saved else "guest_mode",
        "interaction_type": payload.interaction_type,
        "message": "Recorded" if saved else "Not logged (guest mode)"
    }
