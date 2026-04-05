"""
hf_music_gen.py
===============
Tích hợp HuggingFace Inference API vào pipeline nhạc hiện tại.

CÁI GÌ MODULE NÀY LÀM:
  1. generate_background_music()  — Dùng MusicGen (facebook/musicgen-small) tạo nhạc nền
                                    thay thế beat tải từ soundhelix
  2. generate_singing_vocal()     — Dùng Bark (suno/bark-small) tạo giọng HÁT thật sự
                                    thay thế Edge TTS đọc văn xuôi
  3. get_hf_beat()                — Drop-in replacement cho get_or_download_beat()

CÀI ĐẶT:
  pip install huggingface_hub

TRONG main.py, thêm vào đầu file:
  from hf_music_gen import get_hf_beat, generate_singing_vocal, HF_AVAILABLE
  HF_TOKEN = os.getenv("HF_TOKEN", "")  # Set trong HF Space secrets

RỒI TRONG generate_music() thay dòng:
  beat_source = get_or_download_beat(style)
→
  beat_source = get_hf_beat(style, mood, tempo, target_bpm) if HF_AVAILABLE else get_or_download_beat(style)

VÀ THAY PHẦN TẠO VOCAL (trong vòng lặp for line in lines):
  Cũ: edge_tts → pitch_contour
  Mới: generate_singing_vocal() → bỏ qua pitch_contour (vì đã có melody sẵn)
"""

import os
import io
import time
import hashlib
import requests
import numpy as np
import soundfile as sf
import librosa
from pathlib import Path
from typing import Optional

# ── CONFIG ────────────────────────────────────────────────────────────────────
HF_TOKEN = os.getenv("HF_TOKEN", "")  # Set trong HF Space → Settings → Secrets
HF_API_BASE = "https://api-inference.huggingface.co/models"

# Models (đều miễn phí trên HF Inference API)
MUSICGEN_MODEL = "facebook/musicgen-small"  # ~300MB, tạo nhạc từ text — 15s/request
BARK_MODEL = "suno/bark-small"  # ~1.2GB, TTS có giọng hát — 30s/request

HF_AVAILABLE = bool(HF_TOKEN)

# Cache nhạc nền để không gọi API lặp lại
MUSIC_CACHE_DIR = Path("beats/hf_cache")
MUSIC_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ── STYLE → MUSIC PROMPT ──────────────────────────────────────────────────────
# MusicGen hiểu tiếng Anh tốt hơn, nên dùng English prompt
STYLE_PROMPTS = {
    "Pop": "upbeat pop instrumental, catchy melody, piano and synth, 120bpm",
    "Ballad": "slow emotional ballad, piano, strings, soft drums, 75bpm",
    "Lo-Fi": "lofi hip hop, mellow, vinyl crackle, relaxing beats, 85bpm",
    "LoFi": "lofi hip hop, mellow, vinyl crackle, relaxing beats, 85bpm",
    "EDM": "energetic EDM, electronic synths, pulsing bassline, 130bpm",
    "Rap": "hip hop instrumental, hard-hitting drums, 808 bass, trap beat, 95bpm",
    "Hip-Hop": "hip hop beat, boom bap drums, sample-based melody, 90bpm",
    "Sad Rap": "dark emotional trap beat, slow 808s, piano, 75bpm",
    "Jazz": "smooth jazz, piano, double bass, brushed drums, 100bpm",
    "R&B": "smooth R&B groove, electric piano, warm bass, 90bpm",
    "RnB": "smooth R&B groove, electric piano, warm bass, 90bpm",
    "Rock": "rock band, electric guitar, drums, bass, 120bpm",
    "Hard Rock": "heavy rock, distorted guitars, powerful drums, 130bpm",
    "Metal": "heavy metal, aggressive guitars, fast double kick drums, 140bpm",
    "Ballad": "soft piano ballad, strings, emotional, slow tempo",
    "Country": "country guitar, acoustic, twangy, steady rhythm, 100bpm",
    "Folk": "acoustic folk, fingerpicked guitar, warm, 95bpm",
    "Indie": "indie pop, dreamy guitars, light drums, 105bpm",
    "Latin": "latin rhythm, percussion, brass, guitar, 110bpm",
    "Reggae": "reggae rhythm, offbeat guitar, bass, 85bpm",
    "Soul": "soulful music, organ, brass section, groove, 90bpm",
    "Funk": "funky groove, wah guitar, bass slap, horns, 105bpm",
    "House": "house music, four-on-the-floor kick, synth pad, 125bpm",
    "Techno": "dark techno, industrial drums, synthesizer, 130bpm",
    "Trance": "uplifting trance, arpeggiated synths, build up, 135bpm",
    "Dubstep": "dubstep, heavy wobble bass, half time drums, 140bpm",
    "Alternative": "alternative rock, jangly guitars, indie drums, 110bpm",
    "Blues": "electric blues, guitar riff, walking bass, 90bpm",
    "Swing": "swing jazz, big band, trumpet, piano, 130bpm",
    "Punk": "punk rock, fast power chords, driving drums, 160bpm",
}

