from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

import config
import db
import prompts
from services import llm, orchestrator

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


class SessionCreateIn(BaseModel):
    title: str = ""
    expert_ids: list[int]
    round2_enabled: bool = False
    synthesis_enabled: bool = True


class IntakeIn(BaseModel):
    message: str = Field(min_length=1)


class DispatchIn(BaseModel):
    brief: str = Field(min_length=1)  # final user-approved brief text


class PendingBriefIn(BaseModel):
    brief: str = ""  # in-progress edit on the approval screen (may be empty)


class RenameIn(BaseModel):
    title: str = Field(min_length=1)


class RetryIn(BaseModel):
    round: int = Field(ge=1, le=2)


def _live_overlay_experts(conn, session: dict, experts: list[dict]) -> list[dict]:
    """For a session that hasn't run round 1 yet, show each participant's CURRENT
    model/persona from the Experts library (source of truth). After round 1 the
    stored snapshot is authoritative (historical accuracy)."""
    if session["round1_done"]:
        return experts
    for e in experts:
        if not e.get("expert_id"):
            continue
        live = db.row_to_dict(conn.execute(
            "SELECT name, title, persona, avatar_url, provider_type, model_id FROM experts WHERE id = ?",
            (e["expert_id"],)).fetchone())
        if live:
            e.update(live)
    return experts


def _session_detail(conn, session_id: int) -> dict:
    session = orchestrator.load_session(conn, session_id)
    experts = _live_overlay_experts(conn, session, orchestrator.load_session_experts(conn, session_id))
    intake = db.rows_to_dicts(conn.execute(
        "SELECT id, role, content, created_at FROM intake_messages WHERE session_id = ? ORDER BY id",
        (session_id,)).fetchall())
    responses = db.rows_to_dicts(conn.execute(
        "SELECT * FROM responses WHERE session_id = ? ORDER BY round, kind DESC, id",
        (session_id,)).fetchall())
    usage = db.row_to_dict(conn.execute(
        """SELECT COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens,
                  COALESCE(SUM(cached_tokens),0) AS cached_tokens, COALESCE(SUM(cost),0) AS cost,
                  COUNT(*) AS calls
           FROM usage_log WHERE session_id = ?""", (session_id,)).fetchone())
    usage_rows = db.rows_to_dicts(conn.execute(
        """SELECT id, expert_name, provider_type, model_id, purpose,
                  input_tokens, output_tokens, cached_tokens, cost, created_at
           FROM usage_log WHERE session_id = ? ORDER BY id""", (session_id,)).fetchall())
    return {"session": session, "experts": experts, "intake_messages": intake,
            "responses": responses, "usage_totals": usage, "usage_log": usage_rows}


@router.get("")
async def list_sessions():
    with db.get_conn() as conn:
        sessions = db.rows_to_dicts(conn.execute(
            "SELECT * FROM sessions ORDER BY updated_at DESC").fetchall())
        for session in sessions:
            session["experts"] = db.rows_to_dicts(conn.execute(
                "SELECT id, name, title, avatar_url FROM session_experts WHERE session_id = ? ORDER BY sort_order",
                (session["id"],)).fetchall())
            cost_row = conn.execute(
                "SELECT COALESCE(SUM(cost),0) AS cost FROM usage_log WHERE session_id = ?",
                (session["id"],)).fetchone()
            session["total_cost"] = cost_row["cost"]
    return {"status": "ok", "sessions": sessions}


