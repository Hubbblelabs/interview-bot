from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from config import get_settings
from database import connect_db, close_db

from routers import auth, resume, profile, interview, reports, admin

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_db()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
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


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}