MOOD_MODIFIERS = {
    "Joy": "happy, bright, major key",
    "Sadness": "melancholic, minor key, slow",
    "Anger": "aggressive, intense, driving",
    "Calmness": "peaceful, ambient, soft",
    "Romantic": "romantic, warm, gentle",
    "Energetic": "energetic, powerful, fast",
    "Nostalgia": "nostalgic, warm, bittersweet",
    "Fear": "dark, tense, suspenseful",
    "Triumph": "triumphant, epic, orchestral",
}

# ── BARK VOICE MAP ─────────────────────────────────────────────────────────────
# Bark speaker presets — giọng có thể hát được
# Xem full list: https://suno-ai.notion.site/8b8e8749ed514b0cbf3f699013548683
BARK_VOICE_MAP = {
    "Female": "v2/vi_speaker_0",  # Nữ Việt Nam (thử nghiệm)
    "Female - North": "v2/vi_speaker_0",
    "Female - South": "v2/vi_speaker_1",
    "Male": "v2/vi_speaker_3",
    "Male - North": "v2/vi_speaker_3",
    "Male - South": "v2/vi_speaker_4",
    "Female Young": "v2/en_speaker_9",  # Fallback tiếng Anh nếu VI không có
    "Male Young": "v2/en_speaker_6",
    # Nếu không có VI speaker, dùng EN
    "_fallback_female": "v2/en_speaker_9",
    "_fallback_male": "v2/en_speaker_6",
}


# ──────────────────────────────────────────────────────────────────────────────
# 1. GENERATE BACKGROUND MUSIC (MusicGen)
# ──────────────────────────────────────────────────────────────────────────────


def build_music_prompt(style: str, mood: str, tempo: str, bpm: int) -> str:
    """Xây dựng prompt text cho MusicGen"""
    base = STYLE_PROMPTS.get(style, f"{style.lower()} music instrumental")
    mood_mod = MOOD_MODIFIERS.get(mood, "")

    tempo_desc = ""
    if tempo == "Slow":
        tempo_desc = "slow tempo"
    elif tempo == "Fast":
        tempo_desc = "fast tempo"

    parts = [base]
    if mood_mod:
        parts.append(mood_mod)
    if tempo_desc:
        parts.append(tempo_desc)
    parts.append("no vocals, instrumental only, high quality")

    return ", ".join(parts)


