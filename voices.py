# voices.py - Cấu hình giọng đọc chuyên nghiệp

# Danh sách Preset giọng (Kết hợp TTS + Xử lý hậu kỳ)
VOICE_PRESETS = {
    # --- GIỌNG NỮ ---
    "Female": {
        "tts_id": "vi-VN-HoaiMyNeural",
        "tts_pitch": "+0Hz",
        "tts_rate": "+0%",
        "dsp_pitch_shift": 0  # Không chỉnh tone
    },
    "Soprano": { # Nữ cao (Hát thính phòng/Kịch tính)
        "tts_id": "vi-VN-HoaiMyNeural",
        "tts_pitch": "+15Hz", 
        "tts_rate": "+5%",
        "dsp_pitch_shift": 3  # Tăng 3 bán cung
    },
    "Alto": { # Nữ trầm (Ấm áp, Podcast)
        "tts_id": "vi-VN-HoaiMyNeural",
        "tts_pitch": "-5Hz",
        "tts_rate": "-5%",
        "dsp_pitch_shift": -2 # Giảm 2 bán cung
    },
    
    # --- GIỌNG NAM ---
    "Male": {
        "tts_id": "vi-VN-NamMinhNeural",
        "tts_pitch": "+0Hz",
        "tts_rate": "+0%",
        "dsp_pitch_shift": 0
    },
    "Tenor": { # Nam cao (Pop/Rock)
        "tts_id": "vi-VN-NamMinhNeural",
        "tts_pitch": "+10Hz",
        "tts_rate": "+5%",
        "dsp_pitch_shift": 2
    },
    "Bass": { # Nam trầm (Rap/Trữ tình)
        "tts_id": "vi-VN-NamMinhNeural",
        "tts_pitch": "-10Hz",
        "tts_rate": "-10%",
        "dsp_pitch_shift": -4
    },
    
    # --- GIỌNG ĐẶC BIỆT ---
    "Children": { # Giả giọng trẻ con
        "tts_id": "vi-VN-HoaiMyNeural",
        "tts_pitch": "+20Hz",
        "tts_rate": "+15%",
        "dsp_pitch_shift": 5
    }
}

def get_voice_config(voice_name):
    """Lấy cấu hình cho tên giọng, mặc định là Female nếu không tìm thấy"""
    return VOICE_PRESETS.get(voice_name, VOICE_PRESETS["Female"])