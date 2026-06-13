"""Council orchestration: parallel expert rounds, synthesis, freeze logic.

All streaming endpoints emit SSE lines: `data: {json}\n\n` with event types:
  expert_start   {expert_id, name, round}
  chunk          {expert_id, round, text}            (expert_id null => synthesis)
  expert_done    {expert_id, round, stance, usage}
  expert_failed  {expert_id, round, error}
  synthesis_start / synthesis_done {round, usage} / synthesis_failed
  stage_done     {stage, session_status}
"""
from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

from fastapi import HTTPException

import time

import config
import db
import prompts
from providers import ProviderError, get_provider
from services import llm, session_logger


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def load_session(conn, session_id: int) -> dict:
    session = db.row_to_dict(conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone())
    if not session:
        raise HTTPException(status_code=404, detail="Session not found.")
    return session


def load_session_experts(conn, session_id: int) -> list[dict]:
    return db.rows_to_dicts(conn.execute(
        "SELECT * FROM session_experts WHERE session_id = ? ORDER BY sort_order",
        (session_id,),
    ).fetchall())


def compute_status(session: dict) -> str:
    """Derive session status from stage flags + toggles."""
    r2 = bool(session["round2_enabled"])
    synth = bool(session["synthesis_enabled"])
    stages_done = bool(session["round1_done"])
    if synth:
        stages_done = stages_done and bool(session["synth1_done"])
    if r2:
        stages_done = stages_done and bool(session["round2_done"])
        if synth:
            stages_done = stages_done and bool(session["synth2_done"])
    if stages_done:
        return "frozen"
    if not session["compiled_brief"]:
        return "briefing"
    if not session["round1_done"]:
        return "ready"
    return "in_progress"


def refresh_status(conn, session_id: int) -> str:
    session = load_session(conn, session_id)
    status = compute_status(session)
    conn.execute(
        "UPDATE sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (status, session_id),
    )
    return status


def assert_not_frozen(session: dict) -> None:
    if session["status"] == "frozen":
        raise HTTPException(status_code=409, detail="This session is frozen and read-only.")


def _save_response(session_id: int, session_expert_id: int | None, kind: str, round_number: int,
                   stance: str, content: str, status: str, error: str = "") -> None:
    with db.get_conn() as conn:
        conn.execute(
            """INSERT INTO responses (session_id, session_expert_id, kind, round, stance, content, status, error)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(session_id, session_expert_id, kind, round)
               DO UPDATE SET stance = excluded.stance, content = excluded.content,
                             status = excluded.status, error = excluded.error,
                             created_at = CURRENT_TIMESTAMP""",
            (session_id, session_expert_id, kind, round_number, stance, content, status, error),
        )


async def _run_one_expert(session: dict, expert: dict, round_number: int,
                          round1_answers: dict[int, dict], queue: asyncio.Queue,
                          round1_synthesis: str = "") -> None:
    """Run a single expert call, pushing SSE events to the shared queue and persisting the result."""
    expert_id = expert["id"]
    purpose = f"expert_r{round_number}"
    system = prompts.expert_system_prompt(expert["name"], expert["title"], expert["persona"])
    messages: list[dict] = []
    await queue.put(sse({"type": "expert_start", "expert_id": expert_id, "name": expert["name"], "round": round_number}))
    try:
        with db.get_conn() as conn:
            api_key = llm.get_api_key(conn, expert["provider_type"])
        if round_number == 1:
            messages = [{"role": "user", "content": session["compiled_brief"]}]
        else:
            own = round1_answers.get(expert_id)
            peers = [a for eid, a in round1_answers.items() if eid != expert_id]
            messages = [{"role": "user", "content": prompts.round2_user_message(
                session["compiled_brief"], own["content"] if own else "(you gave no round-1 answer)", peers,
                synthesis=round1_synthesis,
            )}]
        provider = get_provider(expert["provider_type"])
        full_text: list[str] = []
        usage: dict = {}
        started = time.monotonic()
        async for event in provider.stream_text(
            api_key=api_key, model=expert["model_id"], system_prompt=system,
            messages=messages, max_tokens=config.EXPERT_MAX_TOKENS,
        ):
            if event["type"] == "chunk":
                full_text.append(event["text"])
                await queue.put(sse({"type": "chunk", "expert_id": expert_id, "round": round_number, "text": event["text"]}))
            elif event["type"] == "usage":
                usage = event["usage"]
        raw_output = "".join(full_text)
        stance, content = llm.split_stance(raw_output)
        _save_response(session["id"], expert_id, "expert", round_number, stance, content, "done")
        with db.get_conn() as conn:
            usage_out = llm.record_usage(
                conn, session_id=session["id"], expert_name=expert["name"],
                provider_type=expert["provider_type"], model_id=expert["model_id"],
                purpose=purpose, usage=usage,
            )
        session_logger.log_call(
            session["id"], purpose=purpose, provider=expert["provider_type"], model=expert["model_id"],
            system_prompt=system, messages=messages, output=raw_output, usage=usage,
            cost=usage_out["cost"], duration_ms=int((time.monotonic() - started) * 1000),
            expert_name=expert["name"], round_number=round_number,
        )
        await queue.put(sse({"type": "expert_done", "expert_id": expert_id, "round": round_number,
                             "stance": stance, "usage": usage_out}))
    except (ProviderError, HTTPException, Exception) as exc:
        detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
        _save_response(session["id"], expert_id, "expert", round_number, "", "", "failed", detail[:500])
        session_logger.log_call(
            session["id"], purpose=purpose, provider=expert["provider_type"], model=expert["model_id"],
            system_prompt=system, messages=messages, output="",
            usage={}, cost=0, duration_ms=0, expert_name=expert["name"], round_number=round_number,
            status="failed", error=detail[:500],
        )
        await queue.put(sse({"type": "expert_failed", "expert_id": expert_id, "round": round_number, "error": detail[:500]}))


