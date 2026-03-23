from passlib.context import CryptContext
from database import get_db
from models.collections import USERS
from utils.helpers import utc_now, str_objectid
from auth.jwt import create_access_token

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def signup_user(name: str, email: str, password: str, role: str = None) -> dict:
    """Register a new user."""
    db = get_db()

    # Check if user exists
    existing = await db[USERS].find_one({"email": email})
    if existing:
        raise ValueError("User with this email already exists")

    # Enforce role logic
    determined_role = "admin" if email.endswith("@admin.com") else "student"

    hashed_password = pwd_context.hash(password)
    user_doc = {
        "name": name,
        "email": email,
        "password": hashed_password,
        "role": determined_role,
        "speech_settings": {
            "voice_gender": "female",
        },
        "created_at": utc_now(),
    }

    result = await db[USERS].insert_one(user_doc)
    user_doc["_id"] = result.inserted_id
    user = str_objectid(user_doc)
    del user["password"]

    token = create_access_token({
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"],
        "name": user["name"],
    })

    return {"access_token": token, "token_type": "bearer", "user": user}


async def login_user(email: str, password: str) -> dict:
    """Authenticate a user and return JWT."""
    db = get_db()

    user_doc = await db[USERS].find_one({"email": email})
    if not user_doc:
        raise ValueError("Invalid email or password")

    if not pwd_context.verify(password, user_doc["password"]):
        raise ValueError("Invalid email or password")

    user = str_objectid(user_doc)
    del user["password"]

    token = create_access_token({
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"],
        "name": user["name"],
    })

    return {"access_token": token, "token_type": "bearer", "user": user}
