from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as aioredis
from config import get_settings

settings = get_settings()

# MongoDB Atlas
mongo_client: AsyncIOMotorClient = None
db = None

# Redis
redis_client: aioredis.Redis = None


async def connect_db():
    """Initialize MongoDB and Redis connections."""
    global mongo_client, db, redis_client

    # MongoDB Atlas
    mongo_client = AsyncIOMotorClient(settings.MONGO_URI)
    db = mongo_client[settings.MONGO_DB_NAME]

    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.resumes.create_index("user_id", unique=True)
    await db.skills.create_index("user_id")
    await db.sessions.create_index("user_id")
    await db.results.create_index("session_id")
    await db.results.create_index("user_id")
    await db.questions.create_index("role_id")

    # Redis
    redis_client = aioredis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
    )

    # Test connections
    await mongo_client.admin.command("ping")
    await redis_client.ping()
    print("✅ Connected to MongoDB Atlas and Redis")


async def close_db():
    """Close database connections."""
    global mongo_client, redis_client
    if mongo_client:
        mongo_client.close()
    if redis_client:
        await redis_client.close()
    print("🔌 Database connections closed")


def get_db():
    return db


def get_redis():
    return redis_client
