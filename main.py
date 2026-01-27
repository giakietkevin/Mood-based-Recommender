from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware # <--- Thêm dòng này

app = FastAPI()

# --- CẤU HÌNH CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Cho phép mọi nguồn (để test cho dễ)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# ---------------------

@app.post("/recommend")
async def recommend(file: UploadFile = File(...)):
    # ... code xử lý cũ ...
    return {
        "mood": "happy", # Test giả lập
        "recommendations": ["Phim Mai", "Nhạc Đen Vâu", "Phim Đào, Phở và Piano"] 
    }