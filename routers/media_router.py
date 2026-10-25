"""
Media Router: lyrics, listening history and manual-mood recommendations.

- GET  /api/lyrics          Synced / plain lyrics from lrclib.net (no API key), cached in memory.
- GET  /api/history/recent  The signed-in user's recently played tracks (guests get an empty list).
- POST /recommend/mood      The same hybrid recommendations as /recommend, without a camera photo.

Design notes
- Every input is validated and length-capped; the lyrics proxy only talks to one fixed host.
- External calls have a hard timeout and run off the event loop (requests is blocking).
- Lyrics are cached per (title, artist) for 24 h with a size cap, so repeated plays cost nothing.
"""
import asyncio
import os
import re
import time
from collections import OrderedDict
from typing import Any, Dict, List, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from routers.recommend_router import _get_optional_user, _get_search_func
from services.recommender_service import (
    EMOTION_COORDINATES,
    extract_user_music_profile,
    generate_hybrid_recommendations,
    MONGODB_READY,
)

router = APIRouter(tags=["Media"])

LRCLIB_URL = "https://lrclib.net/api/get"
LRCLIB_SEARCH_URL = "https://lrclib.net/api/search"
LYRICS_TTL = 24 * 3600
LYRICS_MISS_TTL = 3600
LYRICS_CACHE_MAX = 500
_lyrics_cache: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()

# "(Official MV)", "[Lyric Video]", "ft. X", "| SƠN TÙNG M-TP" ... get in the way of an exact match.
_NOISE = re.compile(
    r"[\(\[][^\)\]]*(official|mv|m/v|lyric|lyrics|audio|video|visualizer|live|4k|hd|remaster|version)[^\)\]]*[\)\]]",
    re.IGNORECASE,
)
_FEAT = re.compile(r"\s+(ft\.?|feat\.?|featuring)\s+.*$", re.IGNORECASE)
_LRC_LINE = re.compile(r"^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$")


def _clean_title(title: str) -> str:
    t = _NOISE.sub("", title or "")
    t = _FEAT.sub("", t)
    return re.sub(r"\s+", " ", t).strip(" -|~")


def _split_artist(title: str, artist: str):
    """YouTube titles are often 'Artist - Song'. Use that when no artist is known."""
    if artist:
        return _clean_title(title), artist.strip()
    for sep in (" - ", " | ", " – "):
        if sep in title:
            a, s = title.split(sep, 1)
            return _clean_title(s), a.strip()
    return _clean_title(title), ""


def parse_lrc(text: str) -> List[Dict[str, Any]]:
    """Turn an LRC string into [{'t': seconds, 'text': line}], sorted by time."""
    lines: List[Dict[str, Any]] = []
    for raw in (text or "").splitlines():
        m = _LRC_LINE.match(raw.strip())
        if not m:
            continue
        frac = m.group(3) or "0"
        t = int(m.group(1)) * 60 + int(m.group(2)) + int(frac) / (10 ** len(frac))
        lines.append({"t": round(t, 2), "text": m.group(4).strip()})
    lines.sort(key=lambda x: x["t"])
    return lines


def _cache_get(key: str) -> Optional[Dict[str, Any]]:
    item = _lyrics_cache.get(key)
    if not item:
        return None
    if item["expires"] < time.time():
        _lyrics_cache.pop(key, None)
        return None
    _lyrics_cache.move_to_end(key)
    return item["value"]


def _cache_put(key: str, value: Dict[str, Any], ttl: int) -> None:
    _lyrics_cache[key] = {"value": value, "expires": time.time() + ttl}
    _lyrics_cache.move_to_end(key)
    while len(_lyrics_cache) > LYRICS_CACHE_MAX:
        _lyrics_cache.popitem(last=False)


def _usable(d: Dict[str, Any]) -> bool:
    """lrclib is community data: it holds placeholder rows (a single 'probe' line). Skip those."""
    if not d or d.get("instrumental"):
        return bool(d and d.get("instrumental"))
    synced = d.get("syncedLyrics") or ""
    plain = d.get("plainLyrics") or ""
    return synced.count("[") >= 4 or len(plain.strip()) >= 40


def _fetch_lyrics(track: str, artist: str, duration: Optional[int]) -> Optional[Dict[str, Any]]:
    headers = {"User-Agent": "KietStation/1.0 (lyrics lookup)"}
    params: Dict[str, Any] = {"track_name": track}
    if artist:
        params["artist_name"] = artist
    if duration:
        params["duration"] = duration
    try:
        r = requests.get(LRCLIB_URL, params=params, headers=headers, timeout=6)
        if r.status_code == 200 and _usable(r.json()):
            return r.json()
        # exact lookup missed or returned a placeholder: search and rank the real candidates
        s = requests.get(LRCLIB_SEARCH_URL, params={"q": f"{artist} {track}".strip()}, headers=headers, timeout=6)
        if s.status_code != 200 or not isinstance(s.json(), list):
            return None
        results = [x for x in s.json() if _usable(x)]
        if not results:
            return None

        def rank(x):
            gap = abs((x.get("duration") or 0) - duration) if duration else 0
            return (0 if x.get("syncedLyrics") else 1, gap)

        results.sort(key=rank)
        best = results[0]
        if duration and abs((best.get("duration") or 0) - duration) > 15:
            return None
        return best
    except (requests.RequestException, ValueError) as e:
        print(f"[Lyrics] lookup failed: {e}")
    return None



