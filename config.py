# config.py - Quản lý toàn bộ công thức chế biến của AI

# 1. CÔNG THỨC GIỌNG (VOICES)
# Thay vì lưu file, ta lưu thông số để bẻ giọng
VOICE_PRESETS = {
    "Female":   {"base": "vi-VN-HoaiMyNeural",  "pitch": 0,  "gender": "female"},
    "Male":     {"base": "vi-VN-NamMinhNeural", "pitch": 0,  "gender": "male"},
    "Soprano":  {"base": "vi-VN-HoaiMyNeural",  "pitch": 4,  "gender": "female"}, # Cao vút
    "Bass":     {"base": "vi-VN-NamMinhNeural", "pitch": -6, "gender": "male"},   # Trầm ồm
    "Chipmunk": {"base": "vi-VN-HoaiMyNeural",  "pitch": 8,  "gender": "female"}  # Giọng hoạt hình
}

# 2. CÔNG THỨC CẢM XÚC (MOODS)
# Các hiệu ứng sẽ được áp dụng
MOOD_PRESETS = {
    "Sadness":  {"reverb": 0.8, "speed": 0.9, "filter": "low_pass"}, # Vang nhiều, chậm
    "Joy":      {"reverb": 0.2, "speed": 1.1, "filter": "none"},     # Vang ít, nhanh
    "Anger":    {"reverb": 0.1, "gain": 5.0,  "filter": "distortion"} # To, vỡ tiếng
}

# 3. CÔNG THỨC TỐC ĐỘ (TEMPOS)
# BPM mục tiêu
TEMPO_MAP = {
    "Slow": 75,
    "Medium": 110,
    "Fast": 140,
    "Super Fast": 170
}