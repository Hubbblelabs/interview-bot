from pydantic_settings import BaseSettings
from functools import lru_cache
import os
from dotenv import load_dotenv

# Load .env from backend directory
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


class Settings(BaseSettings):
    # App
    APP_ENV: str = "production"
    APP_PORT: int = 8000

    # Gemini
    GEMINI_API_KEY: str
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # MongoDB Atlas
    MONGO_URI: str
    MONGO_DB_NAME: str = "interview_bot"

    # Redis
    REDIS_URL: str

    # JWT
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY: int = 3600

    # File Storage
    UPLOAD_DIR: str = "./uploads"

    # Frontend
    NEXT_PUBLIC_API_URL: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
