from fastapi import APIRouter, HTTPException
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
