import json
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import config
import db
import prompts
from providers import PROVIDER_CATALOG
from services import llm

PACK_PATH = Path(__file__).resolve().parent.parent / "data" / "expert_pack.json"


def _load_pack() -> list[dict]:
    try:
        data = json.loads(PACK_PATH.read_text(encoding="utf-8"))
        return data.get("experts", [])
    except (OSError, json.JSONDecodeError):
        return []

router = APIRouter(prefix="/api/experts", tags=["experts"])


class ExpertIn(BaseModel):
    name: str = Field(min_length=1)
    title: str = ""
    persona: str = ""
    avatar_url: str = ""
    provider_type: str
    model_id: str
    max_words: int = Field(default=300, ge=50, le=500)
    domain: str = ""


class ImportPackIn(BaseModel):
    provider_type: str
    model_id: str


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


@router.get("/pack/preview")
async def preview_pack():
    """Show what the Manthan expert pack contains and what an import would add vs skip
    (dedup keyed by pack_key — re-import only adds entries not already present)."""
    pack = _load_pack()
    with db.get_conn() as conn:
        existing = {r["pack_key"] for r in conn.execute(
            "SELECT pack_key FROM experts WHERE pack_key != ''").fetchall()}
    to_add = [e for e in pack if e["pack_key"] not in existing]
    already = [e for e in pack if e["pack_key"] in existing]
    by_domain: dict[str, int] = {}
    for e in to_add:
        by_domain[e["domain"]] = by_domain.get(e["domain"], 0) + 1
    return {
        "status": "ok",
        "total": len(pack),
        "to_add": len(to_add),
        "already_present": len(already),
        "domains": sorted({e["domain"] for e in pack}),
        "add_by_domain": by_domain,
    }


@router.post("/pack/import")
async def import_pack(payload: ImportPackIn):
    """Import the Manthan expert pack. Every imported expert is assigned the single
    default model the user chose. Idempotent: entries whose pack_key already exists are
    skipped, so re-import only restores deleted ones and never creates duplicates."""
    with db.get_conn() as conn:
        llm.validate_model_choice(conn, payload.provider_type, payload.model_id)
        existing = {r["pack_key"] for r in conn.execute(
            "SELECT pack_key FROM experts WHERE pack_key != ''").fetchall()}
        pack = _load_pack()
        added = 0
        for e in pack:
            if e["pack_key"] in existing:
                continue
            conn.execute(
                """INSERT INTO experts (name, title, persona, avatar_url, provider_type, model_id,
                                        max_words, domain, pack_key)
                   VALUES (?, ?, ?, '', ?, ?, ?, ?, ?)""",
                (e["name"], e["title"], e["persona"], payload.provider_type, payload.model_id,
                 int(e.get("max_words", 300)), e.get("domain", ""), e["pack_key"]),
            )
            added += 1
        experts = db.rows_to_dicts(conn.execute("SELECT * FROM experts ORDER BY created_at DESC").fetchall())
    return {"status": "ok", "added": added, "experts": experts}


@router.post("")
async def create_expert(payload: ExpertIn):
    with db.get_conn() as conn:
        llm.validate_model_choice(conn, payload.provider_type, payload.model_id)
        cursor = conn.execute(
            """INSERT INTO experts (name, title, persona, avatar_url, provider_type, model_id, max_words, domain)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (payload.name.strip(), payload.title.strip(), payload.persona.strip(),
             _normalize_avatar(payload.avatar_url), payload.provider_type, payload.model_id,
             payload.max_words, payload.domain.strip()),
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
               provider_type = ?, model_id = ?, max_words = ?, domain = ?, is_starter = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?""",
            (payload.name.strip(), payload.title.strip(), payload.persona.strip(),
             _normalize_avatar(payload.avatar_url), payload.provider_type, payload.model_id,
             payload.max_words, payload.domain.strip(), expert_id),
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
            """INSERT INTO experts (name, title, persona, avatar_url, provider_type, model_id, max_words, domain)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (f"{source['name']} (copy)", source["title"], source["persona"],
             source["avatar_url"], source["provider_type"], source["model_id"],
             source["max_words"], source["domain"]),
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
        existing_domains = [r["domain"] for r in conn.execute(
            "SELECT DISTINCT domain FROM experts WHERE domain != '' ORDER BY domain").fetchall()]
    inventory = {p: [m["model_id"] for m in PROVIDER_CATALOG[p]["models"]] for p in valid_providers}
    messages = [{"role": m.role, "content": m.content} for m in payload.messages if m.content.strip()]
    if not messages:
        raise HTTPException(status_code=400, detail="No messages provided.")
    messages.append({"role": "user", "content":
                     f"Available providers and models: {json.dumps(inventory)}\n"
                     f"Existing domains in the library (reuse one if it reasonably fits, "
                     f"otherwise propose a concise new domain name): {json.dumps(existing_domains)}"})
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
