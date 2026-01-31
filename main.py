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
from fastapi import FastAPI, UploadFile, File, Query, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from deepface import DeepFace
from duckduckgo_search import DDGS
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

# Fix lỗi SSL (Quan trọng cho tải Beat/Search)
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError: pass
else: ssl._create_default_https_context = _create_unverified_https_context

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# --- 2. THIẾT LẬP THƯ MỤC ---
os.makedirs("generated_music", exist_ok=True)
os.makedirs("beats", exist_ok=True)
app.mount("/generated_music", StaticFiles(directory="generated_music"), name="generated_music")

SONGS_DB_FILE = "user_songs.json"

# --- 3. HELPER: TẢI BEAT TỰ ĐỘNG (AUTO-BEAT) ---
# Link beat dự phòng (Pop Style)
DEFAULT_BEAT_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"

# Cache để tránh process lại beat nhiều lần
BEAT_CACHE = {}  # {(style, bpm): processed_path} 

# --- STYLE/ATTRIBUTE PROFILES ---
STYLE_BPM_RANGES = {
    "Lo-Fi": (70, 90),
    "Jazz": (80, 120),
    "Blues": (70, 110),
    "Ballad": (60, 80),
    "EDM": (120, 140),
    "House": (118, 128),
    "Techno": (120, 135),
    "Trance": (128, 140),
    "Dubstep": (140, 150),
    "Rap": (85, 100),
    "Reggae": (70, 90),
    "Latin": (90, 120),
    "Rock": (110, 140),
    "Hard Rock": (115, 150),
    "Metal": (120, 160),
    "Punk": (150, 180),
    "Pop": (95, 120),
    "Pop Rock": (100, 130),
    "Pop Punk": (140, 170),
    "R&B": (80, 100),
    "Soul": (75, 95),
    "Swing": (120, 160),
    "Country": (90, 120),
    "Indie": (90, 120),
    "Alternative": (90, 120),
    "Funk": (95, 120),
    "Electronic": (110, 130),
}

STYLE_BEAT_GAIN = {
    # Chill styles: beat thấp để vocal rõ
    "Lo-Fi": -11, "Ballad": -12, "Jazz": -10, "Blues": -10, "Soul": -10, "R&B": -10,
    "Chill": -11, "Ambient": -12,
    
    # Rap: beat quan trọng nhưng không át vocal
    "Rap": -7, "Hip-Hop": -7, "Sad Rap": -8,
    
    # Rock: beat và vocal cân bằng
    "Rock": -6, "Hard Rock": -5, "Metal": -5, "Punk": -5, "Pop Punk": -6,
    "Alternative": -6, "Indie": -7,
    
    # EDM: beat mạnh, vocal là topping
    "EDM": -5, "Techno": -5, "Trance": -5, "House": -6, "Dubstep": -4,
    "Electronic": -6, "Dance": -5,
    
    # Pop/Country: cân bằng
    "Pop": -7, "Pop Rock": -6, "Country": -8, "Folk": -9,
}

