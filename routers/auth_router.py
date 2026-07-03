from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

# Import từ file auth.py
from auth import (
    UserRegister,
    UserLogin,
    TokenResponse,
    RefreshTokenRequest,
    UserProfile,
    register_user,
    login_user,
    logout_user,
    refresh_access_token,
    get_user_profile,
    get_current_user
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister):
    """Đăng ký tài khoản mới"""
    user = await register_user(user_data)
    return {
        "message": "User registered successfully",
        "user_id": str(user["_id"])
    }

@router.post("/login", response_model=TokenResponse)
async def login(login_data: UserLogin):
    """Đăng nhập và nhận token"""
    return await login_user(login_data)

@router.post("/logout")
async def logout(
    request_data: RefreshTokenRequest,
    current_user: dict = Depends(get_current_user)
):
    """Đăng xuất (hủy refresh token)"""
    success = await logout_user(str(current_user["_id"]), request_data.refresh_token)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not logout (token already invalidated or not found)"
        )
    return {"message": "Logged out successfully"}

@router.post("/refresh")
async def refresh_token(request_data: RefreshTokenRequest):
    """Lấy Access Token mới bằng Refresh Token"""
    return await refresh_access_token(request_data.refresh_token)

@router.get("/profile", response_model=UserProfile)
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Lấy thông tin cá nhân (yêu cầu gửi kèm Access Token)"""
    return await get_user_profile(str(current_user["_id"]))