@router.post("")
async def create_session(payload: SessionCreateIn):
    count = len(payload.expert_ids)
    if not config.MIN_EXPERTS_PER_SESSION <= count <= config.MAX_EXPERTS_PER_SESSION:
        raise HTTPException(
            status_code=400,
            detail=f"Select between {config.MIN_EXPERTS_PER_SESSION} and {config.MAX_EXPERTS_PER_SESSION} experts.")
    with db.get_conn() as conn:
        experts = db.rows_to_dicts(conn.execute(
            f"SELECT * FROM experts WHERE id IN ({','.join('?' * count)})", tuple(payload.expert_ids)).fetchall())
        if len(experts) != count:
            raise HTTPException(status_code=400, detail="One or more selected experts do not exist.")
        for expert in experts:
            llm.validate_model_choice(conn, expert["provider_type"], expert["model_id"])
        llm.get_default_model(conn)  # intake/synthesis model must be configured
        title = payload.title.strip() or "Untitled Council Session"
        cursor = conn.execute(
            """INSERT INTO sessions (title, status, round2_enabled, synthesis_enabled)
               VALUES (?, 'briefing', ?, ?)""",
            (title, int(payload.round2_enabled), int(payload.synthesis_enabled)),
        )
        session_id = cursor.lastrowid
        by_id = {e["id"]: e for e in experts}
        for idx, expert_id in enumerate(payload.expert_ids):
            e = by_id[expert_id]
            conn.execute(
                """INSERT INTO session_experts
                   (session_id, expert_id, name, title, persona, avatar_url, provider_type, model_id, sort_order)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (session_id, e["id"], e["name"], e["title"], e["persona"],
                 e["avatar_url"], e["provider_type"], e["model_id"], idx),
            )
        detail = _session_detail(conn, session_id)
    return {"status": "ok", **detail}


@router.get("/{session_id}")
async def get_session(session_id: int):
    with db.get_conn() as conn:
        detail = _session_detail(conn, session_id)
    return {"status": "ok", **detail}


@router.patch("/{session_id}")
async def rename_session(session_id: int, payload: RenameIn):
    with db.get_conn() as conn:
        orchestrator.load_session(conn, session_id)
        conn.execute("UPDATE sessions SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                     (payload.title.strip(), session_id))
    return {"status": "ok"}


@router.delete("/{session_id}")
async def delete_session(session_id: int):
    with db.get_conn() as conn:
        orchestrator.load_session(conn, session_id)
        conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
    return {"status": "ok"}


@router.post("/{session_id}/intake")
async def intake_turn(session_id: int, payload: IntakeIn):
    with db.get_conn() as conn:
        session = orchestrator.load_session(conn, session_id)
        orchestrator.assert_not_frozen(session)
        if session["round1_done"]:
            raise HTTPException(status_code=409, detail="The council has already been briefed.")
        provider_type, model_id = llm.get_default_model(conn)
        api_key = llm.get_api_key(conn, provider_type)
        conn.execute("INSERT INTO intake_messages (session_id, role, content) VALUES (?, 'user', ?)",
                     (session_id, payload.message.strip()))
        history = db.rows_to_dicts(conn.execute(
            "SELECT role, content FROM intake_messages WHERE session_id = ? ORDER BY id",
            (session_id,)).fetchall())
    parsed, usage = await llm.call_json(
        provider_type=provider_type, model_id=model_id, api_key=api_key,
        system_prompt=prompts.INTAKE_SYSTEM_PROMPT,
        messages=[{"role": m["role"], "content": m["content"]} for m in history],
        max_tokens=config.INTAKE_MAX_TOKENS,
        log_session_id=session_id, log_purpose="intake",
    )
    assistant_message = parsed.get("assistant_message", "")
    ready = bool(parsed.get("ready_to_dispatch"))
    brief = (parsed.get("compiled_brief") or "").strip() if ready else ""
    with db.get_conn() as conn:
        conn.execute("INSERT INTO intake_messages (session_id, role, content) VALUES (?, 'assistant', ?)",
                     (session_id, assistant_message))
        # persist the compiled brief so the approval screen survives a refresh
        if ready and brief:
            conn.execute("UPDATE sessions SET pending_brief = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                         (brief, session_id))
        llm.record_usage(conn, session_id=session_id, expert_name="Manthan AI",
                         provider_type=provider_type, model_id=model_id, purpose="intake", usage=usage)
    return {"status": "ok", "assistant_message": assistant_message,
            "ready_to_dispatch": ready and bool(brief), "compiled_brief": brief}


@router.put("/{session_id}/pending-brief")
async def update_pending_brief(session_id: int, payload: PendingBriefIn):
    """Persist edits to the compiled brief while on the approval screen (saved on blur)."""
    with db.get_conn() as conn:
        session = orchestrator.load_session(conn, session_id)
        orchestrator.assert_not_frozen(session)
        if session["round1_done"]:
            raise HTTPException(status_code=409, detail="The council has already been briefed.")
        conn.execute("UPDATE sessions SET pending_brief = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                     (payload.brief, session_id))
    return {"status": "ok"}


@router.post("/{session_id}/back-to-briefing")
async def back_to_briefing(session_id: int):
    """Clear the pending brief so the session returns to the briefing chat."""
    with db.get_conn() as conn:
        session = orchestrator.load_session(conn, session_id)
        orchestrator.assert_not_frozen(session)
        conn.execute("UPDATE sessions SET pending_brief = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                     (session_id,))
    return {"status": "ok"}


@router.post("/{session_id}/dispatch")
async def dispatch(session_id: int, payload: DispatchIn):
    """Store the user-approved brief and run round 1 for all experts (SSE)."""
    with db.get_conn() as conn:
        session = orchestrator.load_session(conn, session_id)
        orchestrator.assert_not_frozen(session)
        if session["round1_done"]:
            raise HTTPException(status_code=409, detail="Round 1 already ran for this session.")
        # Source of truth = the Experts library. Re-read each participant from its
        # live expert (model/persona/name/title/avatar) so edits made after the
        # session was created take effect. Skip if the expert was deleted, or if its
        # provider no longer has a valid key (keep the prior snapshot in that case).
        valid_providers = {r["provider_type"] for r in conn.execute(
            "SELECT provider_type FROM provider_configs WHERE is_valid = 1").fetchall()}
        participants = db.rows_to_dicts(conn.execute(
            "SELECT id, expert_id FROM session_experts WHERE session_id = ?", (session_id,)).fetchall())
        for p in participants:
            if not p["expert_id"]:
                continue
            ex = db.row_to_dict(conn.execute("SELECT * FROM experts WHERE id = ?", (p["expert_id"],)).fetchone())
            if not ex or ex["provider_type"] not in valid_providers:
                continue
            conn.execute(
                """UPDATE session_experts
                   SET name = ?, title = ?, persona = ?, avatar_url = ?, provider_type = ?, model_id = ?
                   WHERE id = ?""",
                (ex["name"], ex["title"], ex["persona"], ex["avatar_url"],
                 ex["provider_type"], ex["model_id"], p["id"]),
            )
        conn.execute(
            "UPDATE sessions SET compiled_brief = ?, pending_brief = '', status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (payload.brief.strip(), session_id))
    from services import session_logger
    session_logger.log_session_event(session_id, "Brief approved — dispatching round 1",
                                      detail=payload.brief.strip())
    ctx = orchestrator.validate_round(session_id, 1)
    return StreamingResponse(orchestrator.run_round(ctx),
                             media_type="text/event-stream", headers=SSE_HEADERS)


@router.post("/{session_id}/round2")
async def round2(session_id: int):
    ctx = orchestrator.validate_round(session_id, 2)
    return StreamingResponse(orchestrator.run_round(ctx),
                             media_type="text/event-stream", headers=SSE_HEADERS)


@router.post("/{session_id}/synthesize")
async def synthesize(session_id: int, round: int = 1):
    if round not in (1, 2):
        raise HTTPException(status_code=400, detail="round must be 1 or 2.")
    ctx = orchestrator.validate_synthesis(session_id, round)
    return StreamingResponse(orchestrator.run_synthesis(ctx),
                             media_type="text/event-stream", headers=SSE_HEADERS)


@router.post("/{session_id}/experts/{session_expert_id}/retry")
async def retry_expert(session_id: int, session_expert_id: int, payload: RetryIn):
    ctx = orchestrator.validate_round(session_id, payload.round, only_expert_id=session_expert_id)
    return StreamingResponse(orchestrator.run_round(ctx),
                             media_type="text/event-stream", headers=SSE_HEADERS)
