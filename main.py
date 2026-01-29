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
import pyrubberband as pyrb 
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
    "Lo-Fi": -10, "Ballad": -11, "Jazz": -9, "Blues": -9, "Soul": -9, "R&B": -9,
    "Rock": -6, "Hard Rock": -5, "Metal": -5, "Punk": -6, "Pop Punk": -6,
    "EDM": -6, "Techno": -6, "Trance": -6, "House": -6, "Dubstep": -6,
}

STYLE_VOCAL_GAIN = {
    "Lo-Fi": 2, "Ballad": 2, "Jazz": 1, "Blues": 1, "Soul": 1, "R&B": 1,
    "Rock": 0, "Hard Rock": 0, "Metal": 0, "Punk": 0, "Pop Punk": 0,
    "EDM": -1, "Techno": -1, "Trance": -1, "House": -1, "Dubstep": -1,
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
    gain = STYLE_BEAT_GAIN.get(style, -8)
    if mood in ["Sadness", "Calmness", "Nostalgia", "Romantic"]:
        gain -= 2
    elif mood in ["Anger", "Surprise", "Triumph", "Energetic"]:
        gain += 1
    return gain

def resolve_vocal_gain(style, mood):
    gain = STYLE_VOCAL_GAIN.get(style, 0)
    if mood in ["Sadness", "Calmness", "Nostalgia", "Romantic"]:
        gain += 1
    elif mood in ["Anger", "Surprise", "Triumph", "Energetic"]:
        gain -= 1
    return gain

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
    Xử lý: Co giãn nhịp (Rubberband) -> Chỉnh tone -> Hiệu ứng phòng thu (Pedalboard)
    """
    try:
        # Load Audio (Chuẩn 44.1kHz)
        y, sr = librosa.load(input_path, sr=44100)
        
        # A. Time Stretch (Khớp Tempo)
        if target_bpm > 0 and current_bpm > 0:
            rate = target_bpm / current_bpm
            # Rubberband co giãn mượt hơn librosa
            y = pyrb.time_stretch(y, sr, rate)
        
        # B. Pitch Shift (Chỉnh tone giọng)
        if pitch_shift != 0:
            y = pyrb.pitch_shift(y, sr, pitch_shift)
            
        # C. Audio Effects (Pedalboard)
        board = Pedalboard([
            HighpassFilter(cutoff_frequency_hz=100), # Lọc ồn trầm
            Compressor(threshold_db=-15, ratio=4),   # Nén giọng đều
        ])
        
        # Thêm FX theo Mood
        if mood in ["Joy", "Surprise", "Energetic"]:
            board.append(Chorus(rate_hz=1.5, depth=0.2)) # Vui tươi, dày giọng
        elif mood in ["Sadness", "Romantic", "Lo-Fi"]:
            board.append(Reverb(room_size=0.6, wet_level=0.3)) # Vang, sâu lắng
        elif mood == "Anger":
            board.append(Gain(gain_db=4)) # To, gắt

        # Thêm FX theo Style
        if style in ["Lo-Fi", "Jazz", "Blues", "Soul", "R&B", "Ballad"]:
            board.append(Reverb(room_size=0.45, wet_level=0.25))
            board.append(Chorus(rate_hz=0.9, depth=0.15))
        elif style in ["EDM", "House", "Techno", "Trance", "Dubstep"]:
            board.append(Chorus(rate_hz=1.8, depth=0.25))
            board.append(Gain(gain_db=2))
        elif style in ["Rock", "Hard Rock", "Metal", "Punk", "Pop Punk"]:
            board.append(Gain(gain_db=2))
            
        # Render hiệu ứng
        effected = board(y, sr)
        
        # Lưu file
        sf.write(output_path, effected, sr)
        return True
    except Exception as e:
        print(f"⚠️ Pro Audio Error (Fallback to raw): {e}")
        try: shutil.copy(input_path, output_path)
        except: pass
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
    print(f"🎹 STUDIO GEN: {title} | Style: {style} | Tempo: {tempo}")
    final_id = str(uuid.uuid4())
    final_path = os.path.join("generated_music", f"{final_id}.mp3")

    # A. XÁC ĐỊNH BPM MỤC TIÊU (tempo + style)
    target_bpm = resolve_target_bpm(tempo, style)

    # B. CHUẨN BỊ BEAT (NHẠC NỀN)
    beat_source = get_or_download_beat(style)
    beat_proc_path = f"beat_{final_id}.wav"
    beat_original_bpm = 100 # Giả định BPM gốc
    
    # Cố gắng lấy BPM từ tên file (vd: Pop_120.mp3)
    if beat_source and "_" in beat_source:
        try: beat_original_bpm = int(beat_source.replace(".mp3","").split("_")[-1])
        except: pass
    
    # Xử lý Beat (Ép xung nhịp)
    if beat_source:
        process_pro_audio(beat_source, beat_proc_path, target_bpm, beat_original_bpm, 0, mood, style)
        beat_final = AudioSegment.from_wav(beat_proc_path)
        beat_final = beat_final + resolve_beat_gain(style, mood) # Điều chỉnh volume theo style/mood
    else:
        beat_final = AudioSegment.silent(duration=10000)

    # C. CẤU HÌNH GIỌNG (VOICE PROFILE)
    # Pitch Shift (Số bán cung)
    n_steps = 0
    if voice == "Soprano": n_steps = 3
    elif voice == "Alto": n_steps = -2
    elif voice == "Tenor": n_steps = 2
    elif voice == "Bass": n_steps = -4
    
    tts_voice_id = "vi-VN-NamMinhNeural" if voice in ["Male", "Bass", "Tenor"] else "vi-VN-HoaiMyNeural"
    
    # D. XỬ LÝ LYRICS & TẠO VOCAL
    lines = [l.strip() for l in lyrics.split('\n') if l.strip()]
    full_vocal = AudioSegment.empty()
    
    # Intro 1 Bar (4 nhịp) để nhạc chạy trước
    ms_per_beat = (60 / target_bpm) * 1000
    full_vocal += AudioSegment.silent(duration=ms_per_beat * 4)

    for line in lines:
        t_raw = f"raw_{uuid.uuid4()}.mp3"
        t_proc = f"proc_{uuid.uuid4()}.wav"
        
        # 1. Text-to-Speech (Có Fallback)
        try:
            # Thử Edge-TTS (Giọng xịn)
            comm = edge_tts.Communicate(line, tts_voice_id)
            await comm.save(t_raw)
        except:
            try: 
                # Fallback sang Google (Giọng dự phòng)
                gTTS(text=line, lang='vi').save(t_raw)
            except: continue # Skip nếu lỗi cả hai
        
        if os.path.exists(t_raw):
            # 2. Tính toán "Flow" (Ép thời lượng)
            # Mỗi câu hát sẽ chiếm 2 hoặc 4 nhịp tùy độ dài
            # Đây là bí quyết để giọng nghe "On-beat"
            y_check, sr_check = librosa.load(t_raw)
            curr_dur_sec = librosa.get_duration(y=y_check, sr=sr_check)
            
            target_beats = 4 if curr_dur_sec > 2.5 else 2
            target_dur_sec = (60 / target_bpm) * target_beats
            
            # Tính BPM giả định để đưa vào hàm xử lý
            fake_current_bpm = target_bpm * (target_dur_sec / curr_dur_sec)
            
            # 3. DSP Process (Stretch + Pitch + FX)
            process_pro_audio(t_raw, t_proc, target_bpm, fake_current_bpm, n_steps, mood, style)
            
            if os.path.exists(t_proc):
                seg = AudioSegment.from_wav(t_proc)
                full_vocal += seg
            
            # Dọn rác
            if os.path.exists(t_raw): os.remove(t_raw)
            if os.path.exists(t_proc): os.remove(t_proc)

    # E. MIXING & MASTERING
    full_vocal = full_vocal + resolve_vocal_gain(style, mood)
    # Loop Beat cho đủ độ dài Vocal
    while len(beat_final) < len(full_vocal) + 4000:
        beat_final += beat_final
    beat_final = beat_final[:len(full_vocal) + 4000] # Cắt dư
    
    # Trộn
    final_mix = beat_final.overlay(full_vocal, position=0)
    
    # Xuất file cuối cùng
    final_mix.export(final_path, format="mp3", tags={'title': title, 'artist': f'AI {voice}'})
    
    # Cleanup beat temp
    if os.path.exists(beat_proc_path): os.remove(beat_proc_path)

    # Save Metadata
    song_data = {
        "id": final_id, "title": title, "lyrics": lyrics[:50]+"...",
        "style": style, "mood": mood, "file_url": f"/generated_music/{final_id}.mp3"
    }
    save_song_to_db(song_data)
    
    return {"status": "success", "song": song_data}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)