def generate_background_music(
    style: str,
    mood: str,
    tempo: str,
    target_bpm: int,
    duration_seconds: int = 30,
    output_path: Optional[str] = None,
) -> Optional[str]:
    """
    Gọi MusicGen API để tạo nhạc nền.

    Returns:
        Path to generated WAV file, hoặc None nếu fail
    """
    if not HF_TOKEN:
        print("[HF] No HF_TOKEN set, skipping MusicGen")
        return None

    prompt = build_music_prompt(style, mood, tempo, target_bpm)

    # Cache key dựa trên prompt
    cache_key = hashlib.md5(f"{prompt}_{duration_seconds}".encode()).hexdigest()[:12]
    cache_path = MUSIC_CACHE_DIR / f"{cache_key}.wav"

    if cache_path.exists():
        print(f"[HF] Using cached beat: {cache_key}")
        return str(cache_path)

    print(f"[HF] Generating music: '{prompt[:60]}...'")

    url = f"{HF_API_BASE}/{MUSICGEN_MODEL}"
    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": duration_seconds * 50,  # ~50 tokens/sec
            "do_sample": True,
            "guidance_scale": 3.0,
        },
    }

    # Retry với exponential backoff (model đang load = 503)
    for attempt in range(4):
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=120)

            if resp.status_code == 200:
                # Response là raw audio bytes (WAV hoặc FLAC)
                audio_bytes = resp.content

                # Save sang WAV
                save_path = output_path or str(cache_path)
                with open(save_path, "wb") as f:
                    f.write(audio_bytes)

                # Verify file hợp lệ
                try:
                    y, sr = librosa.load(save_path, sr=None, duration=2)
                    if len(y) > 0:
                        print(f"[HF] ✅ Beat generated: {save_path}")
                        # Save to cache nếu chưa có
                        if output_path and not cache_path.exists():
                            import shutil

                            shutil.copy(save_path, cache_path)
                        return save_path
                except Exception as e:
                    print(f"[HF] ⚠️ Invalid audio file: {e}")
                    return None

            elif resp.status_code == 503:
                # Model đang warm up — đợi và thử lại
                wait_time = 20 * (attempt + 1)
                est = resp.json().get("estimated_time", wait_time)
                print(
                    f"[HF] Model loading, waiting {est:.0f}s... (attempt {attempt + 1}/4)"
                )
                time.sleep(min(float(est), 60))

            elif resp.status_code == 429:
                # Rate limit
                print(f"[HF] ⚠️ Rate limited, waiting 30s...")
                time.sleep(30)

            else:
                print(f"[HF] ❌ API error {resp.status_code}: {resp.text[:200]}")
                return None

        except requests.Timeout:
            print(f"[HF] ⚠️ Timeout (attempt {attempt + 1}/4)")
            time.sleep(10)
        except Exception as e:
            print(f"[HF] ❌ Request error: {e}")
            return None

    print("[HF] ❌ All attempts failed")
    return None


def get_hf_beat(style: str, mood: str, tempo: str, target_bpm: int) -> Optional[str]:
    """
    Drop-in replacement cho get_or_download_beat().
    Thử HF MusicGen trước, fallback sang beat file local.

    Dùng trong main.py:
        beat_source = get_hf_beat(style, mood, tempo, target_bpm) or get_or_download_beat(style)
    """
    import tempfile

    out_path = str(MUSIC_CACHE_DIR / f"beat_{style}_{mood}_{tempo}.wav")
    result = generate_background_music(
        style, mood, tempo, target_bpm, duration_seconds=30, output_path=out_path
    )
    return result


# ──────────────────────────────────────────────────────────────────────────────
# 2. GENERATE SINGING VOCAL (Bark)
# ──────────────────────────────────────────────────────────────────────────────


def wrap_lyrics_for_bark(text: str, style: str) -> str:
    """
    Bark dùng ký hiệu đặc biệt để tạo singing:
      [laughter], [sighs], [music], [gasps], [clears throat]
      ♪ text ♪  →  Bark sẽ cố gắng hát đoạn đó

    Với Rap style: thêm rhythm markers
    Với Ballad/Soul: wrap bằng ♪ để trigger singing mode
    """
    if style in ["Rap", "Hip-Hop", "Sad Rap"]:
        # Rap: đọc nhanh có rhythm, không cần ♪
        return text.strip()
    else:
        # Singing styles: wrap bằng ♪
        # Bark sẽ cố gắng hát khi thấy ♪
        return f"♪ {text.strip()} ♪"


def generate_singing_vocal(
    text: str,
    voice: str,
    style: str,
    output_path: str,
) -> bool:
    """
    Dùng Bark để generate giọng HÁT cho 1 dòng lyrics.

    Thay thế cho Edge TTS + pitch_contour trong vòng lặp for line in lines.

    Args:
        text:        1 dòng lyrics
        voice:       Voice profile key (vd: "Female", "Male - North")
        style:       Music style
        output_path: Đường dẫn lưu file WAV kết quả

    Returns:
        True nếu thành công, False nếu fail (caller sẽ fallback sang Edge TTS)
    """
    if not HF_TOKEN:
        return False

    # Lấy Bark voice preset
    voice_preset = BARK_VOICE_MAP.get(voice)
    if not voice_preset:
        # Detect male/female từ voice string
        is_male = "male" in voice.lower()
        voice_preset = BARK_VOICE_MAP[
            "_fallback_male" if is_male else "_fallback_female"
        ]

    # Wrap text cho singing mode
    bark_text = wrap_lyrics_for_bark(text, style)

    url = f"{HF_API_BASE}/{BARK_MODEL}"
    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "inputs": bark_text,
        "parameters": {
            "voice_preset": voice_preset,
        },
    }

    for attempt in range(3):
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=90)

            if resp.status_code == 200:
                with open(output_path, "wb") as f:
                    f.write(resp.content)

                # Verify
                try:
                    y, sr = librosa.load(output_path, sr=None, duration=1)
                    if len(y) > 0:
                        return True
                except:
                    return False

            elif resp.status_code == 503:
                est = 30
                try:
                    est = resp.json().get("estimated_time", 30)
                except:
                    pass
                print(f"[HF/Bark] Loading model, wait {est:.0f}s...")
                time.sleep(min(float(est), 45))

            elif resp.status_code == 429:
                print("[HF/Bark] Rate limited, wait 20s...")
                time.sleep(20)
            else:
                print(f"[HF/Bark] Error {resp.status_code}: {resp.text[:100]}")
                return False

        except Exception as e:
            print(f"[HF/Bark] Exception: {e}")
            return False

    return False