# ---- YouTube subtitles as a fallback ---------------------------------------
# Only subtitles that the uploader published (never auto-generated captions, which are
# often wrong on sung words). Marked as "youtube-subtitles" so the UI can say where they came from.
SUB_LANGS = ("vi", "en")
_VID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
_VTT_TIME = re.compile(r"(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s*-->")
_TAG = re.compile(r"<[^>]+>")


def _pick_sub(subtitles: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Choose a manual subtitle track: Vietnamese first, then English, preferring json3/vtt."""
    for lang in SUB_LANGS:
        for key, tracks in subtitles.items():
            if key == lang or key.lower().startswith(lang + "-"):
                by_ext = {t.get("ext"): t for t in tracks if t.get("url")}
                for ext in ("json3", "vtt"):
                    if ext in by_ext:
                        return {"lang": key, "ext": ext, "url": by_ext[ext]["url"]}
    return None


def _parse_json3(text: str) -> List[Dict[str, Any]]:
    import json

    lines = []
    for ev in json.loads(text).get("events", []):
        segs = ev.get("segs") or []
        line = "".join(sg.get("utf8", "") for sg in segs).replace("\n", " ").strip()
        if line and ev.get("tStartMs") is not None:
            lines.append({"t": round(ev["tStartMs"] / 1000.0, 2), "text": line})
    return lines


def _parse_vtt(text: str) -> List[Dict[str, Any]]:
    lines, cur_t, buf = [], None, []

    def flush():
        if cur_t is not None and buf:
            joined = _TAG.sub("", " ".join(buf)).strip()
            if joined:
                lines.append({"t": cur_t, "text": joined})

    for raw in text.splitlines():
        m = _VTT_TIME.search(raw)
        if m:
            flush()
            h = int(m.group(1) or 0)
            cur_t = round(h * 3600 + int(m.group(2)) * 60 + int(m.group(3)) + int(m.group(4)) / 1000.0, 2)
            buf = []
        elif raw.strip() and cur_t is not None and not raw.startswith(("WEBVTT", "NOTE")):
            buf.append(raw.strip())
    flush()
    return lines


def _clean_sub_lines(lines: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Drop sound cues like [Music] or a lone note, collapse consecutive duplicates, keep time order."""
    out: List[Dict[str, Any]] = []
    for ln in sorted(lines, key=lambda x: x["t"]):
        txt = re.sub(r"\s+", " ", ln["text"]).strip()
        if not txt or re.fullmatch(r"[♪♫\s]+", txt):
            continue
        if re.fullmatch(r"[\[\(].*[\]\)]", txt) and len(txt) < 24:  # [Music], (applause)
            continue
        if out and out[-1]["text"] == txt:
            continue
        out.append({"t": ln["t"], "text": txt})
    return out


def _fetch_youtube_subs(video_id: str) -> Optional[Dict[str, Any]]:
    import yt_dlp

    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "js_runtimes": {"node": {}},
        "socket_timeout": 10,
        "extractor_args": {"youtube": {"player_client": ["android", "ios", "web"], "player_skip": ["webpage", "configs"]}},
    }
    # YouTube often answers 429 to anonymous server IPs; a cookies file from a signed-in browser lifts that.
    cookies = os.environ.get("YTDLP_COOKIES_FILE")
    if cookies and os.path.exists(cookies):
        opts["cookiefile"] = cookies
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            track = _pick_sub(info.get("subtitles") or {})
            if not track:
                return None
            # reuse yt-dlp's own session (headers + cookies) instead of a bare requests call
            try:
                text = ydl.urlopen(track["url"]).read().decode("utf-8", errors="replace")
            except Exception as e:
                print(f"[Lyrics] subtitle download refused for {video_id}: {e}")
                return None
        lines = _parse_json3(text) if track["ext"] == "json3" else _parse_vtt(text)
        lines = _clean_sub_lines(lines)
        if len(lines) < 4:
            return None
        return {"lines": lines, "lang": track["lang"]}
    except Exception as e:  # yt-dlp raises many different errors; a miss must never break playback
        print(f"[Lyrics] subtitle lookup failed for {video_id}: {e}")
        return None


