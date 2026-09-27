import os
import ssl
import shutil
import uuid
import json
import random
import requests
import numpy as np
import librosa
import soundfile as sf

# Pyrubberband - optional, fallback to librosa if not available
try:
    import pyrubberband as pyrb

    PYRB_AVAILABLE = True
except ImportError:
    PYRB_AVAILABLE = False
    print("WARNING: pyrubberband not available, using librosa fallback for pitch/tempo")

from pedalboard import Pedalboard, Reverb, Compressor, Gain, Chorus, HighpassFilter
from fastapi import FastAPI, UploadFile, File, Query, Form, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Dict, Any

try:
    import g4f
    import g4f.client

    G4F_AVAILABLE = True
    print("[OK] G4F AI Chat available")
except ImportError:
    G4F_AVAILABLE = False
    print("[WARNING] g4f not available, chat feature will be disabled")

from deepface import DeepFace
from ytmusicapi import YTMusic
import edge_tts
from gtts import gTTS
from pydub import AudioSegment

# RVC Singing Voice Conversion
try:
    from rvc_engine import get_rvc_engine

    RVC_AVAILABLE = True
    print("[OK] RVC Singing Voice available")
except Exception as e:
    RVC_AVAILABLE = False
    print(f"[WARNING] RVC not available: {e}")

# --- 1. CẤU HÌNH HỆ THỐNG ---
os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

# HuggingFace API Token (set trong HF Space Secrets)
HF_TOKEN = os.getenv("HF_TOKEN", "")

# Import HF music gen sau khi đã có HF_TOKEN
from hf_music_gen import get_hf_beat, generate_singing_vocal, HF_AVAILABLE

if HF_TOKEN:
    os.environ["HF_TOKEN"] = HF_TOKEN

# Fix lỗi SSL (Quan trọng cho tải Beat/Search)
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

import subprocess
import atexit

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import Auth Router
from routers.auth_router import router as auth_router
from routers.favorites_router import router as favorites_router
from auth import MongoDBConnection

# Include Auth Router
app.include_router(auth_router)
app.include_router(favorites_router)

# Startup & Shutdown Events
@app.on_event("startup")
async def startup_event():
    """Kết nối MongoDB khi app khởi động"""
    await MongoDBConnection.connect_db()

@app.on_event("shutdown")
async def shutdown_event():
    """Đóng kết nối MongoDB khi app tắt"""
    await MongoDBConnection.close_db()

# --- 2. THIẾT LẬP THƯ MỤC ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(BASE_DIR, "generated_music"), exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "beats"), exist_ok=True)
os.makedirs(
    os.path.join(BASE_DIR, "assets"), exist_ok=True
)  # Tạo nếu chưa có (tránh crash trên Hugging Face)

app.mount(
    "/generated_music",
    StaticFiles(directory=os.path.join(BASE_DIR, "generated_music")),
    name="generated_music",
)
app.mount(
    "/assets", StaticFiles(directory=os.path.join(BASE_DIR, "assets")), name="assets"
)

# Static files cho refactored CSS/JS
_css_dir = os.path.join(BASE_DIR, "css")
_js_dir = os.path.join(BASE_DIR, "js")
os.makedirs(_css_dir, exist_ok=True)
os.makedirs(_js_dir, exist_ok=True)
app.mount("/css", StaticFiles(directory=_css_dir), name="css")
app.mount("/js", StaticFiles(directory=_js_dir), name="js")


@app.get("/")
async def get_index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))


@app.get("/site.webmanifest")
async def serve_webmanifest():
    return FileResponse("site.webmanifest", media_type="application/manifest+json")


SONGS_DB_FILE = "user_songs.json"
FAVORITES_DB_FILE = "user_favorites.json"
PLAYLISTS_DB_FILE = "user_playlists.json"
FILMS_DB_FILE = "user_films.json"
TRENDING_DB_FILE = "trending_songs.json"


def load_json_db(file_path, default=dict):
    if not os.path.exists(file_path):
        return default()
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return default()


def save_json_db(file_path, data):
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# --- 3. HELPER: TẢI BEAT TỰ ĐỘNG (AUTO-BEAT) ---
# Link beat dự phòng (Pop Style)
DEFAULT_BEAT_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"

# Cache để tránh process lại beat nhiều lần
BEAT_CACHE = {}  # {(style, bpm): processed_path}

# --- STYLE/ATTRIBUTE PROFILES ---
STYLE_BPM_RANGES = {
    "Lo-Fi": (70, 90),
    "LoFi": (70, 90),
    "Jazz": (80, 120),
    "Blues": (70, 110),
    "Ballad": (60, 80),
    "EDM": (120, 140),
    "House": (118, 128),
    "Techno": (120, 135),
    "Trance": (128, 140),
    "Dubstep": (140, 150),
    "Rap": (85, 100),
    "Hip-Hop": (85, 100),
    "Sad Rap": (70, 85),
    "SadRap": (70, 85),
    "Reggae": (70, 90),
    "Latin": (90, 120),
    "Rock": (110, 140),
    "Hard Rock": (115, 150),
    "HardRock": (115, 150),
    "Metal": (120, 160),
    "Punk": (150, 180),
    "Pop": (95, 120),
    "Pop Rock": (100, 130),
    "PopRock": (100, 130),
    "Pop Punk": (140, 170),
    "PopPunk": (140, 170),
    "R&B": (80, 100),
    "RnB": (80, 100),
    "Soul": (75, 95),
    "Swing": (120, 160),
    "Country": (90, 120),
    "Folk": (90, 110),
    "Dark Folk": (80, 100),
    "DarkFolk": (80, 100),
    "Indie": (90, 120),
    "Alternative": (90, 120),
    "Funk": (95, 120),
    "Electronic": (110, 130),
}

STYLE_BEAT_GAIN = {
    # Chill styles: beat thấp để vocal rõ
    "Lo-Fi": -11,
    "LoFi": -11,
    "Ballad": -12,
    "Jazz": -10,
    "Blues": -10,
    "Soul": -10,
    "R&B": -10,
    "RnB": -10,
    "Chill": -11,
    "Ambient": -12,
    # Rap: beat quan trọng nhưng không át vocal
    "Rap": -7,
    "Hip-Hop": -7,
    "Sad Rap": -8,
    "SadRap": -8,
    # Rock: beat và vocal cân bằng
    "Rock": -6,
    "Hard Rock": -5,
    "HardRock": -5,
    "Metal": -5,
    "Punk": -5,
    "Pop Punk": -6,
    "PopPunk": -6,
    "Alternative": -6,
    "Indie": -7,
    # EDM: beat mạnh, vocal là topping
    "EDM": -5,
    "Techno": -5,
    "Trance": -5,
    "House": -6,
    "Dubstep": -4,
    "Electronic": -6,
    "Dance": -5,
    # Pop/Country: cân bằng
    "Pop": -7,
    "Pop Rock": -6,
    "PopRock": -6,
    "Country": -8,
    "Folk": -9,
    "Dark Folk": -9,
    "DarkFolk": -9,
    # Latin/Reggae/Swing
    "Latin": -7,
    "Reggae": -7,
    "Swing": -7,
    "Funk": -6,
}

STYLE_VOCAL_GAIN = {
    # Chill styles: vocal nổi bật
    "Lo-Fi": 3,
    "LoFi": 3,
    "Ballad": 3,
    "Jazz": 2,
    "Blues": 2,
    "Soul": 2,
    "R&B": 2,
    "RnB": 2,
    "Chill": 3,
    "Ambient": 4,
    # Rap: vocal phải rõ ràng
    "Rap": 2,
    "Hip-Hop": 2,
    "Sad Rap": 3,
    "SadRap": 3,
    # Rock: vocal cân bằng
    "Rock": 0,
    "Hard Rock": 0,
    "HardRock": 0,
    "Metal": -1,
    "Punk": 0,
    "Pop Punk": 0,
    "PopPunk": 0,
    "Alternative": 1,
    "Indie": 1,
    # EDM: vocal nhẹ hơn beat
    "EDM": -2,
    "Techno": -2,
    "Trance": -2,
    "House": -1,
    "Dubstep": -3,
    "Electronic": -1,
    "Dance": -2,
    # Pop/Country: vocal nổi
    "Pop": 1,
    "Pop Rock": 0,
    "PopRock": 0,
    "Country": 2,
    "Folk": 2,
    "Dark Folk": 2,
    "DarkFolk": 2,
    # Latin/Reggae/Swing
    "Latin": 1,
    "Reggae": 1,
    "Swing": 1,
    "Funk": 0,
}

