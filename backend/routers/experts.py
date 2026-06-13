import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import config
import db
import prompts
from providers import PROVIDER_CATALOG
from services import llm

router = APIRouter(prefix="/api/experts", tags=["experts"])


class ExpertIn(BaseModel):
    name: str = Field(min_length=1)
    title: str = ""
    persona: str = ""
    avatar_url: str = ""
    provider_type: str
    model_id: str
    max_words: int = Field(default=300, ge=50, le=500)


class BuilderMessage(BaseModel):
    role: str
    content: str


class BuilderChatIn(BaseModel):
    messages: list[BuilderMessage]


class SuggestIn(BaseModel):
    problem: str = Field(min_length=1)


def _normalize_avatar(value: str) -> str:
    avatar = (value or "").strip()
    if not avatar:
        return ""
    if avatar.startswith(("http://", "https://", "/uploads/")):
        return avatar
    raise HTTPException(status_code=400, detail="Avatar must be a public URL or an uploaded image.")


def _expert_dict(row) -> dict:
    return db.row_to_dict(row)


@router.get("")
async def list_experts():
    with db.get_conn() as conn:
        experts = db.rows_to_dicts(conn.execute("SELECT * FROM experts ORDER BY created_at DESC").fetchall())
    return {"status": "ok", "experts": experts}


@router.post("")
async def create_expert(payload: ExpertIn):
    with db.get_conn() as conn:
        llm.validate_model_choice(conn, payload.provider_type, payload.model_id)
        cursor = conn.execute(
            """INSERT INTO experts (name, title, persona, avatar_url, provider_type, model_id, max_words)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (payload.name.strip(), payload.title.strip(), payload.persona.strip(),
             _normalize_avatar(payload.avatar_url), payload.provider_type, payload.model_id, payload.max_words),
        )
        expert = _expert_dict(conn.execute("SELECT * FROM experts WHERE id = ?", (cursor.lastrowid,)).fetchone())
    return {"status": "ok", "expert": expert}


@router.put("/{expert_id}")
async def update_expert(expert_id: int, payload: ExpertIn):
    with db.get_conn() as conn:
        if not conn.execute("SELECT id FROM experts WHERE id = ?", (expert_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Expert not found.")
        llm.validate_model_choice(conn, payload.provider_type, payload.model_id)
        conn.execute(
            """UPDATE experts SET name = ?, title = ?, persona = ?, avatar_url = ?,
               provider_type = ?, model_id = ?, max_words = ?, is_starter = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?""",
            (payload.name.strip(), payload.title.strip(), payload.persona.strip(),
             _normalize_avatar(payload.avatar_url), payload.provider_type, payload.model_id, payload.max_words, expert_id),
        )
        expert = _expert_dict(conn.execute("SELECT * FROM experts WHERE id = ?", (expert_id,)).fetchone())
    return {"status": "ok", "expert": expert}


@router.post("/{expert_id}/duplicate")
async def duplicate_expert(expert_id: int):
    with db.get_conn() as conn:
        source = _expert_dict(conn.execute("SELECT * FROM experts WHERE id = ?", (expert_id,)).fetchone())
        if not source:
            raise HTTPException(status_code=404, detail="Expert not found.")
        cursor = conn.execute(
            """INSERT INTO experts (name, title, persona, avatar_url, provider_type, model_id, max_words)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (f"{source['name']} (copy)", source["title"], source["persona"],
             source["avatar_url"], source["provider_type"], source["model_id"], source["max_words"]),
        )
        expert = _expert_dict(conn.execute("SELECT * FROM experts WHERE id = ?", (cursor.lastrowid,)).fetchone())
    return {"status": "ok", "expert": expert}


@router.delete("/{expert_id}")
async def delete_expert(expert_id: int):
    with db.get_conn() as conn:
        if not conn.execute("SELECT id FROM experts WHERE id = ?", (expert_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Expert not found.")
        conn.execute("DELETE FROM experts WHERE id = ?", (expert_id,))
    return {"status": "ok"}


@router.post("/builder/chat")
async def builder_chat(payload: BuilderChatIn):
    with db.get_conn() as conn:
        provider_type, model_id = llm.get_default_model(conn)
        api_key = llm.get_api_key(conn, provider_type)
        valid_providers = [r["provider_type"] for r in conn.execute(
            "SELECT provider_type FROM provider_configs WHERE is_valid = 1").fetchall()]
    inventory = {p: [m["model_id"] for m in PROVIDER_CATALOG[p]["models"]] for p in valid_providers}
    messages = [{"role": m.role, "content": m.content} for m in payload.messages if m.content.strip()]
    if not messages:
        raise HTTPException(status_code=400, detail="No messages provided.")
    messages.append({"role": "user", "content": f"Available providers and models: {json.dumps(inventory)}"})
    parsed, usage = await llm.call_json(
        provider_type=provider_type, model_id=model_id, api_key=api_key,
        system_prompt=prompts.BUILDER_SYSTEM_PROMPT, messages=messages,
        max_tokens=config.BUILDER_MAX_TOKENS,
        log_purpose="builder",
    )
    with db.get_conn() as conn:
        llm.record_usage(conn, session_id=None, expert_name="Manthan AI",
                         provider_type=provider_type, model_id=model_id, purpose="builder", usage=usage)
    return {
        "status": "ok",
        "assistant_message": parsed.get("assistant_message", ""),
        "ready": bool(parsed.get("ready")),
        "expert": parsed.get("expert"),
    }


@router.post("/suggest")
async def suggest_experts(payload: SuggestIn):
    with db.get_conn() as conn:
        provider_type, model_id = llm.get_default_model(conn)
        api_key = llm.get_api_key(conn, provider_type)
        experts = db.rows_to_dicts(conn.execute("SELECT id, name, title FROM experts").fetchall())
    if not experts:
        raise HTTPException(status_code=400, detail="No experts in the library yet.")
    user_msg = json.dumps({"problem": payload.problem, "library": experts}, ensure_ascii=False)
    parsed, usage = await llm.call_json(
        provider_type=provider_type, model_id=model_id, api_key=api_key,
        system_prompt=prompts.SUGGEST_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}], max_tokens=400,
        log_purpose="suggest",
    )
    valid_ids = {e["id"] for e in experts}
    suggested = [i for i in parsed.get("expert_ids", []) if i in valid_ids]
    with db.get_conn() as conn:
        llm.record_usage(conn, session_id=None, expert_name="Manthan AI",
                         provider_type=provider_type, model_id=model_id, purpose="suggest", usage=usage)
    return {"status": "ok", "expert_ids": suggested, "reasoning": parsed.get("reasoning", "")}
