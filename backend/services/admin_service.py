from bson import ObjectId
from database import get_db
from models.collections import JOB_ROLES, ROLE_REQUIREMENTS, QUESTIONS
from utils.helpers import utc_now, str_objectid, str_objectids


# ─── Job Roles ───

async def create_role(title: str, description: str, department: str = None) -> dict:
    db = get_db()
    doc = {
        "title": title,
        "description": description,
        "department": department,
        "created_at": utc_now(),
    }
    result = await db[JOB_ROLES].insert_one(doc)
    doc["_id"] = result.inserted_id
    return str_objectid(doc)


async def update_role(role_id: str, data: dict) -> dict:
    db = get_db()
    update_data = {k: v for k, v in data.items() if v is not None}
    if not update_data:
        raise ValueError("No fields to update")
    update_data["updated_at"] = utc_now()
    await db[JOB_ROLES].update_one({"_id": ObjectId(role_id)}, {"$set": update_data})
    doc = await db[JOB_ROLES].find_one({"_id": ObjectId(role_id)})
    if not doc:
        raise ValueError("Role not found")
    return str_objectid(doc)


async def delete_role(role_id: str) -> bool:
    db = get_db()
    result = await db[JOB_ROLES].delete_one({"_id": ObjectId(role_id)})
    return result.deleted_count > 0


async def list_roles() -> list:
    db = get_db()
    cursor = db[JOB_ROLES].find().sort("created_at", -1)
    docs = await cursor.to_list(length=100)
    return str_objectids(docs)


# ─── Questions ───

async def create_question(role_id: str, question: str, difficulty: str = "medium",
                          category: str = None, expected_answer: str = None) -> dict:
    db = get_db()
    doc = {
        "role_id": role_id,
        "question": question,
        "difficulty": difficulty,
        "category": category,
        "expected_answer": expected_answer,
        "created_at": utc_now(),
    }
    result = await db[QUESTIONS].insert_one(doc)
    doc["_id"] = result.inserted_id
    return str_objectid(doc)


async def update_question(question_id: str, data: dict) -> dict:
    db = get_db()
    update_data = {k: v for k, v in data.items() if v is not None}
    if not update_data:
        raise ValueError("No fields to update")
    update_data["updated_at"] = utc_now()
    await db[QUESTIONS].update_one({"_id": ObjectId(question_id)}, {"$set": update_data})
    doc = await db[QUESTIONS].find_one({"_id": ObjectId(question_id)})
    if not doc:
        raise ValueError("Question not found")
    return str_objectid(doc)


async def delete_question(question_id: str) -> bool:
    db = get_db()
    result = await db[QUESTIONS].delete_one({"_id": ObjectId(question_id)})
    return result.deleted_count > 0


async def list_questions(role_id: str = None) -> list:
    db = get_db()
    query = {"role_id": role_id} if role_id else {}
    cursor = db[QUESTIONS].find(query).sort("created_at", -1)
    docs = await cursor.to_list(length=200)
    return str_objectids(docs)


# ─── Role Requirements ───

async def create_requirement(role_id: str, skill: str, level: str = "intermediate") -> dict:
    db = get_db()
    doc = {
        "role_id": role_id,
        "skill": skill,
        "level": level,
        "created_at": utc_now(),
    }
    result = await db[ROLE_REQUIREMENTS].insert_one(doc)
    doc["_id"] = result.inserted_id
    return str_objectid(doc)


async def list_requirements(role_id: str) -> list:
    db = get_db()
    cursor = db[ROLE_REQUIREMENTS].find({"role_id": role_id})
    docs = await cursor.to_list(length=100)
    return str_objectids(docs)


async def delete_requirement(req_id: str) -> bool:
    db = get_db()
    result = await db[ROLE_REQUIREMENTS].delete_one({"_id": ObjectId(req_id)})
    return result.deleted_count > 0