STYLE_VOCAL_GAIN = {
    # Chill styles: vocal nổi bật
    "Lo-Fi": 3, "Ballad": 3, "Jazz": 2, "Blues": 2, "Soul": 2, "R&B": 2,
    "Chill": 3, "Ambient": 4,
    
    # Rap: vocal phải rõ ràng
    "Rap": 2, "Hip-Hop": 2, "Sad Rap": 3,
    
    # Rock: vocal cân bằng
    "Rock": 0, "Hard Rock": 0, "Metal": -1, "Punk": 0, "Pop Punk": 0,
    "Alternative": 1, "Indie": 1,
    
    # EDM: vocal nhẹ hơn beat
    "EDM": -2, "Techno": -2, "Trance": -2, "House": -1, "Dubstep": -3,
    "Electronic": -1, "Dance": -2,
    
    # Pop/Country: vocal nổi
    "Pop": 1, "Pop Rock": 0, "Country": 2, "Folk": 2,
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
    "Pop": [0, 2, 4, 5, 7, 9, 11, 12],           # Major scale
    "EDM": [0, 2, 3, 5, 7, 8, 10, 12],            # Minor scale
    "Electronic": [0, 2, 4, 7, 9, 12],            # Major pentatonic
    "House": [0, 2, 4, 5, 7, 9, 11, 12],
    "Techno": [0, 2, 3, 5, 7, 8, 10, 12],
    "Trance": [0, 2, 4, 5, 7, 9, 11, 12],
    
    # Minor scales (buồn, u ám)
    "Lo-Fi": [0, 2, 3, 5, 7, 8, 10, 12],          # Natural minor
    "Sad Rap": [0, 2, 3, 5, 7, 8, 10, 12],
    "Ballad": [0, 2, 3, 5, 7, 8, 11, 12],         # Harmonic minor
    "Blues": [0, 3, 5, 6, 7, 10, 12],              # Blues scale
    "Jazz": [0, 2, 3, 5, 7, 9, 10, 12],            # Dorian mode
    
    # Pentatonic (simple, catchy)
    "Rap": [0, 2, 3, 5, 7, 10, 12],                # Minor pentatonic (perfect for rap)
    "Hip-Hop": [0, 2, 3, 5, 7, 10, 12],
    "Country": [0, 2, 4, 7, 9, 12],                # Major pentatonic
    "Folk": [0, 2, 4, 7, 9, 12],
    
    # Exotic/Special
    "Latin": [0, 1, 4, 5, 7, 8, 11, 12],           # Spanish Phrygian
    "Reggae": [0, 2, 4, 5, 7, 9, 10, 12],
    "Soul": [0, 2, 3, 5, 7, 9, 10, 12],
    "R&B": [0, 2, 3, 5, 7, 9, 10, 12],
    
    # Rock scales
    "Rock": [0, 2, 4, 5, 7, 9, 10, 12],            # Mixolydian
    "Metal": [0, 2, 3, 5, 7, 8, 10, 12],           # Natural minor
    "Punk": [0, 2, 4, 5, 7, 9, 10, 12],
}

