"""
Auth Module - MongoDB Atlas Integration
Xử lý: Register, Login, Logout, Get Profile, Refresh Token
"""

import os
from datetime import datetime, timedelta
from typing import Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pydantic import BaseModel, EmailStr, Field
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv

# Load .env file
load_dotenv()

# ============================================================
# CẤU HÌNH
# ============================================================
# Trên Hugging Face, các biến này sẽ được truyền qua Secrets
MONGODB_URL = os.getenv("MONGODB_URL", "")
SECRET_KEY = os.getenv("SECRET_KEY", "default-secret-key-for-local-dev-123456")

DATABASE_NAME = "mood_recommender"
USERS_COLLECTION = "users"
SESSIONS_COLLECTION = "user_sessions"

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# ============================================================
# PYDANTIC MODELS
# ============================================================

class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: str = Field(..., min_length=2)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict

class UserProfile(BaseModel):
    id: str = Field(alias="_id")
    email: str
    full_name: str
    avatar_url: Optional[str] = None
    created_at: datetime
    last_login_at: Optional[datetime] = None

    class Config:
        populate_by_name = True

class RefreshTokenRequest(BaseModel):
    refresh_token: str

# ============================================================
# DATABASE CONNECTION
# ============================================================

class MongoDBConnection:
    client: Optional[AsyncIOMotorClient] = None
    db: Optional[AsyncIOMotorDatabase] = None

    @classmethod
    async def connect_db(cls):
        """Kết nối tới MongoDB Atlas"""
        if not MONGODB_URL:
            print("⚠️ WARNING: MONGODB_URL is empty! Auth database connection failed.")
            return

        try:
            cls.client = AsyncIOMotorClient(MONGODB_URL)
            cls.db = cls.client[DATABASE_NAME]

            # Tạo indexes để tối ưu query
            users_col = cls.db[USERS_COLLECTION]
            await users_col.create_index("email", unique=True)
            await users_col.create_index("created_at")

            sessions_col = cls.db[SESSIONS_COLLECTION]
            await sessions_col.create_index("user_id")
            await sessions_col.create_index("refresh_token", unique=True)
            await sessions_col.create_index("expires_at", expireAfterSeconds=0)  # TTL Index

            print("Connected to MongoDB Atlas")
        except Exception as e:
            print(f"❌ Failed to connect to MongoDB Atlas: {e}")

    @classmethod
    async def close_db(cls):
        """Đóng kết nối MongoDB"""
        if cls.client:
            cls.client.close()
            print("Disconnected from MongoDB Atlas")

    @classmethod
    def get_db(cls) -> AsyncIOMotorDatabase:
        """Lấy database instance"""
        if cls.db is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database connection is not initialized. Check MONGODB_URL."
            )
        return cls.db

# ============================================================
# PASSWORD HASHING
# ============================================================

def hash_password(password: str) -> str:
    """Băm mật khẩu bằng bcrypt"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Kiểm tra mật khẩu"""
    return pwd_context.verify(plain_password, hashed_password)

# ============================================================
# JWT TOKEN
# ============================================================

def create_access_token(user_id: str, expires_delta: Optional[timedelta] = None) -> str:
    """Tạo Access Token (ngắn hạn)"""
    if expires_delta is None:
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    expire = datetime.utcnow() + expires_delta
    to_encode = {"sub": user_id, "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(user_id: str) -> str:
    """Tạo Refresh Token (dài hạn)"""
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode = {"sub": user_id, "type": "refresh", "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> str:
    """Xác minh token và trả về user_id"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        return user_id
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )

# ============================================================
# DEPENDENCY: GET CURRENT USER
# ============================================================

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """Lấy user hiện tại từ token"""
    token = credentials.credentials
    user_id = verify_token(token)

    db = MongoDBConnection.get_db()
    users_col = db[USERS_COLLECTION]

    user = await users_col.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    return user

# ============================================================
# AUTH FUNCTIONS
# ============================================================

async def register_user(user_data: UserRegister) -> dict:
    """Đăng ký user mới"""
    db = MongoDBConnection.get_db()
    users_col = db[USERS_COLLECTION]

    # Kiểm tra email đã tồn tại chưa
    existing_user = await users_col.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Tạo user mới
    new_user = {
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "full_name": user_data.full_name,
        "avatar_url": None,
        "status": "active",
        "created_at": datetime.utcnow(),
        "last_login_at": None
    }

    result = await users_col.insert_one(new_user)
    new_user["_id"] = result.inserted_id

    return new_user

async def login_user(login_data: UserLogin) -> dict:
    """Đăng nhập user"""
    db = MongoDBConnection.get_db()
    users_col = db[USERS_COLLECTION]
    sessions_col = db[SESSIONS_COLLECTION]

    # Tìm user theo email
    user = await users_col.find_one({"email": login_data.email})
    if not user or not verify_password(login_data.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # Tạo tokens
    access_token = create_access_token(str(user["_id"]))
    refresh_token = create_refresh_token(str(user["_id"]))

    # Lưu session vào DB
    session = {
        "user_id": user["_id"],
        "refresh_token": refresh_token,
        "ip_address": None,  # Có thể lấy từ request.client.host
        "user_agent": None,  # Có thể lấy từ request.headers
        "is_active": True,
        "login_at": datetime.utcnow(),
        "logout_at": None,
        "expires_at": datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    }
    await sessions_col.insert_one(session)

    # Update last_login_at
    await users_col.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login_at": datetime.utcnow()}}
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "full_name": user["full_name"]
        }
    }

async def logout_user(user_id: str, refresh_token: str) -> bool:
    """Đăng xuất user"""
    db = MongoDBConnection.get_db()
    sessions_col = db[SESSIONS_COLLECTION]

    result = await sessions_col.update_one(
        {"user_id": ObjectId(user_id), "refresh_token": refresh_token},
        {
            "$set": {
                "is_active": False,
                "logout_at": datetime.utcnow()
            }
        }
    )

    return result.modified_count > 0

async def refresh_access_token(refresh_token: str) -> dict:
    """Làm mới Access Token bằng Refresh Token"""
    db = MongoDBConnection.get_db()
    sessions_col = db[SESSIONS_COLLECTION]

    # Xác minh refresh token
    user_id = verify_token(refresh_token)

    # Kiểm tra session còn active không
    session = await sessions_col.find_one({
        "user_id": ObjectId(user_id),
        "refresh_token": refresh_token,
        "is_active": True
    })

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    # Tạo access token mới
    new_access_token = create_access_token(user_id)

    return {
        "access_token": new_access_token,
        "token_type": "bearer"
    }

async def get_user_profile(user_id: str) -> dict:
    """Lấy thông tin profile user"""
    db = MongoDBConnection.get_db()
    users_col = db[USERS_COLLECTION]

    user = await users_col.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "full_name": user["full_name"],
        "avatar_url": user.get("avatar_url"),
        "created_at": user["created_at"],
        "last_login_at": user.get("last_login_at")
    }
