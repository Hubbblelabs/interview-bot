from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os



from config import get_settings
from database import connect_db, close_db
from services.tts_service import warmup_xtts_model
from services.stt_service import warmup_whisper_model

from routers import auth, resume, profile, interview, reports, admin, speech

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_db()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    try:
        await asyncio.wait_for(warmup_xtts_model(), timeout=45)
        print("XTTS warmup: ready")
    except Exception as exc:
        print(f"XTTS warmup skipped: {exc}")

    try:
        await asyncio.wait_for(warmup_whisper_model(), timeout=45)
        print("Whisper warmup: ready")
    except Exception as exc:
        print(f"Whisper warmup skipped: {exc}")
    print(f"🚀 Interview Bot API running in {settings.APP_ENV} mode")
    yield
    # Shutdown
    await close_db()


app = FastAPI(
    title="AI Mock Interview Trainer",
    description="Production-ready AI-powered mock interview platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(resume.router, prefix="/resume", tags=["Resume"])
app.include_router(profile.router, prefix="/profile", tags=["Profile"])
app.include_router(interview.router, prefix="/interview", tags=["Interview"])
app.include_router(reports.router, prefix="/reports", tags=["Reports"])
app.include_router(admin.router, prefix="/admin", tags=["Admin"])
app.include_router(speech.router, prefix="/speech", tags=["Speech"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}