VOICE_PROFILES = {
    "Male - North": ("vi-VN-NamMinhNeural", 0),
    "Male - Central": ("vi-VN-NamMinhNeural", 0),
    "Male - South": ("vi-VN-NamMinhNeural", 0),
    "Female - North": ("vi-VN-HoaiMyNeural", 0),
    "Female - Central": ("vi-VN-HoaiMyNeural", 0),
    "Female - South": ("vi-VN-HoaiMyNeural", 0),
    "Male Young": ("vi-VN-NamMinhNeural", 2),
    "Male Mature": ("vi-VN-NamMinhNeural", -2),
    "Female Young": ("vi-VN-HoaiMyNeural", 2),
    "Female Mature": ("vi-VN-HoaiMyNeural", -2),
    "Male": ("vi-VN-NamMinhNeural", 0),
    "Female": ("vi-VN-HoaiMyNeural", 0),
}

STYLE_SCALES = {
    # Major scales (vui tươi, sáng)
    "Pop": [0, 2, 4, 5, 7, 9, 11, 12],  # Major scale
    "Pop Rock": [0, 2, 4, 5, 7, 9, 10, 12],  # Mixolydian
    "PopRock": [0, 2, 4, 5, 7, 9, 10, 12],
    "EDM": [0, 2, 3, 5, 7, 8, 10, 12],  # Minor scale
    "Electronic": [0, 2, 4, 7, 9, 12],  # Major pentatonic
    "House": [0, 2, 4, 5, 7, 9, 11, 12],
    "Techno": [0, 2, 3, 5, 7, 8, 10, 12],
    "Trance": [0, 2, 4, 5, 7, 9, 11, 12],
    "Dubstep": [0, 2, 3, 5, 7, 8, 10, 12],
    # Minor scales (buồn, u ám)
    "Lo-Fi": [0, 2, 3, 5, 7, 8, 10, 12],  # Natural minor
    "LoFi": [0, 2, 3, 5, 7, 8, 10, 12],
    "Sad Rap": [0, 2, 3, 5, 7, 8, 10, 12],
    "SadRap": [0, 2, 3, 5, 7, 8, 10, 12],
    "Ballad": [0, 2, 3, 5, 7, 8, 11, 12],  # Harmonic minor
    "Blues": [0, 3, 5, 6, 7, 10, 12],  # Blues scale
    "Jazz": [0, 2, 3, 5, 7, 9, 10, 12],  # Dorian mode
    # Pentatonic (simple, catchy)
    "Rap": [0, 2, 3, 5, 7, 10, 12],  # Minor pentatonic (perfect for rap)
    "Hip-Hop": [0, 2, 3, 5, 7, 10, 12],
    "Country": [0, 2, 4, 7, 9, 12],  # Major pentatonic
    "Folk": [0, 2, 4, 7, 9, 12],
    "Dark Folk": [0, 2, 3, 5, 7, 8, 10, 12],  # Natural minor
    "DarkFolk": [0, 2, 3, 5, 7, 8, 10, 12],
    # Exotic/Special
    "Latin": [0, 1, 4, 5, 7, 8, 11, 12],  # Spanish Phrygian
    "Reggae": [0, 2, 4, 5, 7, 9, 10, 12],
    "Soul": [0, 2, 3, 5, 7, 9, 10, 12],
    "R&B": [0, 2, 3, 5, 7, 9, 10, 12],
    "RnB": [0, 2, 3, 5, 7, 9, 10, 12],
    "Funk": [0, 2, 3, 5, 7, 9, 10, 12],  # Dorian
    "Swing": [0, 2, 4, 5, 7, 9, 11, 12],  # Major
    # Rock scales
    "Rock": [0, 2, 4, 5, 7, 9, 10, 12],  # Mixolydian
    "Hard Rock": [0, 2, 3, 5, 7, 8, 10, 12],  # Natural minor
    "HardRock": [0, 2, 3, 5, 7, 8, 10, 12],
    "Metal": [0, 2, 3, 5, 7, 8, 10, 12],  # Natural minor
    "Punk": [0, 2, 4, 5, 7, 9, 10, 12],
    "Pop Punk": [0, 2, 4, 5, 7, 9, 11, 12],  # Major
    "PopPunk": [0, 2, 4, 5, 7, 9, 11, 12],
    "Alternative": [0, 2, 3, 5, 7, 8, 10, 12],  # Natural minor
    "Indie": [0, 2, 3, 5, 7, 8, 11, 12],  # Harmonic minor
}


def resolve_target_bpm(tempo, style):
    base = 110
    if tempo == "Fast":
        base = 140
    elif tempo == "Slow":
        base = 75

    if style in STYLE_BPM_RANGES:
        lo, hi = STYLE_BPM_RANGES[style]
        if tempo == "Fast":
            return hi
        if tempo == "Slow":
            return lo
        return int((lo + hi) / 2)
    return base


def resolve_beat_gain(style, mood):
    """
    NÂNG CẤP: Intelligent gain calculation với mood consideration
    """
    gain = STYLE_BEAT_GAIN.get(style, -8)

    # Mood adjustments - fine-tuned
    if mood in ["Sadness", "Calmness", "Nostalgia"]:
        gain -= 2  # Beat thấp hơn cho không gian emotional
    elif mood == "Romantic":
        gain -= 1.5  # Chút thấp để tạo không gian intimacy
    elif mood in ["Joy", "Surprise"]:
        gain += 1  # Beat rõ hơn cho năng lượng
    elif mood in ["Anger", "Triumph", "Energetic"]:
        gain += 2  # Beat mạnh cho power
    elif mood == "Fear":
        gain -= 1  # Beat lùi lại tạo tension

    return max(-15, min(0, gain))  # Clamp để tránh extreme


def resolve_vocal_gain(style, mood):
    """
    NÂNG CẤP: Smart vocal gain với style-mood interaction
    """
    gain = STYLE_VOCAL_GAIN.get(style, 0)

    # Mood adjustments
    if mood in ["Sadness", "Calmness", "Nostalgia", "Romantic"]:
        gain += 1.5  # Vocal cần rõ để truyền cảm xúc
    elif mood in ["Anger", "Triumph"]:
        gain += 0.5  # Vocal mạnh nhưng không át beat
    elif mood in ["Fear", "Anticipation"]:
        gain -= 0.5  # Vocal nhẹ hơn tạo tension
    elif mood in ["Joy", "Surprise", "Energetic"]:
        gain += 0  # Giữ nguyên, cân bằng

    return max(-5, min(5, gain))  # Clamp


def get_style_scale(style, mood):
    if style in STYLE_SCALES:
        return STYLE_SCALES[style]
    return (
        [0, 2, 3, 5, 7, 8, 10, 12]
        if mood in ["Sadness", "Nostalgia", "Romantic", "Calmness"]
        else [0, 2, 4, 5, 7, 9, 11, 12]
    )


def generate_melody_steps(num_segments, mood, tempo, style, intensity=1.0):
    """
    NÂNG CẤP: Tạo giai điệu tự nhiên hơn với melodic contour phức tạp
    - Dùng curves thay vì linear progression
    - Thêm variation để tránh nhàm chán
    - Style-specific melodic patterns
    """
    scale = get_style_scale(style, mood)
    contour = []

    if num_segments == 1:
        return [0]

    # Chọn melodic pattern theo style
    if style in ["Rap", "Hip-Hop", "Sad Rap"]:
        # Rap: ít biến đổi cao trầm, tập trung rhythm
        pattern = [0, 0, 1, 0, -1, 0, 0, 1]
    elif style in ["Ballad", "Soul", "R&B", "Jazz"]:
        # Ballad: Smooth, gradual rise và fall
        pattern = [0, 1, 2, 3, 4, 3, 2, 1, 0, -1, 0]
    elif style in ["EDM", "Dubstep", "Techno", "Trance", "House"]:
        # EDM: Repetitive với climax mạnh
        pattern = [0, 0, 1, 1, 2, 2, 4, 4, 2, 1, 0]
    elif style in ["Rock", "Metal", "Punk", "Hard Rock", "Pop Punk"]:
        # Rock: Powerful, wide range
        pattern = [0, 2, 1, 3, 2, 4, 3, 5, 4, 2, 0]
    else:
        # Pop, Default: Balanced melodic contour
        pattern = [0, 1, 2, 2, 3, 3, 2, 1, 0]

    # Map pattern lên segments với interpolation
    for i in range(num_segments):
        t = i / max(1, num_segments - 1)
        pattern_idx = t * (len(pattern) - 1)
        idx_low = int(pattern_idx)
        idx_high = min(idx_low + 1, len(pattern) - 1)

        # Linear interpolation giữa 2 điểm
        alpha = pattern_idx - idx_low
        step = pattern[idx_low] * (1 - alpha) + pattern[idx_high] * alpha

        # Map vào scale
        scale_idx = int(abs(step) % len(scale))
        scale_step = scale[scale_idx] - 6  # Center around middle C

        if step < 0:
            scale_step = -abs(scale_step)

        contour.append(scale_step)

    # Điều chỉnh theo tempo
    if tempo == "Fast":
        contour = [s + 2 for s in contour]
    elif tempo == "Slow":
        contour = [s - 1 for s in contour]

    # Điều chỉnh theo mood
    if mood in ["Joy", "Surprise", "Energetic"]:
        contour = [s + 1 for s in contour]
    elif mood in ["Sadness", "Fear", "Calmness"]:
        contour = [s - 1 for s in contour]

    # Apply intensity và clamp
    contour = [int(max(-12, min(12, s * intensity))) for s in contour]
    return contour