@router.get("/api/lyrics")
async def get_lyrics(
    title: str = Query(..., min_length=1, max_length=200),
    artist: str = Query("", max_length=120),
    duration: Optional[int] = Query(None, ge=1, le=7200),
    vid: Optional[str] = Query(None, max_length=11),
):
    if vid and not _VID_RE.match(vid):
        raise HTTPException(status_code=400, detail="invalid video id")
    track, who = _split_artist(title, artist)
    if not track:
        raise HTTPException(status_code=400, detail="title is empty after cleaning")

    key = f"{track.lower()}|{who.lower()}|{vid or ''}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    data = await asyncio.get_event_loop().run_in_executor(None, _fetch_lyrics, track, who, duration)

    if not data or (not data.get("syncedLyrics") and not data.get("plainLyrics")):
        if vid:
            subs = await asyncio.get_event_loop().run_in_executor(None, _fetch_youtube_subs, vid)
            if subs:
                result = {
                    "found": True,
                    "synced": subs["lines"],
                    "plain": "",
                    "instrumental": False,
                    "source": "youtube-subtitles",
                    "lang": subs["lang"],
                }
                _cache_put(key, result, LYRICS_TTL)
                return result
        result = {"found": False, "synced": [], "plain": "", "source": "lrclib.net"}
        _cache_put(key, result, LYRICS_MISS_TTL)
        return result

    result = {
        "found": True,
        "synced": parse_lrc(data.get("syncedLyrics") or ""),
        "plain": (data.get("plainLyrics") or "")[:20000],
        "instrumental": bool(data.get("instrumental")),
        "source": "lrclib.net",
    }
    _cache_put(key, result, LYRICS_TTL)
    return result


@router.get("/api/history/recent")
async def recent_history(
    limit: int = Query(20, ge=1, le=50),
    user_id: Optional[str] = Depends(_get_optional_user),
):
    """Distinct recently played tracks, newest first. Guests keep their history in the browser."""
    if not user_id or not MONGODB_READY:
        return {"items": [], "guest": True}
    try:
        from auth import MongoDBConnection

        db = MongoDBConnection.get_db()
        cursor = (
            db["user_interactions"]
            .find({"user_id": user_id, "interaction_type": "play"})
            .sort("created_at", -1)
            .limit(limit * 4)  # repeats collapse below
        )
        docs = await cursor.to_list(length=limit * 4)
    except Exception as e:
        print(f"[History] read error: {e}")
        raise HTTPException(status_code=503, detail="History is temporarily unavailable")

    seen, items = set(), []
    for d in docs:
        link = d.get("link")
        if not link or link in seen:
            continue
        seen.add(link)
        vid = re.search(r"(?:v=|youtu\.be/)([\w-]{11})", link) or re.fullmatch(r"([\w-]{11})", link)
        items.append({
            "title": d.get("title", ""),
            "artist": d.get("artist", ""),
            "link": link,
            "thumbnail": f"https://i.ytimg.com/vi/{vid.group(1)}/hqdefault.jpg" if vid else "",
            "played_at": d["created_at"].isoformat() + "Z" if d.get("created_at") else None,
        })
        if len(items) >= limit:
            break
    return {"items": items, "guest": False}


class MoodRequest(BaseModel):
    mood: str = Field(..., min_length=1, max_length=20)
    type: str = Field("music", pattern="^(music|podcast)$")
    q: str = Field("", max_length=100)


@router.post("/recommend/mood")
async def recommend_by_mood(
    body: MoodRequest,
    user_id: Optional[str] = Depends(_get_optional_user),
):
    mood_key = body.mood.strip().lower()
    mood_info = EMOTION_COORDINATES.get(mood_key)
    if not mood_info:
        raise HTTPException(status_code=400, detail=f"Unknown mood. Use one of: {', '.join(EMOTION_COORDINATES)}")

    user_profile = await extract_user_music_profile(user_id=user_id, guest_favorites=[])
    search_func = _get_search_func()
    recommendations = await generate_hybrid_recommendations(
        mood=mood_key,
        search_func=search_func,
        user_profile=user_profile,
        custom_query=body.q.strip(),
        item_type=body.type,
        limit=8,
    )
    if not recommendations:
        fallback = mood_info["music_queries"][0] if body.type == "music" else mood_info.get("podcast_query", "podcast thư giãn")
        raw = await asyncio.get_event_loop().run_in_executor(None, lambda: search_func(fallback, type=body.type, limit=8))
        recommendations = [{**r, "match_reason": f"Phù hợp cảm xúc {mood_info['display']}"} for r in raw]

    return {
        "status": "success",
        "mood": mood_key,
        "mood_display": mood_info["display"],
        "valence": mood_info["valence"],
        "arousal": mood_info["arousal"],
        "recommendations": recommendations,
        "personalized": bool(user_profile.get("favorite_artists")),
    }


@router.get("/api/moods")
async def list_moods():
    """Mood keys + display names for the manual picker."""
    return {"moods": [{"key": k, "display": v["display"], "valence": v["valence"], "arousal": v["arousal"]} for k, v in EMOTION_COORDINATES.items()]}