# ──────────────────────────────────────────────────────────────────────────────
# 3. HƯỚNG DẪN TÍCH HỢP VÀO main.py
# ──────────────────────────────────────────────────────────────────────────────

INTEGRATION_GUIDE = """
=== CÁCH TÍCH HỢP VÀO main.py ===

BƯỚC 1: Thêm vào đầu main.py (sau các import hiện tại):
─────────────────────────────────────────────────────────
from hf_music_gen import get_hf_beat, generate_singing_vocal, HF_AVAILABLE

BƯỚC 2: Set HF_TOKEN trong HF Space
─────────────────────────────────────────────────────────
  → Space Settings → Variables and secrets → NEW SECRET
  → Name: HF_TOKEN
  → Value: hf_xxxxxxxxxxxxxxxx  (lấy từ huggingface.co/settings/tokens)

BƯỚC 3: Trong generate_music(), thay dòng get_or_download_beat:
─────────────────────────────────────────────────────────
# CŨ:
beat_source = get_or_download_beat(style)

# MỚI:
if HF_AVAILABLE:
    beat_source = get_hf_beat(style, mood, tempo, target_bpm) or get_or_download_beat(style)
else:
    beat_source = get_or_download_beat(style)

BƯỚC 4: Trong vòng lặp "for idx, line in enumerate(lines):", 
thay phần tạo TTS + pitch_contour:
─────────────────────────────────────────────────────────
# CŨ (Edge TTS đọc văn xuôi):
await edge_tts.Communicate(line, voice=tts_voice_id).save(t_raw)
apply_pitch_contour(t_raw, t_mel, mood, tempo, style)

# MỚI (Bark hát thật):
bark_success = False
if HF_AVAILABLE:
    bark_success = generate_singing_vocal(line, voice, style, t_raw)

if not bark_success:
    # Fallback: Edge TTS như cũ
    await edge_tts.Communicate(line, voice=tts_voice_id).save(t_raw)
    apply_pitch_contour(t_raw, t_mel, mood, tempo, style)
    src_for_flow = t_mel
else:
    # Bark đã có melody, skip pitch_contour
    src_for_flow = t_raw

# Tiếp tục với process_pro_audio như bình thường...
process_pro_audio(src_for_flow, t_proc, target_bpm, fake_current_bpm, ...)

=== LƯU Ý QUAN TRỌNG ===
- MusicGen: ~15-30s/request, cache lại để không gọi lại cho cùng style+mood
- Bark: ~20-45s/line — nếu bài 8 câu = ~4 phút chờ → nên dùng cho demo thôi
- Free tier: ~1000 req/tháng — ưu tiên dùng cho beat (MusicGen), Bark dùng khi cần
- HF Space của bạn (kietvohcb/MoodBasedRecommender) dùng cùng token được
"""

if __name__ == "__main__":
    print(INTEGRATION_GUIDE)

    # Quick test
    if HF_TOKEN:
        print("\\n🧪 Testing MusicGen...")
        result = generate_background_music(
            "Pop", "Joy", "Medium", 110, duration_seconds=8, output_path="test_beat.wav"
        )
        if result:
            y, sr = librosa.load(result)
            print(f"✅ Beat generated: {librosa.get_duration(y=y, sr=sr):.1f}s")
        else:
            print("❌ Test failed - check HF_TOKEN")
    else:
        print("⚠️ Set HF_TOKEN env var to test")