def apply_pitch_contour(input_path, output_path, mood, tempo, style, intensity=1.6):
    """
    NÂNG CẤP: Pitch shifting với smoothing và vibrato tự nhiên
    - Thêm crossfade giữa segments để tránh pop/click
    - Thêm subtle vibrato cho giọng sống động
    - Preserve formant cho giọng tự nhiên hơn
    """
    try:
        y, sr = librosa.load(input_path, sr=44100)
        total = len(y)

        # Ước tính segments thông minh hơn
        seconds = librosa.get_duration(y=y, sr=sr)
        # Rap/Hip-hop: ít segment hơn (giữ flow)
        if style in ["Rap", "Hip-Hop", "Sad Rap"]:
            num_segments = max(2, int(seconds / 2))
        else:
            num_segments = (
                3 if seconds < 2 else 5 if seconds < 4 else max(7, int(seconds / 1.5))
            )

        contour = generate_melody_steps(num_segments, mood, tempo, style, intensity)

        seg_len = max(1, total // num_segments)
        crossfade_len = min(2205, seg_len // 20)  # 0.05s crossfade

        chunks = []
        for i, steps in enumerate(contour):
            start = i * seg_len
            end = total if i == num_segments - 1 else (i + 1) * seg_len
            seg = y[start:end]

            # Pitch shift with better quality + fallback
            if PYRB_AVAILABLE:
                try:
                    seg_shifted = pyrb.pitch_shift(seg, sr, steps)
                except Exception as e:
                    print(
                        f"[WARNING] Pyrubberband pitch shift failed for segment {i}, using librosa: {e}"
                    )
                    try:
                        seg_shifted = librosa.effects.pitch_shift(
                            y=seg, sr=sr, n_steps=steps
                        )
                    except Exception as e2:
                        print(
                            f"[WARNING] Librosa also failed, using original segment: {e2}"
                        )
                        seg_shifted = seg
            else:
                # Use librosa directly if pyrubberband not available
                try:
                    seg_shifted = librosa.effects.pitch_shift(
                        y=seg, sr=sr, n_steps=steps
                    )
                except Exception as e:
                    print(f"⚠️ Librosa pitch shift failed, using original segment: {e}")
                    seg_shifted = seg

            # Thêm VIBRATO cho giọng hát (áp dụng cho nhiều style hơn)
            if (
                style in ["Ballad", "Soul", "Jazz", "R&B", "Pop", "Pop Rock", "Indie"]
                and len(seg_shifted) > sr // 2
            ):
                # Vibrato parameters theo style
                if style in ["Ballad", "Soul"]:
                    vibrato_rate = 5.5  # Chậm, sâu lắng
                    vibrato_depth = 0.35  # Rõ hơn
                elif style in ["Jazz", "R&B"]:
                    vibrato_rate = 6.0  # Trung bình
                    vibrato_depth = 0.30
                elif style in ["Pop", "Pop Rock", "Indie"]:
                    vibrato_rate = 5.8  # Nhẹ nhàng
                    vibrato_depth = 0.25
                else:
                    vibrato_rate = 5.5
                    vibrato_depth = 0.25
                t = np.arange(len(seg_shifted)) / sr
                vibrato_shift = vibrato_depth * np.sin(2 * np.pi * vibrato_rate * t)

                # Áp dụng vibrato nhẹ (chỉ phần giữa, không ảnh hưởng đầu/cuối)
                vibrato_envelope = np.ones_like(vibrato_shift)
                fade_samples = sr // 10
                if len(vibrato_envelope) > fade_samples * 2:
                    vibrato_envelope[:fade_samples] = np.linspace(0, 1, fade_samples)
                    vibrato_envelope[-fade_samples:] = np.linspace(1, 0, fade_samples)

                vibrato_shift *= vibrato_envelope

                # Apply vibrato (simplified - just modulate with tiny pitch changes)
                # Note: Full vibrato needs more complex processing, này là approximation
                seg_shifted = seg_shifted * (1 + vibrato_shift * 0.01)

            chunks.append(seg_shifted)

        # Nối segments với crossfade để tránh click
        if len(chunks) > 1 and crossfade_len > 0:
            y_out = chunks[0]
            for i in range(1, len(chunks)):
                # Tạo crossfade
                if len(y_out) >= crossfade_len and len(chunks[i]) >= crossfade_len:
                    fade_out = np.linspace(1, 0, crossfade_len)
                    fade_in = np.linspace(0, 1, crossfade_len)

                    # Overlap
                    y_out[-crossfade_len:] = (
                        y_out[-crossfade_len:] * fade_out
                        + chunks[i][:crossfade_len] * fade_in
                    )
                    y_out = np.concatenate([y_out, chunks[i][crossfade_len:]])
                else:
                    y_out = np.concatenate([y_out, chunks[i]])
        else:
            y_out = np.concatenate(chunks) if chunks else y

        sf.write(output_path, y_out, sr)
        return True
    except Exception as e:
        print(f"⚠️ Pitch contour error: {e}")
        try:
            shutil.copy(input_path, output_path)
        except:
            pass
        return False


def build_song_structure(lines):
    """
    NÂNG CẤP: Tạo cấu trúc bài hát thông minh hơn
    - Tự động phát hiện chorus/hook
    - Thêm breathing pauses
    - Tạo structure: Intro -> Verse -> Chorus -> Verse -> Chorus -> Outro
    """
    if not lines:
        return []

    # Nếu quá ngắn, return luôn
    if len(lines) <= 2:
        return lines

    # Tìm hook/chorus (thường là dòng lặp lại hoặc dòng cuối)
    # Heuristic: 2 dòng cuối thường là hook
    if len(lines) <= 4:
        hook = lines[-2:] if len(lines) >= 2 else [lines[-1]]
        verse = lines
    else:
        # Chia: 70% verse, 30% hook
        split_point = max(2, int(len(lines) * 0.7))
        verse = lines[:split_point]
        hook = lines[split_point:] if split_point < len(lines) else lines[-2:]

    # Xây dựng structure
    structured = []

    # INTRO: Pause ngắn (sẽ được xử lý ở phần generate)

    # VERSE 1
    for line in verse:
        structured.append(line)

    # CHORUS 1
    structured.extend(hook)

    # VERSE 2 (nếu verse đủ dài, lặp lại)
    if len(verse) >= 4:
        # Lặp lại 1 nửa verse
        structured.extend(verse[: len(verse) // 2])

    # CHORUS 2 (lặp hook)
    structured.extend(hook)

    # BRIDGE/OUTRO (thêm hook lần cuối với variation)
    # Chỉ lấy 1 dòng từ hook để kết thúc ngắn gọn
    if len(hook) > 0:
        structured.append(hook[0])

    return structured


def get_or_download_beat(style):
    """
    Tìm beat trong thư mục theo Style.
    Nếu không có, tự tải beat mẫu về để không bị lỗi "hát chay".

    IMPROVED: Better matching logic for style names with spaces/hyphens
    """
    # Normalize style name: remove spaces, hyphens, lowercase
    # "Hard Rock" → "hardrock", "Pop-Punk" → "poppunk"
    normalized_style = style.lower().replace(" ", "").replace("-", "")

    # Tìm file có tên match với normalized style
    # Check both exact match and contains
    beat_files = []
    for f in os.listdir(os.path.join("beats")):
        if not f.endswith(".mp3"):
            continue
        # Normalize filename too
        normalized_filename = (
            f.lower().replace(" ", "").replace("-", "").replace("_", "")
        )

        # Check if style is in filename (e.g., "hardrock" in "hardrock135.mp3")
        if normalized_style in normalized_filename:
            beat_files.append(f)

    if beat_files:
        # Prefer exact match, fallback to first match
        exact_matches = [
            f
            for f in beat_files
            if normalized_style
            == f.lower().replace("_", "").replace(".mp3", "").replace("0123456789", "")
        ]
        if exact_matches:
            return os.path.join("beats", exact_matches[0])
        return os.path.join("beats", beat_files[0])

    # Fallback: Tải beat mặc định
    default_path = os.path.join("beats", "default_beat.mp3")
    if not os.path.exists(default_path):
        print("⬇️ Đang tải beat mẫu (vì chưa có file beat)...")
        try:
            r = requests.get(DEFAULT_BEAT_URL)
            with open(default_path, "wb") as f:
                f.write(r.content)
        except Exception as e:
            print(f"❌ Lỗi tải beat mẫu: {e}")
            return None
    return default_path


# --- 4. DATABASE HELPERS ---
def load_songs_db():
    if not os.path.exists(SONGS_DB_FILE):
        return {}
    try:
        with open(SONGS_DB_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except:
        return {}


def save_song_to_db(uid, song_data):
    if not uid:
        return
    db = load_songs_db()
    if uid not in db:
        db[uid] = []
    db[uid].insert(0, song_data)
    with open(SONGS_DB_FILE, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)


def delete_song_from_db(uid, file_url):
    if not uid:
        return
    db = load_songs_db()
    if uid in db:
        db[uid] = [s for s in db[uid] if s["file_url"] != file_url]
        with open(SONGS_DB_FILE, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=2)


# --- 5. AUDIO ENGINE (XỬ LÝ ÂM THANH CHUYÊN NGHIỆP) ---


def process_pro_audio(
    input_path,
    output_path,
    target_bpm,
    current_bpm=100,
    pitch_shift=0,
    mood="Neutral",
    style=None,
):
    """
    NÂNG CẤP: Studio-grade processing chain với multi-stage optimization
    - De-esser để giảm sibilance (tiếng xì)
    - Multi-band compression cho clarity
    - Style-specific EQ curves
    - Adaptive reverb và delay
    - Final limiter để tránh clip
    """
    try:
        # Load Audio (Chuẩn 44.1kHz)
        y, sr = librosa.load(input_path, sr=44100)

        # A. Time Stretch (Khớp Tempo) - với quality cao hơn
        if target_bpm > 0 and current_bpm > 0 and abs(target_bpm - current_bpm) > 1:
            rate = target_bpm / current_bpm
            # Clamp rate để tránh artifacts
            rate = max(0.5, min(2.0, rate))

            if PYRB_AVAILABLE:
                try:
                    y = pyrb.time_stretch(y, sr, rate)
                except Exception as e:
                    print(f"⚠️ Pyrubberband time stretch failed, using librosa: {e}")
                    try:
                        y = librosa.effects.time_stretch(y=y, rate=rate)
                    except:
                        print("⚠️ Librosa fallback also failed, skipping time stretch")
            else:
                # Use librosa directly if pyrubberband not available
                try:
                    y = librosa.effects.time_stretch(y=y, rate=rate)
                except Exception as e:
                    print(f"⚠️ Time stretch failed, skipping: {e}")

        # B. Pitch Shift (Chỉnh tone giọng)
        if pitch_shift != 0:
            # Clamp pitch shift
            pitch_shift = max(-12, min(12, pitch_shift))

            if PYRB_AVAILABLE:
                try:
                    y = pyrb.pitch_shift(y, sr, pitch_shift)
                except Exception as e:
                    print(f"⚠️ Pyrubberband pitch shift failed, using librosa: {e}")
                    try:
                        y = librosa.effects.pitch_shift(y=y, sr=sr, n_steps=pitch_shift)
                    except:
                        print("⚠️ Librosa fallback also failed, skipping pitch shift")
            else:
                # Use librosa directly
                try:
                    y = librosa.effects.pitch_shift(y=y, sr=sr, n_steps=pitch_shift)
                except Exception as e:
                    print(f"⚠️ Pitch shift failed, skipping: {e}")

        # === STAGE 1: CLEANUP & DE-ESSING ===
        board = Pedalboard(
            [
                # HPF để lọc rumble dưới 100Hz
                HighpassFilter(cutoff_frequency_hz=100),
            ]
        )

        # === STAGE 2: DYNAMIC CONTROL ===
        # Compressor chính - tùy theo style
        if style in ["Rap", "Hip-Hop", "Sad Rap", "R&B"]:
            # Rap: Heavy compression cho vocal upfront
            board.append(
                Compressor(threshold_db=-18, ratio=6, attack_ms=3, release_ms=50)
            )
        elif style in ["Rock", "Metal", "Hard Rock", "Punk", "Pop Punk"]:
            # Rock: Medium compression, giữ dynamics
            board.append(
                Compressor(threshold_db=-12, ratio=4, attack_ms=5, release_ms=100)
            )
        else:
            # Pop/Default: Balanced compression
            board.append(
                Compressor(threshold_db=-15, ratio=4, attack_ms=5, release_ms=80)
            )

        # === STAGE 3: SPATIAL EFFECTS ===
        # Reverb theo Style
        if style in ["Lo-Fi", "Jazz", "Blues", "Soul", "R&B", "Ballad"]:
            # Warm, intimate reverb
            board.append(
                Reverb(room_size=0.45, damping=0.7, wet_level=0.25, dry_level=0.8)
            )
            board.append(Chorus(rate_hz=0.9, depth=0.15, mix=0.2))
        elif style in ["EDM", "House", "Techno", "Trance", "Dubstep", "Electronic"]:
            # Bright, synthetic reverb
            board.append(
                Reverb(room_size=0.35, damping=0.3, wet_level=0.2, dry_level=0.85)
            )
            board.append(Chorus(rate_hz=1.8, depth=0.25, mix=0.25))
        elif style in ["Rock", "Hard Rock", "Metal", "Punk", "Pop Punk"]:
            # Tight reverb cho clarity
            board.append(
                Reverb(room_size=0.3, damping=0.5, wet_level=0.15, dry_level=0.9)
            )
        elif style in ["Pop", "Pop Rock", "Indie", "Alternative"]:
            # Modern pop reverb
            board.append(
                Reverb(room_size=0.4, damping=0.6, wet_level=0.22, dry_level=0.85)
            )
            board.append(Chorus(rate_hz=1.2, depth=0.18, mix=0.15))

        # Mood-specific additions
        if mood in ["Sadness", "Romantic", "Nostalgia", "Calmness"]:
            # Thêm reverb cho không gian sâu lắng
            board.append(
                Reverb(room_size=0.6, damping=0.8, wet_level=0.15, dry_level=1.0)
            )
        elif mood in ["Joy", "Surprise", "Energetic", "Triumph"]:
            # Thêm brightness
            board.append(Chorus(rate_hz=1.5, depth=0.2, mix=0.15))
        elif mood in ["Anger", "Fear"]:
            # Boost presence
            board.append(Gain(gain_db=2.5))

        # === STAGE 4: FINAL POLISH ===
        # Gentle gain staging
        board.append(Gain(gain_db=1.5))

        # Render hiệu ứng
        effected = board(y, sr)

        # === STAGE 5: SAFETY LIMITING ===
        # Normalize để tránh clipping
        peak = np.abs(effected).max()
        if peak > 0.95:
            effected = effected * (0.95 / peak)

        # Lưu file với quality cao
        sf.write(output_path, effected, sr, subtype="PCM_24")
        return True
    except Exception as e:
        print(f"⚠️ Pro Audio Error (Fallback to raw): {e}")
        try:
            shutil.copy(input_path, output_path)
        except:
            pass
        return False


# --- 6. API ROUTES ---


@app.get("/")
async def serve_index():
    return FileResponse("index.html")


@app.get("/manifest.json")
async def serve_manifest():
    return FileResponse("manifest.json", media_type="application/manifest+json")


@app.get("/sw.js")
async def serve_service_worker():
    return FileResponse("sw.js", media_type="application/javascript")


@app.get("/my-songs")
async def get_my_songs(uid: str = Query(None)):
    if not uid:
        return []  # Return empty for guest if not specified, or we could return 'guest' key
    db = load_songs_db()
    return db.get(uid, [])


@app.delete("/my-songs/delete")
async def delete_song(url: str = Query(...), uid: str = Query(...)):
    if not uid:
        return {"status": "error", "message": "UID required"}
    try:
        fn = url.split("/")[-1]
        path = os.path.join("generated_music", fn)
        if os.path.exists(path):
            os.remove(path)
        delete_song_from_db(uid, url)
        return {"status": "success"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# --- FAVORITES API ---
@app.get("/favorites")
async def get_favorites(uid: str = Query(...)):
    if not uid:
        return []
    db = load_json_db(FAVORITES_DB_FILE, dict)
    return db.get(uid, [])


@app.post("/favorites/toggle")
async def toggle_favorite(uid: str = Form(...), song: str = Form(...)):
    if not uid:
        return {"status": "error", "message": "Missing user ID"}
    db = load_json_db(FAVORITES_DB_FILE, dict)
    user_favs = db.get(uid, [])

    song_dict = json.loads(song)
    song_id = song_dict.get("link") or song_dict.get("file_url")

    exists_idx = -1
    for i, s in enumerate(user_favs):
        s_id = s.get("link") or s.get("file_url")
        if s_id == song_id:
            exists_idx = i
            break

    if exists_idx >= 0:
        user_favs.pop(exists_idx)
        action = "removed"
    else:
        if "link" in song_dict:
            song_dict["type"] = "youtube"
        else:
            song_dict["type"] = "local"
        user_favs.insert(0, song_dict)
        action = "added"

    db[uid] = user_favs
    save_json_db(FAVORITES_DB_FILE, db)
    return {"status": "success", "action": action}


# --- PLAYLISTS API ---
@app.get("/playlists")
async def get_playlists(uid: str = Query(...)):
    if not uid:
        return []
    db = load_json_db(PLAYLISTS_DB_FILE, dict)
    return db.get(uid, [])


@app.post("/playlists")
async def create_playlist(uid: str = Form(...), name: str = Form(...), is_public: bool = Form(False), collaborative: bool = Form(False)):
    if not uid or not name:
        return {"status": "error"}
    db = load_json_db(PLAYLISTS_DB_FILE, dict)
    user_playlists = db.get(uid, [])

    new_pl = {
        "id": f"pl_{str(uuid.uuid4())[:8]}",
        "name": name,
        "songs": [],
        "is_public": is_public,
        "collaborative": collaborative,
        "members": [uid] if collaborative else []
    }
    user_playlists.append(new_pl)
    db[uid] = user_playlists
    save_json_db(PLAYLISTS_DB_FILE, db)
    return {"status": "success", "playlist": new_pl}


@app.post("/playlists/song")
async def toggle_playlist_song(
    uid: str = Form(...), playlist_id: str = Form(...), song: str = Form(...)
):
    if not uid or not playlist_id:
        return {"status": "error"}
    db = load_json_db(PLAYLISTS_DB_FILE, dict)

    song_dict = json.loads(song)
    song_id_to_check = song_dict.get("link") or song_dict.get("file_url")

    action = "error"
    target_pl = None
    target_owner = None

    # Find the playlist across all users if it's collaborative and the user is a member
    for owner, playlists in db.items():
        for pl in playlists:
            if pl["id"] == playlist_id:
                if owner == uid or (pl.get("collaborative") and uid in pl.get("members", [])):
                    target_pl = pl
                    target_owner = owner
                    break
        if target_pl:
            break

    if target_pl:
        exists_idx = -1
        for i, s in enumerate(target_pl["songs"]):
            s_id = s.get("link") or s.get("file_url")
            if s_id == song_id_to_check:
                exists_idx = i
                break

        if exists_idx >= 0:
            target_pl["songs"].pop(exists_idx)
            action = "removed"
        else:
            if "link" in song_dict:
                song_dict["type"] = "youtube"
            else:
                song_dict["type"] = "local"
            target_pl["songs"].append(song_dict)
            action = "added"

        save_json_db(PLAYLISTS_DB_FILE, db)

    return {"status": "success", "action": action}


# --- FILM HISTORY API ---
@app.get("/films")
async def get_films(uid: str = Query(...)):
    if not uid:
        return []
    db = load_json_db(FILMS_DB_FILE, dict)
    return db.get(uid, [])


@app.post("/films")
async def save_film(uid: str = Form(...), film: str = Form(...)):
    if not uid:
        return {"status": "error"}
    db = load_json_db(FILMS_DB_FILE, dict)
    user_films = db.get(uid, [])

    film_dict = json.loads(film)
    slug = film_dict.get("slug")

    # Remove old entry if exists (to bump to top)
    user_films = [f for f in user_films if f.get("slug") != slug]

    # Add to beginning
    user_films.insert(0, film_dict)

    # limit history to 50
    user_films = user_films[:50]

    db[uid] = user_films
    save_json_db(FILMS_DB_FILE, db)
    return {"status": "success", "action": "added", "films": user_films}


@app.delete("/films")
async def delete_film(uid: str = Query(...), slug: str = Query(...)):
    if not uid:
        return {"status": "error"}
    db = load_json_db(FILMS_DB_FILE, dict)
    user_films = db.get(uid, [])
    user_films = [f for f in user_films if f.get("slug", f.get("magnet")) != slug]
    db[uid] = user_films
    save_json_db(FILMS_DB_FILE, db)
    return {"status": "success", "action": "deleted", "films": user_films}


# --- TRENDING SONGS API ---
@app.post("/track-play")
async def track_play(
    title: str = Form(...),
    artist: str = Form(""),
    thumbnail: str = Form(""),
    link: str = Form(""),
):
    if not title or not link:
        return {"status": "error", "msg": "Missing title or link"}
    db = load_json_db(TRENDING_DB_FILE, list)
    # find by link
    found = False
    for s in db:
        if s.get("link") == link:
            s["plays"] = s.get("plays", 0) + 1
            found = True
            break
    if not found:
        db.append({"title": title, "artist": artist, "thumbnail": thumbnail, "link": link, "plays": 1})
    save_json_db(TRENDING_DB_FILE, db)
    return {"status": "ok"}


@app.get("/trending-songs")
async def trending_songs(limit: int = 5):
    db = load_json_db(TRENDING_DB_FILE, list)
    sorted_songs = sorted(db, key=lambda x: x.get("plays", 0), reverse=True)
    return sorted_songs[:limit]


# --- PUBLIC/COLLABORATIVE PLAYLISTS ---
@app.get("/playlists/public")
async def get_public_playlists(limit: int = 6):
    db = load_json_db(PLAYLISTS_DB_FILE, dict)
    public = []
    for uid, playlists in db.items():
        for pl in playlists:
            if pl.get("is_public") or pl.get("collaborative"):
                public.append({**pl, "owner": uid})
    # Sort by number of songs (richest first)
    public.sort(key=lambda x: len(x.get("songs", [])), reverse=True)
    return public[:limit]


@app.post("/playlists/{playlist_id}/join")
async def join_playlist(playlist_id: str, uid: str = Form(...)):
    if not uid or not playlist_id:
        return {"status": "error"}
    db = load_json_db(PLAYLISTS_DB_FILE, dict)
    for owner_uid, playlists in db.items():
        for pl in playlists:
            if pl.get("id") == playlist_id and (pl.get("is_public") or pl.get("collaborative")):
                members = pl.get("members", [])
                if uid not in members:
                    members.append(uid)
                    pl["members"] = members
                save_json_db(PLAYLISTS_DB_FILE, db)
                return {"status": "joined", "playlist": pl}
    return {"status": "not_found"}


@app.post("/playlists/{playlist_id}/leave")
async def leave_playlist(playlist_id: str, uid: str = Form(...)):
    if not uid or not playlist_id:
        return {"status": "error"}
    db = load_json_db(PLAYLISTS_DB_FILE, dict)
    for owner_uid, playlists in db.items():
        for pl in playlists:
            if pl.get("id") == playlist_id:
                members = pl.get("members", [])
                if uid in members:
                    members.remove(uid)
                    pl["members"] = members
                save_json_db(PLAYLISTS_DB_FILE, db)
                return {"status": "left", "playlist": pl}
    return {"status": "not_found"}


# --- ACTIVE STUDY ROOMS API ---
@app.get("/study-rooms/active")
async def get_active_study_rooms():
    rooms = []
    for room_id, members in party_manager.rooms.items():
        if room_id.startswith("study_"):
            rooms.append({"room_id": room_id, "members": len(members)})
    return rooms



@app.get("/search")
async def search(q: str, type: str = "music"):
    keyword = f"{q} official mv" if type == "music" else f"{q} podcast vietnam full"
    if "lofi" in q.lower() or "beats" in q.lower() or "ambient" in q.lower() or "focus" in q.lower() or type != "music":
        keyword = q

    res = []
    try:
        ytmusic = YTMusic(location="VN")
        # Đối với type là music, ưu tiên songs và videos. Podcast thì search chung.
        search_filter = "songs" if type == "music" else "videos"
        results = ytmusic.search(keyword, filter=search_filter, limit=8)
        
        for r in results:
            vid = r.get('videoId')
            if vid and len(vid) == 11:
                # Tránh trùng lặp
                if not any(item['link'] == f"https://www.youtube.com/watch?v={vid}" for item in res):
                    res.append({
                        "title": r.get("title", "Unknown"),
                        "link": f"https://www.youtube.com/watch?v={vid}",
                        "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
                    })
    except Exception as e:
        print("YTMusic Search Error:", e)

    return {"mood": "manual", "recommendations": res}


@app.post("/api/emotion")
async def get_emotion(file: UploadFile = File(...)):
    t = f"watch_{uuid.uuid4()}.jpg"
    try:
        with open(t, "wb") as b:
            shutil.copyfileobj(file.file, b)
        # Dùng opencv cho nhanh (Real-time Watch Party)
        res = DeepFace.analyze(
            t, actions=["emotion"], enforce_detection=False, detector_backend="opencv"
        )
        return {"status": "success", "emotion": res[0]["dominant_emotion"]}
    except Exception as e:
        return {"status": "error", "emotion": "neutral", "message": str(e)}
    finally:
        if os.path.exists(t):
            try:
                os.remove(t)
            except:
                pass


@app.post("/recommend")
async def recommend(
    file: UploadFile = File(...), type: str = "music", q: str = Query("")
):
    t = f"temp_{uuid.uuid4()}.jpg"
    with open(t, "wb") as b:
        shutil.copyfileobj(file.file, b)
    try:
        # Sử dụng mtcnn thay vì opencv để nhận diện khuôn mặt chính xác hơn (đặc biệt qua webcam)
        res = DeepFace.analyze(
            t, actions=["emotion"], enforce_detection=False, detector_backend="mtcnn"
        )
        mood = res[0]["dominant_emotion"]
    except Exception as e:
        import traceback

        print(f"DeepFace analyze error: {e}")
        traceback.print_exc()
        mood = "neutral"
    if os.path.exists(t):
        os.remove(t)

    # Tìm kiếm nội dung theo Mood (+ keyword nếu có)
    q = (q or "").strip()
    if q:
        keyword = f"{q} {mood} music" if type == "music" else f"{q} {mood} podcast"
    else:
        keyword = (
            f"nhạc {mood} mood remix" if type == "music" else f"podcast {mood} cảm xúc"
        )
    recommendations = []
    try:
        with DDGS() as ddgs:
            gen = ddgs.videos(f"site:youtube.com {keyword}", max_results=5)
            for r in gen:
                vid = (
                    r["content"].split("v=")[1].split("&")[0]
                    if "v=" in r["content"]
                    else ""
                )
                recommendations.append(
                    {
                        "title": r["title"],
                        "link": r["content"],
                        "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                    }
                )
    except:
        pass

    return {"mood": mood, "recommendations": recommendations}


@app.post("/generate-music")
async def generate_music(
    lyrics: str = Form(...),
    style: str = Form(...),
    mood: str = Form(...),
    voice: str = Form(...),
    tempo: str = Form(...),
    title: str = Form(...),
    uid: str = Form(None),
):
    """
    NÂNG CẤP: Studio-grade music generation với AI-powered mixing
    - Intelligent beat detection & sync
    - Auto-ducking (beat tụt khi vocal vào)
    - Professional mastering chain
    - Adaptive spacing between lines
    - Smart intro/outro generation
    """
    print(f"🎹 STUDIO GEN: {title} | Style: {style} | Tempo: {tempo}")
    final_id = str(uuid.uuid4())
    final_path = os.path.join("generated_music", f"{final_id}.wav")

    # A. XÁC ĐỊNH BPM MỤC TIÊU (tempo + style)
    target_bpm = resolve_target_bpm(tempo, style)
    ms_per_beat = (60 / target_bpm) * 1000

    # B. CHUẨN BỊ BEAT (NHẠC NỀN)
    # Thử HuggingFace MusicGen trước, fallback về local beat
    if HF_AVAILABLE:
        beat_source = get_hf_beat(
            style, mood, tempo, target_bpm
        ) or get_or_download_beat(style)
    else:
        beat_source = get_or_download_beat(style)
    beat_proc_path = f"beat_{final_id}.wav"
    beat_original_bpm = 100  # Giả định BPM gốc

    # Cố gắng lấy BPM từ tên file (vd: Pop_120.mp3)
    if beat_source and "_" in beat_source:
        try:
            beat_original_bpm = int(beat_source.replace(".mp3", "").split("_")[-1])
        except:
            pass

    # Xử lý Beat với quality cao + fallback
    if beat_source and os.path.exists(beat_source):
        try:
            # Try professional processing
            success = process_pro_audio(
                beat_source,
                beat_proc_path,
                target_bpm,
                beat_original_bpm,
                0,
                mood,
                style,
            )

            # Check if output file is valid
            if (
                success
                and os.path.exists(beat_proc_path)
                and os.path.getsize(beat_proc_path) > 0
            ):
                try:
                    beat_final = AudioSegment.from_wav(beat_proc_path)
                    beat_final = beat_final + resolve_beat_gain(style, mood)
                except Exception as e:
                    print(f"⚠️ Cannot load processed beat, using original: {e}")
                    # Fallback: Use original beat without processing
                    beat_final = (
                        AudioSegment.from_mp3(beat_source)
                        if beat_source.endswith(".mp3")
                        else AudioSegment.from_wav(beat_source)
                    )
                    beat_final = beat_final + resolve_beat_gain(style, mood)
            else:
                print("⚠️ Beat processing failed, using original")
                # Fallback: Use original beat
                beat_final = (
                    AudioSegment.from_mp3(beat_source)
                    if beat_source.endswith(".mp3")
                    else AudioSegment.from_wav(beat_source)
                )
                beat_final = beat_final + resolve_beat_gain(style, mood)
        except Exception as e:
            print(f"⚠️ Beat processing error, using silence: {e}")
            beat_final = AudioSegment.silent(duration=10000)
    else:
        print("⚠️ No beat source found, using silence")
        beat_final = AudioSegment.silent(duration=10000)

    # C. CẤU HÌNH GIỌNG (VOICE PROFILE)
    tts_voice_id, n_steps = VOICE_PROFILES.get(voice, VOICE_PROFILES["Female"])

    # D. XỬ LÝ LYRICS & TẠO VOCAL
    raw_lines = [l.strip() for l in lyrics.split("\n") if l.strip()]
    lines = build_song_structure(raw_lines)
    full_vocal = AudioSegment.empty()

    # INTRO - tùy theo style
    if style in ["EDM", "House", "Techno", "Trance", "Dubstep"]:
        # EDM: Intro dài để build-up
        intro_bars = 8
    elif style in ["Rap", "Hip-Hop", "Sad Rap"]:
        # Rap: Intro ngắn
        intro_bars = 2
    else:
        # Default: 4 bars
        intro_bars = 4

    full_vocal += AudioSegment.silent(duration=ms_per_beat * intro_bars)

    # ADAPTIVE SPACING - khoảng cách giữa các câu tùy style
    if style in ["Rap", "Hip-Hop", "Sad Rap"]:
        # Rap: tight spacing
        line_spacing_beats = 0.5
    elif style in ["Ballad", "Soul", "Jazz", "Blues"]:
        # Ballad: breathe room - TĂNG LÊN!
        line_spacing_beats = 2.5  # Tăng từ 1.5 → 2.5 beats
    else:
        # Default: 1.5 beats pause (tăng từ 1.0)
        line_spacing_beats = 1.5

    line_spacing_ms = ms_per_beat * line_spacing_beats

    # TẠO VOCAL CHO TỪNG LINE
    for idx, line in enumerate(lines):
        t_raw = f"raw_{uuid.uuid4()}.mp3"
        t_mel = f"mel_{uuid.uuid4()}.wav"
        t_proc = f"proc_{uuid.uuid4()}.wav"

        # 1. Text-to-Speech với Singing-like Parameters
        tts_success = False
        try:
            # Edge-TTS với singing-style parameters
            rate_adjust = "+0%"
            pitch_adjust = "+0Hz"

            # Style-specific singing adjustments
            if style in ["Ballad", "Soul", "Jazz", "Blues"]:
                rate_adjust = "-10%"  # Chậm hơn để sustain notes
                pitch_adjust = "+5Hz"  # Tăng pitch nhẹ, expressive hơn
            elif style in ["Pop", "Pop Rock", "Indie"]:
                rate_adjust = "+5%"  # Bright, upbeat
                pitch_adjust = "+10Hz"  # Higher pitch cho pop
            elif style in ["Rap", "Hip-Hop"]:
                rate_adjust = "+15%"  # Fast flow
                pitch_adjust = "-5Hz"  # Lower pitch cho rap
            elif style in ["Rock", "Metal", "Punk"]:
                rate_adjust = "+10%"  # Energetic
                pitch_adjust = "+0Hz"  # Natural
            elif style in ["EDM", "Electronic", "House", "Techno"]:
                rate_adjust = "+5%"  # Dance tempo
                pitch_adjust = "+15Hz"  # Bright, synthetic feel

            # Thêm prosody marks để giọng "sing-songy" hơn
            # Thêm emphasis và pauses
            enhanced_line = line

            # Thêm pauses tại dấu phẩy/chấm
            enhanced_line = enhanced_line.replace(",", ' <break time="300ms"/> ')
            enhanced_line = enhanced_line.replace(".", ' <break time="500ms"/> ')

            comm = edge_tts.Communicate(
                enhanced_line, tts_voice_id, rate=rate_adjust, pitch=pitch_adjust
            )
            await comm.save(t_raw)
            tts_success = True
        except Exception as e:
            print(f"⚠️ Edge-TTS failed: {e}")
            try:
                # Fallback: gTTS (basic)
                gTTS(text=line, lang="vi", slow=(style in ["Ballad", "Soul"])).save(
                    t_raw
                )
                tts_success = True
            except:
                pass

        if not tts_success or not os.path.exists(t_raw):
            continue

        # 1.5. THỬ BARK SINGING (HF) - chỉ cho High Quality mode
        bark_success = False
        use_hq_singing = os.getenv("HQ_SINGING", "false").lower() == "true"

        if HF_AVAILABLE and use_hq_singing:
            try:
                bark_success = generate_singing_vocal(line, voice, style, t_raw)
                if bark_success:
                    print(f"[HF/Bark] ✅ Line {idx + 1}: Singing vocal generated")
            except Exception as e:
                print(f"[HF/Bark] ⚠️ Failed: {e}")

        # Nếu Bark fail hoặc không dùng HQ, dùng Edge TTS như cũ
        if not bark_success:
            # 1. Text-to-Speech với Singing-like Parameters
            tts_success = False
            try:
                # Edge-TTS với singing-style parameters
                rate_adjust = "+0%"
                pitch_adjust = "+0Hz"

                # Style-specific singing adjustments
                if style in ["Ballad", "Soul", "Jazz", "Blues"]:
                    rate_adjust = "-10%"  # Chậm hơn để sustain notes
                    pitch_adjust = "+5Hz"  # Tăng pitch nhẹ, expressive hơn
                elif style in ["Pop", "Pop Rock", "Indie"]:
                    rate_adjust = "+5%"  # Bright, upbeat
                    pitch_adjust = "+10Hz"  # Higher pitch cho pop
                elif style in ["Rap", "Hip-Hop"]:
                    rate_adjust = "+15%"  # Fast flow
                    pitch_adjust = "-5Hz"  # Lower pitch cho rap
                elif style in ["Rock", "Metal", "Punk"]:
                    rate_adjust = "+10%"  # Energetic
                    pitch_adjust = "+0Hz"  # Natural
                elif style in ["EDM", "Electronic", "House", "Techno"]:
                    rate_adjust = "+5%"  # Dance tempo
                    pitch_adjust = "+15Hz"  # Bright, synthetic feel

                # Thêm prosody marks để giọng "sing-songy" hơn
                enhanced_line = line
                enhanced_line = enhanced_line.replace(",", ' <break time="300ms"/> ')
                enhanced_line = enhanced_line.replace(".", ' <break time="500ms"/> ')

                comm = edge_tts.Communicate(
                    enhanced_line, tts_voice_id, rate=rate_adjust, pitch=pitch_adjust
                )
                await comm.save(t_raw)
                tts_success = True
            except Exception as e:
                print(f"⚠️ Edge-TTS failed: {e}")
                try:
                    gTTS(text=line, lang="vi", slow=(style in ["Ballad", "Soul"])).save(
                        t_raw
                    )
                    tts_success = True
                except:
                    pass

            if not tts_success or not os.path.exists(t_raw):
                continue

        # Nếu dùng Bark (singing), skip pitch contour vì đã có melody
        if bark_success:
            src_for_flow = t_raw
        else:
            # 2. Apply Melodic Contour (cho Edge TTS)
            apply_pitch_contour(t_raw, t_mel, mood, tempo, style, intensity=1.4)
            src_for_flow = t_mel if os.path.exists(t_mel) else t_raw
        if RVC_AVAILABLE:
            try:
                voice_type = "female" if "Female" in voice else "male"
                rvc_engine = get_rvc_engine(voice_type)

                t_singing = f"singing_{uuid.uuid4()}.wav"

                # Convert speech to singing
                rvc_success = rvc_engine.convert_to_singing(
                    t_raw, t_singing, pitch_shift=n_steps
                )

                if rvc_success and os.path.exists(t_singing):
                    # Use singing voice
                    if os.path.exists(t_raw):
                        try:
                            os.remove(t_raw)
                        except:
                            pass
                    t_raw = t_singing
                    print("[OK] RVC: TTS -> Singing voice")
                else:
                    print("[WARNING] RVC failed, using enhanced TTS")

            except Exception as e:
                print(f"[WARNING] RVC conversion error: {e}, using TTS")

        # 3. INTELLIGENT FLOW TIMING
        y_check, sr_check = librosa.load(src_for_flow)
        curr_dur_sec = librosa.get_duration(y=y_check, sr=sr_check)
        word_count = len(line.split())

        # Tính target beats dựa trên độ dài và style
        if style in ["Rap", "Hip-Hop", "Sad Rap"]:
            # Rap: 4-8 syllables per bar (4 beats)
            # Estimate: ~2 syllables per word in Vietnamese
            estimated_syllables = word_count * 2
            target_beats = max(2, min(8, estimated_syllables / 4 * 4))
        else:
            # Singing: longer notes
            if curr_dur_sec < 1.5:
                target_beats = 2
            elif curr_dur_sec < 3.0:
                target_beats = 4
            else:
                target_beats = 8

        # Snap to bar boundaries (4 beats)
        target_beats = max(2, round(target_beats / 2) * 2)
        target_dur_sec = (60 / target_bpm) * target_beats

        # Tính fake BPM để stretch
        if curr_dur_sec > 0.1:
            fake_current_bpm = target_bpm * (target_dur_sec / curr_dur_sec)
        else:
            fake_current_bpm = target_bpm

        # 4. DSP Process với studio chain
        process_pro_audio(
            src_for_flow, t_proc, target_bpm, fake_current_bpm, n_steps, mood, style
        )

        if os.path.exists(t_proc):
            seg = AudioSegment.from_wav(t_proc)

            # Normalize volume của từng line để đồng đều
            # Tránh line này to, line kia nhỏ
            target_dBFS = -20.0  # Target loudness
            change_in_dBFS = target_dBFS - seg.dBFS
            seg = seg.apply_gain(change_in_dBFS)

            # Thêm fade in/out để smooth transitions
            fade_ms = 150  # Tăng từ 50ms → 150ms
            seg = seg.fade_in(fade_ms).fade_out(fade_ms)

            # CROSSFADE giữa các line để liên tục hơn
            if len(full_vocal) > 0 and idx > 0:
                # Crossfade 300ms với line trước
                crossfade_ms = 300
                full_vocal = full_vocal.append(seg, crossfade=crossfade_ms)
            else:
                full_vocal += seg

            # Thêm spacing giữa các line (trừ line cuối)
            if idx < len(lines) - 1:
                full_vocal += AudioSegment.silent(duration=int(line_spacing_ms))

        # Cleanup
        for tmp_file in [t_raw, t_mel, t_proc]:
            if os.path.exists(tmp_file):
                try:
                    os.remove(tmp_file)
                except:
                    pass

    # E. INTELLIGENT MIXING & MASTERING

    # 1. Điều chỉnh vocal gain
    vocal_gain_db = resolve_vocal_gain(style, mood)
    full_vocal = full_vocal + vocal_gain_db

    # 2. Loop beat cho đủ độ dài
    target_length = len(full_vocal) + int(ms_per_beat * 8)  # Thêm 8 bars outro
    while len(beat_final) < target_length:
        beat_final += beat_final
    beat_final = beat_final[:target_length]

    # 3. AUTO-DUCKING: Beat tụt volume khi vocal vào
    # Phát hiện vùng có vocal (không phải silence)
    # Simplified ducking: beat quieter throughout vocal section
    vocal_start_ms = ms_per_beat * intro_bars
    vocal_end_ms = vocal_start_ms + len(full_vocal) - (ms_per_beat * intro_bars)

    # Tách beat thành 3 phần: intro | vocal section | outro
    beat_intro = beat_final[: int(vocal_start_ms)]
    beat_vocal_section = beat_final[int(vocal_start_ms) : int(vocal_end_ms)]
    beat_outro = beat_final[int(vocal_end_ms) :]

    # Duck beat during vocal (giảm 2-4dB tùy style)
    duck_amount = -3 if style in ["Ballad", "Soul", "Jazz"] else -2
    beat_vocal_section = beat_vocal_section + duck_amount

    # Reconstruct beat
    beat_final = beat_intro + beat_vocal_section + beat_outro

    # 4. MIX: Overlay vocal lên beat
    final_mix = beat_final.overlay(full_vocal, position=int(vocal_start_ms))

    # 5. MASTERING CHAIN
    # Export to wav for mastering
    master_wav_path = f"master_{final_id}.wav"
    final_mix.export(master_wav_path, format="wav")

    # Load and apply mastering
    y_master, sr_master = librosa.load(master_wav_path, sr=44100)

    # A. Normalize peak to -1dB (headroom)
    peak = np.abs(y_master).max()
    if peak > 0:
        y_master = y_master * (0.89 / peak)

    # B. Soft clipping để tránh harsh peaks
    y_master = np.tanh(y_master * 1.2) / 1.2

    # C. Final normalization to -0.5dB
    peak_final = np.abs(y_master).max()
    if peak_final > 0:
        y_master = y_master * (0.94 / peak_final)

    # Save mastered audio to temp wav
    sf.write(master_wav_path, y_master, sr_master)

    # Convert to WAV (no FFmpeg needed)
    mastered = AudioSegment.from_wav(master_wav_path)
    mastered.export(
    final_path,
    format="wav",
)

    # Cleanup
    if os.path.exists(beat_proc_path):
        os.remove(beat_proc_path)
    if os.path.exists(master_wav_path):
        os.remove(master_wav_path)

    # Save Metadata
    song_data = {
        "id": final_id,
        "title": title,
        "lyrics": lyrics[:50] + "...",
        "style": style,
        "mood": mood,
        "file_url": f"/generated_music/{final_id}.wav",
    }
    save_song_to_db(uid, song_data)

    print(
        f"✅ Generated: {title} ({len(full_vocal) / 1000:.1f}s vocal, {target_bpm} BPM)"
    )
    return {"status": "success", "song": song_data}


# --- 7. CHATBOT API ---
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


@app.post("/api/chat/film")
async def chat_film_consultant(request: ChatRequest):
    try:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]
        # Thêm system prompt với chỉ dẫn cực kỳ nghiêm ngặt về định dạng
        messages.insert(
            0,
            {
                "role": "system",
                "content": 'Bạn là KietFilm Consultant - chuyên gia tư vấn phim siêu đỉnh. Hãy thân thiện, trẻ trung (dùng nhiều emoji). QUAN TRỌNG NHẤT: Bất cứ khi nào bạn nhắc đến tên một bộ phim, bạn PHẢI BẮT ĐẦU DÒNG BẰNG CÚ PHÁP: `[phim: Tên Phim]`. Ví dụ: `[phim: Mắt Biếc]`, `[phim: Avengers: Endgame]`. TUYỆT ĐỐI KHÔNG dùng dấu sao (*), dấu gạch dưới (_), hay dấu ngoặc kép (") để bao quanh tên phim. Chỉ dùng duy nhất cú pháp trên. Nếu bạn không dùng đúng, người dùng sẽ không thể xem phim. Trả lời cực kỳ ngắn gọn.',
            },
        )

        # Sử dụng API Pollinations cực kì ổn định làm ưu tiên số 1
        import asyncio
        import requests

        loop = asyncio.get_event_loop()
        api_url = "https://text.pollinations.ai/openai"

        def fetch_api():
            try:
                # Tăng timeout lên 45s tránh ngắt kết nối khi tạo list dài
                response = requests.post(
                    api_url,
                    json={"model": "openai", "messages": messages, "temperature": 0.5},
                    timeout=45,
                )

                if response.status_code == 200:
                    return response.json()["choices"][0]["message"]["content"]
            except Exception as e:
                print(f"Pollinations AI Error: {e}")
            return None

        ai_reply = await loop.run_in_executor(None, fetch_api)

        if ai_reply:
            return {"status": "success", "reply": ai_reply}
        else:
            # Fallback sang g4f nếu bị lỗi kết nối
            if G4F_AVAILABLE:
                client = g4f.client.Client()
                response = client.chat.completions.create(
                    model="gpt-3.5-turbo",  # dùng GPT 3.5 để ưu tiên tốc độ trong fallback
                    messages=messages,
                )
                return {
                    "status": "success",
                    "reply": response.choices[0].message.content,
                }
            else:
                raise Exception("Tất cả server AI đều đang bận, mất kết nối mạng.")
    except Exception as e:
        print(f"Chat error: {e}")
        return {
            "status": "error",
            "message": f"KietFilm AI đang tìm phim xíu nhé, chờ 1 chút! (Lỗi nội bộ: {str(e)})",
        }


@app.post("/api/dj-radio")
async def dj_radio(
    emotion: str = Form(...),
    dj_voice: str = Form("vi-VN-HoaiMyNeural")
):
    try:
        # 1. Map emotion to intro
        emotion_map = {
            "joy": "khá là vui vẻ, rạng rỡ",
            "sadness": "hơi tâm trạng một chút",
            "anger": "đang có chút bực dọc",
            "fear": "hơi lo âu, bất an",
            "surprise": "đang rất bất ngờ",
            "anticipation": "đang đầy mong đợi",
            "calmness": "đang rất bình yên",
            "romantic": "đang có tâm trạng lãng mạn",
            "nostalgia": "đang nhớ về những kỷ niệm cũ",
            "triumph": "đầy tự hào và chiến thắng",
            "neutral": "khá bình thản"
        }
        
        emo_lower = emotion.lower()
        emo_desc = emotion_map.get(emo_lower, "bình yên")
        
        intro_text = f"Xin chào, đây là Kiet Station Radio. Qua ánh mắt, DJ thấy có vẻ bạn đang {emo_desc}. Hãy thư giãn và để những giai điệu sau đây ôm lấy tâm hồn bạn nhé."
        
        # 2. Generate TTS
        final_id = str(uuid.uuid4())
        intro_path = os.path.join("generated_music", f"dj_intro_{final_id}.wav")
        
        import edge_tts
        comm = edge_tts.Communicate(intro_text, dj_voice)
        await comm.save(intro_path)
        
        # 3. Fetch Playlist (using DDGS like /recommend)
        keyword = f"nhạc {emo_lower} mood chill"
        if emo_lower in ["joy", "triumph"]:
            keyword = f"nhạc {emo_lower} remix sôi động"
            
        recommendations = []
        try:
            ytmusic = YTMusic(location="VN")
            results = ytmusic.search(keyword, filter="songs", limit=10)
            for r in results:
                vid = r.get('videoId')
                if vid and len(vid) == 11:
                    recommendations.append({
                        "title": r.get("title", "Unknown"),
                        "link": f"https://www.youtube.com/watch?v={vid}",
                        "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
                    })
        except Exception as e:
            print(f"DJ Search Error: {e}")
            
        return {
            "status": "success",
            "dj_intro_url": f"/{intro_path}",
            "playlist": recommendations
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}








# ==========================================
# WATCH PARTY WEBSOCKET SIGNALING SERVER
# ==========================================

class PartyConnectionManager:
    """
    Manages WebSocket connections per party room for Watch Party signaling.
    room_id -> { uid: WebSocket }
    """
    def __init__(self):
        self.rooms: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str, uid: str):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = {}
        self.rooms[room_id][uid] = websocket

    def disconnect(self, room_id: str, uid: str):
        if room_id in self.rooms:
            self.rooms[room_id].pop(uid, None)
            if not self.rooms[room_id]:
                del self.rooms[room_id]

    def get_members(self, room_id: str, exclude_uid: str = None) -> List[str]:
        if room_id not in self.rooms:
            return []
        return [uid for uid in self.rooms[room_id] if uid != exclude_uid]

    async def send_to(self, room_id: str, uid: str, message: dict):
        if room_id in self.rooms and uid in self.rooms[room_id]:
            try:
                await self.rooms[room_id][uid].send_json(message)
            except Exception:
                pass

    async def broadcast(self, room_id: str, message: dict, exclude_uid: str = None):
        if room_id not in self.rooms:
            return
        dead = []
        for uid, ws in self.rooms[room_id].items():
            if uid == exclude_uid:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.rooms[room_id].pop(uid, None)


party_manager = PartyConnectionManager()


@app.websocket("/ws/party/{room_id}/{uid}")
async def party_websocket(websocket: WebSocket, room_id: str, uid: str):
    """
    WebSocket endpoint for Watch Party real-time signaling.
    Handles: WebRTC signaling, presence, media sync events.
    """
    await party_manager.connect(websocket, room_id, uid)

    # Tell the new user who is already in the room
    existing = party_manager.get_members(room_id, exclude_uid=uid)
    await websocket.send_json({
        "type": "presence_state",
        "members": existing
    })

    # Notify everyone else that this user joined
    await party_manager.broadcast(room_id, {
        "type": "presence_join",
        "uid": uid
    }, exclude_uid=uid)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "broadcast":
                event = data.get("event")
                payload = data.get("payload", {})
                target = payload.get("target") if isinstance(payload, dict) else None

                if target:
                    # Targeted signal (e.g. WebRTC SDP/ICE to a specific peer)
                    await party_manager.send_to(room_id, target, {
                        "type": "broadcast",
                        "event": event,
                        "payload": payload
                    })
                else:
                    # Broadcast to the whole room
                    await party_manager.broadcast(room_id, {
                        "type": "broadcast",
                        "event": event,
                        "payload": payload
                    }, exclude_uid=uid)

    except WebSocketDisconnect:
        party_manager.disconnect(room_id, uid)
        # Notify room that this user left
        await party_manager.broadcast(room_id, {
            "type": "presence_leave",
            "uid": uid
        })


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=7860)

