import os
import ssl
import shutil
import uuid
import json
import asyncio
import numpy as np
import librosa
import soundfile as sf
from typing import List
from fastapi import FastAPI, UploadFile, File, Query, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from deepface import DeepFace
from duckduckgo_search import DDGS
import edge_tts 
from pydub import AudioSegment

# --- CONFIG ---
os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
# SSL Hack
try:
    _create_unverified_https_context = ssl._create_unverified_context
    ssl._create_default_https_context = _create_unverified_https_context
except AttributeError:
    pass

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Folders
os.makedirs("generated_music", exist_ok=True)
os.makedirs("beats", exist_ok=True)
app.mount("/generated_music", StaticFiles(directory="generated_music"), name="generated_music")

SONGS_DB_FILE = "user_songs.json"

# --- DATABASE HELPERS ---
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

# --- VOICE CONFIG ---
VOICE_MAP = {
    "Female-Soft": "vi-VN-HoaiMyNeural",
    "Female-Energetic": "vi-VN-NamMinhNeural", # Hack: Dùng giọng nam pitch cao nghe như nữ trầm cá tính
    "Male-Deep": "vi-VN-NamMinhNeural",
    "Male-Bright": "en-US-GuyNeural",
    "Soprano": "vi-VN-HoaiMyNeural",
    "Bass": "vi-VN-NamMinhNeural"
}

# --- AUDIO PROCESSING CORE (THE MAGIC) ---
def time_stretch_audio(input_path, output_path, target_duration_sec):
    """Kỹ thuật co giãn âm thanh để khớp beat (Time Stretching)"""
    y, sr = librosa.load(input_path)
    current_duration = librosa.get_duration(y=y, sr=sr)
    
    if current_duration <= 0: return # Skip silence
    
    # Tính tỷ lệ co giãn
    rate = current_duration / target_duration_sec
    
    # Giới hạn rate để giọng không bị méo quá (0.5x đến 2.0x)
    rate = max(0.5, min(rate, 2.0))
    
    y_stretched = librosa.effects.time_stretch(y, rate=rate)
    sf.write(output_path, y_stretched, sr)

# --- ROUTES ---
@app.get("/")
async def serve_index(): return FileResponse("index.html")

@app.get("/my-songs")
async def get_my_songs(): return load_songs_db()

@app.delete("/my-songs/delete")
async def delete_song(url: str = Query(...)):
    fn = url.split("/")[-1]
    if os.path.exists(f"generated_music/{fn}"): os.remove(f"generated_music/{fn}")
    delete_song_from_db(url)
    return {"status": "success"}

# (Giữ nguyên các API Search/Recommend cũ ở đây...)

