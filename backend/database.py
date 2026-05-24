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

    # MongoDB Atlas — explicit pool for 30 concurrent users.
    # maxPoolSize=50 allows up to 50 simultaneous DB operations.
    # minPoolSize=5 keeps warm connections ready at startup.
    mongo_client = AsyncIOMotorClient(
        settings.MONGO_URI,
        maxPoolSize=50,
        minPoolSize=5,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=10000,
        socketTimeoutMS=30000,
    )
    db = mongo_client[settings.MONGO_DB_NAME]

    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.resumes.create_index("user_id", unique=True)
    await db.skills.create_index("user_id")
    await db.sessions.create_index("user_id")
    await db.results.create_index("session_id")
    await db.results.create_index("user_id")
    await db.answers.create_index("user_id")
    await db.answers.create_index("session_id")
    await db.questions.create_index("role_id")
    await db.jd_verifications.create_index([("user_id", 1), ("cache_key", 1)])

    # Redis — explicit connection pool (max_connections=30 covers all workers).
    redis_client = aioredis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        max_connections=30,
        socket_connect_timeout=5,
        socket_timeout=10,
        retry_on_timeout=True,
    )

    # Test connections
    try:
        await mongo_client.admin.command("ping")
        print("✅ Connected to MongoDB Atlas")
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")

    try:
        await redis_client.ping()
        print("✅ Connected to Redis")
    except Exception as e:
        print(f"⚠️ Failed to connect to Redis (URL might be invalid or unreachable): {e}")


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
