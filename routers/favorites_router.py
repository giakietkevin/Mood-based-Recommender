from fastapi import APIRouter, Depends, HTTPException, Form
from pydantic import BaseModel
from typing import List, Dict, Any
from auth import MongoDBConnection, get_current_user
from bson import ObjectId
from datetime import datetime

router = APIRouter(prefix="/favorites", tags=["Favorites"])

class SongToggleRequest(BaseModel):
    uid: str
    song: str # JSON string

@router.get("/music")
async def get_favorite_music(current_user: dict = Depends(get_current_user)):
    """Lấy danh sách bài hát yêu thích của user từ MongoDB"""
    db = MongoDBConnection.get_db()
    activity_col = db["user_activity"]

    # Tìm các hoạt động 'favorite_music' của user
    favorites = await activity_col.find({
        "user_id": current_user["_id"],
        "type": "favorite_music"
    }).sort("created_at", -1).to_list(length=1000)

    # Map về định dạng mảng các bài hát cũ cho frontend tương thích
    result = []
    for fav in favorites:
        result.append(fav["data"])

    return result

@router.post("/music/toggle")
async def toggle_favorite_music(
    song: str = Form(...),
    current_user: dict = Depends(get_current_user)
):
    """Thêm/Xoá bài hát khỏi danh sách yêu thích MongoDB"""
    import json
    db = MongoDBConnection.get_db()
    activity_col = db["user_activity"]

    try:
        song_data = json.loads(song)
        # Identify song by link or file_url
        song_id = song_data.get("link") or song_data.get("file_url")

        if not song_id:
            raise HTTPException(status_code=400, detail="Invalid song data: missing ID/URL")

        # Tìm bài hát này trong DB xem có chưa
        existing = await activity_col.find_one({
            "user_id": current_user["_id"],
            "type": "favorite_music",
            "$or": [
                {"data.link": song_id},
                {"data.file_url": song_id}
            ]
        })

        if existing:
            # Nếu có rồi thì XÓA (un-favorite)
            await activity_col.delete_one({"_id": existing["_id"]})
            return {"status": "success", "action": "removed"}
        else:
            # Nếu chưa có thì THÊM (favorite)
            new_fav = {
                "user_id": current_user["_id"],
                "type": "favorite_music",
                "data": song_data,
                "created_at": datetime.utcnow()
            }
            await activity_col.insert_one(new_fav)
            return {"status": "success", "action": "added"}

    except Exception as e:
        print(f"Error toggling favorite: {e}")
        raise HTTPException(status_code=500, detail=str(e))