@app.post("/generate-music")
async def generate_music(
    lyrics: str = Form(...),
    style: str = Form(...),
    mood: str = Form(...),
    voice: str = Form(...),
    tempo: str = Form(...),
    title: str = Form(...)
):
    print(f"🎵 Composing: {title} | Style: {style} | Voice: {voice}")
    
    # Tạo ID file
    final_filename = f"{uuid.uuid4()}.mp3"
    final_path = os.path.join("generated_music", final_filename)
    
    # 1. TÌM BEAT & PARSE BPM
    # Quy ước tên file beat: "Pop_120.mp3" -> Style: Pop, BPM: 120
    beat_files = [f for f in os.listdir("beats") if f.lower().startswith(style.lower())]
    
    beat_path = None
    bpm = 100 # Default BPM
    
    if beat_files:
        beat_filename = beat_files[0]
        beat_path = os.path.join("beats", beat_filename)
        # Cố gắng lấy BPM từ tên file
        try:
            bpm_str = beat_filename.split("_")[-1].replace(".mp3", "")
            bpm = int(bpm_str)
        except:
            bpm = 100 # Fallback
    else:
        # Nếu ko có beat, fallback BPM dựa trên Tempo user chọn
        if tempo == "Fast": bpm = 130
        elif tempo == "Slow": bpm = 70
        else: bpm = 100

    print(f"🥁 Beat BPM: {bpm}")

    # 2. XỬ LY LYRICS (FLOW)
    # Tách từng dòng lyrics
    lines = [l.strip() for l in lyrics.split('\n') if l.strip()]
    
    # Tính thời gian của 1 Bar (4 nhịp) theo giây
    # Công thức: (60 / BPM) * 4
    seconds_per_bar = (60 / bpm) * 4
    
    combined_vocal = AudioSegment.empty()
    
    try:
        # Xử lý từng dòng lyrics
        for i, line in enumerate(lines):
            temp_line_file = f"temp_line_{uuid.uuid4()}.wav"
            temp_stretched_file = f"temp_stretch_{uuid.uuid4()}.wav"
            
            # A. Tạo giọng đọc thô (Raw TTS)
            selected_voice = VOICE_MAP.get(voice, "vi-VN-HoaiMyNeural")
            
            # Logic Pitch (Cao độ) dựa trên Mood/Voice
            pitch_adj = "+0Hz"
            if voice == "Female-Energetic" or mood == "Joy": pitch_adj = "+10Hz"
            if voice == "Male-Deep" or mood == "Sadness": pitch_adj = "-10Hz"
            
            communicate = edge_tts.Communicate(line, selected_voice, pitch=pitch_adj)
            await communicate.save(temp_line_file)
            
            # B. Time Stretch (Co giãn để khớp nhạc)
            # Mỗi câu hát sẽ cố gắng lấp đầy 1 Bar (hoặc 1/2 Bar nếu câu ngắn)
            target_len = seconds_per_bar
            if len(line.split()) < 4: target_len = seconds_per_bar / 2 # Câu ngắn hát nửa bar
            
            # Dùng Librosa để stretch
            try:
                time_stretch_audio(temp_line_file, temp_stretched_file, target_len)
                
                # Load lại bằng Pydub
                seg = AudioSegment.from_wav(temp_stretched_file)
                combined_vocal += seg
            except Exception as e:
                print(f"Skip line error: {e}")
                # Fallback: dùng file gốc nếu stretch lỗi
                if os.path.exists(temp_line_file):
                    combined_vocal += AudioSegment.from_file(temp_line_file)

            # Cleanup temp files
            if os.path.exists(temp_line_file): os.remove(temp_line_file)
            if os.path.exists(temp_stretched_file): os.remove(temp_stretched_file)

        # 3. MIXING (HÒA ÂM)
        # Apply Mood Effects
        if mood == "Sadness" or style == "Lofi":
            # Reverb nhẹ (giả lập bằng echo)
            combined_vocal = combined_vocal.overlay(combined_vocal - 10, position=100)
        elif mood == "Joy" or style == "EDM":
            # Double vocal (làm dày giọng)
            combined_vocal = combined_vocal.overlay(combined_vocal, position=10)

        # Trộn Beat
        if beat_path and os.path.exists(beat_path):
            beat = AudioSegment.from_file(beat_path)
            # Loop beat cho đủ độ dài vocal
            while len(beat) < len(combined_vocal) + 4000: # +4s outro
                beat += beat
            
            beat = beat[:len(combined_vocal) + 4000]
            beat = beat - 5 # Giảm volume beat
            
            # Mix: Beat nền + Vocal
            final_mix = beat.overlay(combined_vocal, position=500) # Vocal vào sau 0.5s
        else:
            final_mix = combined_vocal

        # 4. EXPORT
        final_mix.export(final_path, format="mp3", tags={'title': title, 'artist': 'Mood AI', 'album': style})
        
        # Lưu DB
        file_url = f"/generated_music/{final_filename}"
        song_data = {
            "id": str(uuid.uuid4()),
            "title": title,
            "lyrics": lyrics[:50],
            "style": style,
            "mood": mood,
            "file_url": file_url,
            "timestamp": str(uuid.uuid1())
        }
        save_song_to_db(song_data)
        
        return {"status": "success", "song": song_data}

    except Exception as e:
        print(f"❌ Gen Error: {e}")
        return {"status": "error", "message": str(e)}