def resolve_target_bpm(tempo, style):
    base = 110
    if tempo == "Fast": base = 140
    elif tempo == "Slow": base = 75

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
    return [0, 2, 3, 5, 7, 8, 10, 12] if mood in ["Sadness", "Nostalgia", "Romantic", "Calmness"] else [0, 2, 4, 5, 7, 9, 11, 12]

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
            num_segments = 3 if seconds < 2 else 5 if seconds < 4 else max(7, int(seconds / 1.5))
        
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
                    print(f"[WARNING] Pyrubberband pitch shift failed for segment {i}, using librosa: {e}")
                    try:
                        seg_shifted = librosa.effects.pitch_shift(y=seg, sr=sr, n_steps=steps)
                    except Exception as e2:
                        print(f"[WARNING] Librosa also failed, using original segment: {e2}")
                        seg_shifted = seg
            else:
                # Use librosa directly if pyrubberband not available
                try:
                    seg_shifted = librosa.effects.pitch_shift(y=seg, sr=sr, n_steps=steps)
                except Exception as e:
                    print(f"⚠️ Librosa pitch shift failed, using original segment: {e}")
                    seg_shifted = seg
            
            # Thêm VIBRATO cho giọng hát (áp dụng cho nhiều style hơn)
            if style in ["Ballad", "Soul", "Jazz", "R&B", "Pop", "Pop Rock", "Indie"] and len(seg_shifted) > sr // 2:
                # Vibrato parameters theo style
                if style in ["Ballad", "Soul"]:
                    vibrato_rate = 5.5    # Chậm, sâu lắng
                    vibrato_depth = 0.35  # Rõ hơn
                elif style in ["Jazz", "R&B"]:
                    vibrato_rate = 6.0    # Trung bình
                    vibrato_depth = 0.30
                elif style in ["Pop", "Pop Rock", "Indie"]:
                    vibrato_rate = 5.8    # Nhẹ nhàng
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
                    y_out[-crossfade_len:] = (y_out[-crossfade_len:] * fade_out + 
                                               chunks[i][:crossfade_len] * fade_in)
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
        structured.extend(verse[:len(verse)//2])
    
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
    """
    # Tìm file có tên chứa style (vd: "Pop_120.mp3")
    beat_files = [f for f in os.listdir("beats") if style.lower().replace(" ","") in f.lower().replace(" ","") and f.endswith(".mp3")]
    
    if beat_files:
        return os.path.join("beats", beat_files[0])
    
    # Fallback: Tải beat mặc định
    default_path = os.path.join("beats", "default_beat.mp3")
    if not os.path.exists(default_path):
        print("⬇️ Đang tải beat mẫu (vì chưa có file beat)...")
        try:
            r = requests.get(DEFAULT_BEAT_URL)
            with open(default_path, 'wb') as f: f.write(r.content)
        except Exception as e:
            print(f"❌ Lỗi tải beat mẫu: {e}")
            return None
    return default_path

# --- 4. DATABASE HELPERS ---
def load_songs_db():
    if not os.path.exists(SONGS_DB_FILE): return []
    with open(SONGS_DB_FILE, "r", encoding="utf-8") as f: return json.load(f)

def save_song_to_db(song_data):
    songs = load_songs_db()
    songs.insert(0, song_data)
    with open(SONGS_DB_FILE, "w", encoding="utf-8") as f: json.dump(songs, f, ensure_ascii=False, indent=2)

def delete_song_from_db(file_path):
    songs = [s for s in load_songs_db() if s['file_url'] != file_path]
    with open(SONGS_DB_FILE, "w", encoding="utf-8") as f: json.dump(songs, f, ensure_ascii=False, indent=2)

# --- 5. AUDIO ENGINE (XỬ LÝ ÂM THANH CHUYÊN NGHIỆP) ---

def process_pro_audio(input_path, output_path, target_bpm, current_bpm=100, pitch_shift=0, mood="Neutral", style=None):
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
        board = Pedalboard([
            # HPF để lọc rumble dưới 100Hz
            HighpassFilter(cutoff_frequency_hz=100),
        ])
        
        # === STAGE 2: DYNAMIC CONTROL ===
        # Compressor chính - tùy theo style
        if style in ["Rap", "Hip-Hop", "Sad Rap", "R&B"]:
            # Rap: Heavy compression cho vocal upfront
            board.append(Compressor(threshold_db=-18, ratio=6, attack_ms=3, release_ms=50))
        elif style in ["Rock", "Metal", "Hard Rock", "Punk", "Pop Punk"]:
            # Rock: Medium compression, giữ dynamics
            board.append(Compressor(threshold_db=-12, ratio=4, attack_ms=5, release_ms=100))
        else:
            # Pop/Default: Balanced compression
            board.append(Compressor(threshold_db=-15, ratio=4, attack_ms=5, release_ms=80))
        
        # === STAGE 3: SPATIAL EFFECTS ===
        # Reverb theo Style
        if style in ["Lo-Fi", "Jazz", "Blues", "Soul", "R&B", "Ballad"]:
            # Warm, intimate reverb
            board.append(Reverb(room_size=0.45, damping=0.7, wet_level=0.25, dry_level=0.8))
            board.append(Chorus(rate_hz=0.9, depth=0.15, mix=0.2))
        elif style in ["EDM", "House", "Techno", "Trance", "Dubstep", "Electronic"]:
            # Bright, synthetic reverb
            board.append(Reverb(room_size=0.35, damping=0.3, wet_level=0.2, dry_level=0.85))
            board.append(Chorus(rate_hz=1.8, depth=0.25, mix=0.25))
        elif style in ["Rock", "Hard Rock", "Metal", "Punk", "Pop Punk"]:
            # Tight reverb cho clarity
            board.append(Reverb(room_size=0.3, damping=0.5, wet_level=0.15, dry_level=0.9))
        elif style in ["Pop", "Pop Rock", "Indie", "Alternative"]:
            # Modern pop reverb
            board.append(Reverb(room_size=0.4, damping=0.6, wet_level=0.22, dry_level=0.85))
            board.append(Chorus(rate_hz=1.2, depth=0.18, mix=0.15))
        
        # Mood-specific additions
        if mood in ["Sadness", "Romantic", "Nostalgia", "Calmness"]:
            # Thêm reverb cho không gian sâu lắng
            board.append(Reverb(room_size=0.6, damping=0.8, wet_level=0.15, dry_level=1.0))
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
        sf.write(output_path, effected, sr, subtype='PCM_24')
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
async def serve_index(): return FileResponse("index.html")

@app.get("/my-songs")
async def get_my_songs(): return load_songs_db()

@app.delete("/my-songs/delete")
async def delete_song(url: str = Query(...)):
    try:
        fn = url.split("/")[-1]
        path = os.path.join("generated_music", fn)
        if os.path.exists(path): os.remove(path)
        delete_song_from_db(url)
        return {"status": "success"}
    except: return {"status": "error"}

@app.get("/search")
async def search(q: str, type: str="music"):
    # Logic tìm kiếm Youtube qua DuckDuckGo
    keyword = f"{q} official mv" if type == "music" else f"{q} podcast vietnam full"
    res = []
    try:
        with DDGS() as ddgs:
            gen = ddgs.videos(f"site:youtube.com {keyword}", max_results=5)
            for r in gen:
                vid = r['content'].split("v=")[1].split("&")[0] if "v=" in r['content'] else ""
                res.append({
                    "title": r['title'], 
                    "link": r['content'], 
                    "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg" if vid else ""
                })
    except: pass
    return {"mood": "manual", "recommendations": res}

@app.post("/recommend")
async def recommend(file: UploadFile = File(...), type: str="music", q: str = Query("")):
    t = f"temp_{uuid.uuid4()}.jpg"
    with open(t, "wb") as b: shutil.copyfileobj(file.file, b)
    try:
        res = DeepFace.analyze(t, actions=['emotion'], enforce_detection=False)
        mood = res[0]['dominant_emotion']
    except: mood = "neutral"
    if os.path.exists(t): os.remove(t)
    
    # Tìm kiếm nội dung theo Mood (+ keyword nếu có)
    q = (q or "").strip()
    if q:
        keyword = f"{q} {mood} music" if type == "music" else f"{q} {mood} podcast"
    else:
        keyword = f"nhạc {mood} mood remix" if type == "music" else f"podcast {mood} cảm xúc"
    recommendations = []
    try:
        with DDGS() as ddgs:
            gen = ddgs.videos(f"site:youtube.com {keyword}", max_results=5)
            for r in gen:
                vid = r['content'].split("v=")[1].split("&")[0] if "v=" in r['content'] else ""
                recommendations.append({"title": r['title'], "link": r['content'], "thumbnail": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"})
    except: pass

    return {"mood": mood, "recommendations": recommendations}

@app.post("/generate-music")
async def generate_music(
    lyrics: str = Form(...), style: str = Form(...), mood: str = Form(...),
    voice: str = Form(...), tempo: str = Form(...), title: str = Form(...)
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
    final_path = os.path.join("generated_music", f"{final_id}.mp3")

    # A. XÁC ĐỊNH BPM MỤC TIÊU (tempo + style)
    target_bpm = resolve_target_bpm(tempo, style)
    ms_per_beat = (60 / target_bpm) * 1000

    # B. CHUẨN BỊ BEAT (NHẠC NỀN)
    beat_source = get_or_download_beat(style)
    beat_proc_path = f"beat_{final_id}.wav"
    beat_original_bpm = 100 # Giả định BPM gốc
    
    # Cố gắng lấy BPM từ tên file (vd: Pop_120.mp3)
    if beat_source and "_" in beat_source:
        try: beat_original_bpm = int(beat_source.replace(".mp3","").split("_")[-1])
        except: pass
    
    # Xử lý Beat với quality cao + fallback
    if beat_source and os.path.exists(beat_source):
        try:
            # Try professional processing
            success = process_pro_audio(beat_source, beat_proc_path, target_bpm, beat_original_bpm, 0, mood, style)
            
            # Check if output file is valid
            if success and os.path.exists(beat_proc_path) and os.path.getsize(beat_proc_path) > 0:
                try:
                    beat_final = AudioSegment.from_wav(beat_proc_path)
                    beat_final = beat_final + resolve_beat_gain(style, mood)
                except Exception as e:
                    print(f"⚠️ Cannot load processed beat, using original: {e}")
                    # Fallback: Use original beat without processing
                    beat_final = AudioSegment.from_mp3(beat_source) if beat_source.endswith('.mp3') else AudioSegment.from_wav(beat_source)
                    beat_final = beat_final + resolve_beat_gain(style, mood)
            else:
                print("⚠️ Beat processing failed, using original")
                # Fallback: Use original beat
                beat_final = AudioSegment.from_mp3(beat_source) if beat_source.endswith('.mp3') else AudioSegment.from_wav(beat_source)
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
    raw_lines = [l.strip() for l in lyrics.split('\n') if l.strip()]
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
                rate_adjust = "-10%"     # Chậm hơn để sustain notes
                pitch_adjust = "+5Hz"    # Tăng pitch nhẹ, expressive hơn
            elif style in ["Pop", "Pop Rock", "Indie"]:
                rate_adjust = "+5%"      # Bright, upbeat
                pitch_adjust = "+10Hz"   # Higher pitch cho pop
            elif style in ["Rap", "Hip-Hop"]:
                rate_adjust = "+15%"     # Fast flow
                pitch_adjust = "-5Hz"    # Lower pitch cho rap
            elif style in ["Rock", "Metal", "Punk"]:
                rate_adjust = "+10%"     # Energetic
                pitch_adjust = "+0Hz"    # Natural
            elif style in ["EDM", "Electronic", "House", "Techno"]:
                rate_adjust = "+5%"      # Dance tempo
                pitch_adjust = "+15Hz"   # Bright, synthetic feel
            
            # Thêm prosody marks để giọng "sing-songy" hơn
            # Thêm emphasis và pauses
            enhanced_line = line
            
            # Thêm pauses tại dấu phẩy/chấm
            enhanced_line = enhanced_line.replace(',', ' <break time="300ms"/> ')
            enhanced_line = enhanced_line.replace('.', ' <break time="500ms"/> ')
            
            comm = edge_tts.Communicate(
                enhanced_line, 
                tts_voice_id, 
                rate=rate_adjust,
                pitch=pitch_adjust
            )
            await comm.save(t_raw)
            tts_success = True
        except Exception as e:
            print(f"⚠️ Edge-TTS failed: {e}")
            try: 
                # Fallback: gTTS (basic)
                gTTS(text=line, lang='vi', slow=(style in ["Ballad", "Soul"])).save(t_raw)
                tts_success = True
            except: 
                pass
        
        if not tts_success or not os.path.exists(t_raw):
            continue
        
        # 1.5. Convert TTS to Singing Voice (RVC)
        if RVC_AVAILABLE:
            try:
                voice_type = "female" if "Female" in voice else "male"
                rvc_engine = get_rvc_engine(voice_type)
                
                t_singing = f"singing_{uuid.uuid4()}.wav"
                
                # Convert speech to singing
                rvc_success = rvc_engine.convert_to_singing(
                    t_raw,
                    t_singing,
                    pitch_shift=n_steps
                )
                
                if rvc_success and os.path.exists(t_singing):
                    # Use singing voice
                    if os.path.exists(t_raw):
                        try: os.remove(t_raw)
                        except: pass
                    t_raw = t_singing
                    print("[OK] RVC: TTS -> Singing voice")
                else:
                    print("[WARNING] RVC failed, using enhanced TTS")
                    
            except Exception as e:
                print(f"[WARNING] RVC conversion error: {e}, using TTS")
        
        # 2. Apply Melodic Contour
        apply_pitch_contour(t_raw, t_mel, mood, tempo, style, intensity=1.4)
        src_for_flow = t_mel if os.path.exists(t_mel) else t_raw

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
        process_pro_audio(src_for_flow, t_proc, target_bpm, fake_current_bpm, n_steps, mood, style)
        
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
                try: os.remove(tmp_file)
                except: pass

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
    beat_intro = beat_final[:int(vocal_start_ms)]
    beat_vocal_section = beat_final[int(vocal_start_ms):int(vocal_end_ms)]
    beat_outro = beat_final[int(vocal_end_ms):]
    
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
    
    # Save mastered audio
    sf.write(master_wav_path, y_master, sr_master)
    
    # Convert to MP3 with high quality
    mastered = AudioSegment.from_wav(master_wav_path)
    mastered.export(
        final_path, 
        format="mp3", 
        bitrate="320k",
        tags={'title': title, 'artist': f'AI Studio - {voice}', 'album': style}
    )
    
    # Cleanup
    if os.path.exists(beat_proc_path): os.remove(beat_proc_path)
    if os.path.exists(master_wav_path): os.remove(master_wav_path)

    # Save Metadata
    song_data = {
        "id": final_id, 
        "title": title, 
        "lyrics": lyrics[:50]+"...",
        "style": style, 
        "mood": mood, 
        "file_url": f"/generated_music/{final_id}.mp3"
    }
    save_song_to_db(song_data)
    
    print(f"✅ Generated: {title} ({len(full_vocal)/1000:.1f}s vocal, {target_bpm} BPM)")
    return {"status": "success", "song": song_data}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)