def _round1_answers(conn, session_id: int) -> dict[int, dict]:
    rows = db.rows_to_dicts(conn.execute(
        """SELECT r.session_expert_id, r.content, se.name, se.title
           FROM responses r JOIN session_experts se ON se.id = r.session_expert_id
           WHERE r.session_id = ? AND r.kind = 'expert' AND r.round = 1 AND r.status = 'done'""",
        (session_id,),
    ).fetchall())
    return {row["session_expert_id"]: row for row in rows}


def _mark_round_done(conn, session_id: int, round_number: int) -> None:
    column = "round1_done" if round_number == 1 else "round2_done"
    conn.execute(f"UPDATE sessions SET {column} = 1 WHERE id = ?", (session_id,))


def _round1_synthesis(conn, session_id: int) -> str:
    """The round-1 synthesis text (stance + body), or '' if none was produced."""
    row = db.row_to_dict(conn.execute(
        """SELECT stance, content FROM responses
           WHERE session_id = ? AND kind = 'synthesis' AND round = 1 AND status = 'done'""",
        (session_id,)).fetchone())
    if not row:
        return ""
    stance = (row["stance"] or "").strip()
    body = (row["content"] or "").strip()
    return (f"STANCE: {stance}\n\n{body}" if stance else body).strip()


def validate_round(session_id: int, round_number: int,
                   only_expert_id: int | None = None) -> dict:
    """Validate preconditions BEFORE streaming starts. Raises HTTPException with
    a proper status code; returns the context dict consumed by run_round."""
    with db.get_conn() as conn:
        session = load_session(conn, session_id)
        assert_not_frozen(session)
        if not session["compiled_brief"]:
            raise HTTPException(status_code=400, detail="No approved brief. Complete the briefing first.")
        if round_number == 2:
            if not session["round2_enabled"]:
                raise HTTPException(status_code=400, detail="Round 2 is not enabled for this session.")
            if not session["round1_done"]:
                raise HTTPException(status_code=400, detail="Round 1 has not completed yet.")
        experts = load_session_experts(conn, session_id)
        round1_answers = _round1_answers(conn, session_id) if round_number == 2 else {}
        round1_synthesis = _round1_synthesis(conn, session_id) if round_number == 2 else ""
        if only_expert_id is not None:
            experts = [e for e in experts if e["id"] == only_expert_id]
            if not experts:
                raise HTTPException(status_code=404, detail="Expert not found in this session.")
        else:
            # Full-round run: skip experts that already have a 'done' answer for this
            # round, so resuming an interrupted run never re-spends completed calls.
            done_ids = {row["session_expert_id"] for row in conn.execute(
                """SELECT session_expert_id FROM responses
                   WHERE session_id = ? AND kind = 'expert' AND round = ? AND status = 'done'""",
                (session_id, round_number)).fetchall()}
            experts = [e for e in experts if e["id"] not in done_ids]
    return {"session": session, "experts": experts, "round1_answers": round1_answers,
            "round1_synthesis": round1_synthesis,
            "round_number": round_number, "only_expert_id": only_expert_id}


async def run_round(ctx: dict) -> AsyncIterator[str]:
    """Run a full round (or a single-expert retry) as a merged SSE stream."""
    session = ctx["session"]
    experts = ctx["experts"]
    round1_answers = ctx["round1_answers"]
    round1_synthesis = ctx.get("round1_synthesis", "")
    round_number = ctx["round_number"]
    only_expert_id = ctx["only_expert_id"]
    session_id = session["id"]

    queue: asyncio.Queue = asyncio.Queue()
    tasks = [asyncio.create_task(_run_one_expert(session, expert, round_number, round1_answers, queue, round1_synthesis))
             for expert in experts]

    pending = len(tasks)
    done_count = 0
    while done_count < pending:
        item = await queue.get()
        if '"type": "expert_done"' in item or '"type": "expert_failed"' in item:
            done_count += 1
        yield item
    await asyncio.gather(*tasks, return_exceptions=True)

    with db.get_conn() as conn:
        if only_expert_id is None:
            _mark_round_done(conn, session_id, round_number)
        status = refresh_status(conn, session_id)
    yield sse({"type": "stage_done", "stage": f"round{round_number}", "session_status": status})


