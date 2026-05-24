# backend/tests/conftest.py
"""
Shared pytest fixtures for integration tests.

The test suite uses a real MongoDB Atlas connection (test DB: interview_bot_test)
and a real Redis connection from your .env.  All test data is cleaned up after
each test session.

Set TEST_MONGO_DB_NAME in .env to override the test database name
(default: interview_bot_test).
"""

import asyncio
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# Point at the test database before importing anything that calls get_settings()
os.environ.setdefault("MONGO_DB_NAME", os.getenv("TEST_MONGO_DB_NAME", "interview_bot_test"))
os.environ.setdefault("APP_ENV", "development")  # relaxes cloud-URL validators

# Now import the app
from main import app  # noqa: E402
from database import connect_db, close_db, get_db, get_redis  # noqa: E402


# ── Event loop ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ── Database setup / teardown ─────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_db():
    """Connect once per session; drop the test DB after the session ends."""
    await connect_db()
    yield
    # Teardown: drop all test collections
    db = get_db()
    for coll in await db.list_collection_names():
        await db[coll].drop()
    await close_db()


@pytest_asyncio.fixture(autouse=True)
async def clean_collections():
    """Wipe user-generated data before each test for isolation."""
    db = get_db()
    redis = get_redis()
    for coll in ["users", "resumes", "skills", "sessions", "answers", "results",
                 "job_descriptions", "jd_verifications"]:
        await db[coll].delete_many({})
    # Flush test-related Redis keys (OTPs, reset tokens, session state)
    keys = await redis.keys("otp:*")
    keys += await redis.keys("pwd_reset:*")
    keys += await redis.keys("session:*")
    if keys:
        await redis.delete(*keys)
    yield


# ── HTTP client ───────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def client():
    """Async HTTP client backed by the FastAPI app (no real network calls)."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        yield ac


# ── Convenience fixtures ──────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def registered_student(client: AsyncClient):
    """Create and return a verified student user + token."""
    payload = {"name": "Test Student", "email": "student@test.com", "password": "Test1234"}
    res = await client.post("/auth/signup", json=payload)
    assert res.status_code == 200

    # Mark email as verified directly in DB (bypass OTP in tests)
    db = get_db()
    await db["users"].update_one({"email": payload["email"]}, {"$set": {"email_verified": True}})

    login_res = await client.post("/auth/login", json={"email": payload["email"], "password": payload["password"]})
    assert login_res.status_code == 200
    return {"user": login_res.json()["user"], "token": login_res.json()["access_token"]}


@pytest_asyncio.fixture
async def registered_admin(client: AsyncClient):
    """Create and return an admin user + token using the default admin domain."""
    payload = {"name": "Test Admin", "email": "admin@admin.com", "password": "Admin1234"}
    res = await client.post("/auth/signup", json=payload)
    assert res.status_code == 200
    db = get_db()
    await db["users"].update_one({"email": payload["email"]}, {"$set": {"email_verified": True}})
    login_res = await client.post("/auth/login", json={"email": payload["email"], "password": payload["password"]})
    assert login_res.status_code == 200
    return {"user": login_res.json()["user"], "token": login_res.json()["access_token"]}
