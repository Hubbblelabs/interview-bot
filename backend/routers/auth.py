from fastapi import APIRouter, HTTPException, Depends
from auth.jwt import get_current_user, create_access_token
from schemas.auth import SignupRequest, LoginRequest, AuthResponse
from services.auth_service import signup_user, login_user

router = APIRouter()


@router.post("/signup", response_model=AuthResponse)
async def signup(request: SignupRequest):
    """Register a new user."""
    try:
        result = await signup_user(
            name=request.name,
            email=request.email,
            password=request.password,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest):
    """Authenticate and get JWT token."""
    try:
        result = await login_user(email=request.email, password=request.password)
        return result
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/refresh")
async def refresh_token(current_user: dict = Depends(get_current_user)):
    """Re-issue a fresh access token from a still-valid token.
    Prevents mid-interview session expiry without needing a separate refresh-token store.
    """
    token = create_access_token({
        "sub": current_user["user_id"],
        "email": current_user["email"],
        "role": current_user["role"],
        "name": current_user["name"],
    })
    return {"access_token": token, "token_type": "bearer"}
