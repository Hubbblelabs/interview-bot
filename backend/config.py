from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache
import os
from dotenv import load_dotenv

# Load .env from backend directory
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


class Settings(BaseSettings):
    # App
    APP_ENV: str = "production"
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000

    # Gemini
    GEMINI_API_KEY: str
    GEMINI_MODEL: str = "gemini-2.5-flash"
    GEMINI_FALLBACK_MODELS: str = ""

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

    @field_validator("MONGO_URI")
    @classmethod
    def validate_mongo_uri(cls, value: str) -> str:
        v = (value or "").strip().lower()
        if "localhost" in v or "127.0.0.1" in v:
            raise ValueError("MONGO_URI must point to MongoDB Atlas, not localhost")
        if not v.startswith("mongodb+srv://"):
            raise ValueError("MONGO_URI must use mongodb+srv:// for cloud deployment")
        return value

    @field_validator("REDIS_URL")
    @classmethod
    def validate_redis_url(cls, value: str) -> str:
        v = (value or "").strip().lower()
        if "localhost" in v or "127.0.0.1" in v:
            raise ValueError("REDIS_URL must point to a cloud Redis instance, not localhost")
        if not (v.startswith("redis://") or v.startswith("rediss://")):
            raise ValueError("REDIS_URL must start with redis:// or rediss://")
        return value


@lru_cache()
def get_settings() -> Settings:
    return Settings()