def validate_synthesis(session_id: int, round_number: int) -> dict:
    """Validate synthesis preconditions BEFORE streaming; returns context for run_synthesis."""
    with db.get_conn() as conn:
        session = load_session(conn, session_id)
        assert_not_frozen(session)
        if not session["synthesis_enabled"]:
            raise HTTPException(status_code=400, detail="Synthesis is not enabled for this session.")
        round_done = session["round1_done"] if round_number == 1 else session["round2_done"]
        if not round_done:
            raise HTTPException(status_code=400, detail=f"Round {round_number} has not completed yet.")
        provider_type, model_id = llm.get_default_model(conn)
        api_key = llm.get_api_key(conn, provider_type)
        experts = load_session_experts(conn, session_id)
        answers = db.rows_to_dicts(conn.execute(
            """SELECT r.session_expert_id, r.content, r.status, se.name, se.title
               FROM responses r JOIN session_experts se ON se.id = r.session_expert_id
               WHERE r.session_id = ? AND r.kind = 'expert' AND r.round = ?""",
            (session_id, round_number),
        ).fetchall())
    done_answers = [a for a in answers if a["status"] == "done"]
    answered_ids = {a["session_expert_id"] for a in done_answers}
    missing = [e["name"] for e in experts if e["id"] not in answered_ids]
    if not done_answers:
        raise HTTPException(status_code=400, detail="No successful expert answers to synthesize.")
    return {"session": session, "round_number": round_number, "provider_type": provider_type,
            "model_id": model_id, "api_key": api_key, "done_answers": done_answers, "missing": missing}


async def run_synthesis(ctx: dict) -> AsyncIterator[str]:
    session = ctx["session"]
    round_number = ctx["round_number"]
    provider_type = ctx["provider_type"]
    model_id = ctx["model_id"]
    api_key = ctx["api_key"]
    done_answers = ctx["done_answers"]
    missing = ctx["missing"]
    session_id = session["id"]

    yield sse({"type": "synthesis_start", "round": round_number})
    provider = get_provider(provider_type)
    system = prompts.synthesis_system_prompt()
    user_message = prompts.synthesis_user_message(session["compiled_brief"], done_answers, round_number, missing)
    purpose = f"synthesis_r{round_number}"
    try:
        full_text: list[str] = []
        usage: dict = {}
        started = time.monotonic()
        async for event in provider.stream_text(
            api_key=api_key, model=model_id, system_prompt=system,
            messages=[{"role": "user", "content": user_message}],
            max_tokens=config.SYNTHESIS_MAX_TOKENS,
        ):
            if event["type"] == "chunk":
                full_text.append(event["text"])
                yield sse({"type": "chunk", "expert_id": None, "round": round_number, "text": event["text"]})
            elif event["type"] == "usage":
                usage = event["usage"]
        raw_output = "".join(full_text)
        stance, content = llm.split_stance(raw_output)
        _save_response(session_id, None, "synthesis", round_number, stance, content, "done")
        with db.get_conn() as conn:
            column = "synth1_done" if round_number == 1 else "synth2_done"
            conn.execute(f"UPDATE sessions SET {column} = 1 WHERE id = ?", (session_id,))
            usage_out = llm.record_usage(
                conn, session_id=session_id, expert_name="Manthan AI",
                provider_type=provider_type, model_id=model_id,
                purpose=purpose, usage=usage,
            )
            status = refresh_status(conn, session_id)
        session_logger.log_call(
            session_id, purpose=purpose, provider=provider_type, model=model_id,
            system_prompt=system, messages=[{"role": "user", "content": user_message}],
            output=raw_output, usage=usage, cost=usage_out["cost"],
            duration_ms=int((time.monotonic() - started) * 1000),
            expert_name="Manthan AI", round_number=round_number,
        )
        yield sse({"type": "synthesis_done", "round": round_number, "stance": stance, "usage": usage_out})
        yield sse({"type": "stage_done", "stage": f"synthesis{round_number}", "session_status": status})
    except (ProviderError, Exception) as exc:
        if isinstance(exc, HTTPException):
            raise
        _save_response(session_id, None, "synthesis", round_number, "", "", "failed", str(exc)[:500])
        session_logger.log_call(
            session_id, purpose=purpose, provider=provider_type, model=model_id,
            system_prompt=system, messages=[{"role": "user", "content": user_message}],
            output="", usage={}, cost=0, duration_ms=0, expert_name="Manthan AI",
            round_number=round_number, status="failed", error=str(exc)[:500],
        )
        yield sse({"type": "synthesis_failed", "round": round_number, "error": str(exc)[:500]})
