"""Shared LLM helpers: key lookup, default model, JSON calls with usage recording."""
from __future__ import annotations

import json

from fastapi import HTTPException

import db
from providers import PROVIDER_CATALOG, compute_cost, get_provider, model_exists


def get_api_key(conn, provider_type: str) -> str:
    row = conn.execute(
        "SELECT api_key_ciphertext, is_valid FROM provider_configs WHERE provider_type = ?",
        (provider_type,),
    ).fetchone()
    if not row or not row["is_valid"]:
        raise HTTPException(status_code=400, detail=f"No valid API key configured for provider '{provider_type}'.")
    return db.decrypt_secret(row["api_key_ciphertext"])


def get_default_model(conn) -> tuple[str, str]:
    provider_type = db.get_setting(conn, "default_provider_type")
    model_id = db.get_setting(conn, "default_model_id")
    if not provider_type or not model_id:
        raise HTTPException(status_code=400, detail="Default model not configured. Complete onboarding first.")
    return provider_type, model_id


def validate_model_choice(conn, provider_type: str, model_id: str) -> None:
    if provider_type not in PROVIDER_CATALOG:
        raise HTTPException(status_code=400, detail=f"Unknown provider '{provider_type}'.")
    if not model_exists(provider_type, model_id):
        raise HTTPException(status_code=400, detail=f"Model '{model_id}' is not in the {provider_type} catalog.")
    row = conn.execute(
        "SELECT is_valid FROM provider_configs WHERE provider_type = ?", (provider_type,)
    ).fetchone()
    if not row or not row["is_valid"]:
        raise HTTPException(status_code=400, detail=f"Provider '{provider_type}' has no valid API key.")


def record_usage(conn, *, session_id: int | None, expert_name: str, provider_type: str,
                 model_id: str, purpose: str, usage: dict) -> dict:
    input_tokens = int(usage.get("input_tokens", 0) or 0)
    output_tokens = int(usage.get("output_tokens", 0) or 0)
    cached_tokens = int(usage.get("cached_tokens", 0) or 0)
    cost = compute_cost(provider_type, model_id, input_tokens, output_tokens)
    conn.execute(
        """INSERT INTO usage_log
           (session_id, expert_name, provider_type, model_id, purpose, input_tokens, output_tokens, cached_tokens, cost)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (session_id, expert_name, provider_type, model_id, purpose,
         input_tokens, output_tokens, cached_tokens, cost),
    )
    return {"input_tokens": input_tokens, "output_tokens": output_tokens,
            "cached_tokens": cached_tokens, "cost": cost}


async def call_json(*, provider_type: str, model_id: str, api_key: str,
                    system_prompt: str, messages: list[dict], max_tokens: int,
                    log_session_id: int | None = None, log_purpose: str = "",
                    log_expert_name: str = "Manthan AI") -> tuple[dict, dict]:
    """Run a structured call; returns (parsed_json, usage). Raises HTTPException on bad JSON.

    If log_purpose is set, the full call is written to the session log (or manthan-ai.jsonl
    when log_session_id is None)."""
    import time
    from providers import compute_cost
    from services import session_logger

    provider = get_provider(provider_type)
    started = time.monotonic()
    result = await provider.generate_json(
        api_key=api_key, model=model_id, system_prompt=system_prompt,
        messages=messages, max_tokens=max_tokens,
    )
    text = result["text"].strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    usage = result.get("usage", {})
    if log_purpose:
        session_logger.log_call(
            log_session_id, purpose=log_purpose, provider=provider_type, model=model_id,
            system_prompt=system_prompt, messages=messages, output=result["text"], usage=usage,
            cost=compute_cost(provider_type, model_id, usage.get("input_tokens", 0), usage.get("output_tokens", 0)),
            duration_ms=int((time.monotonic() - started) * 1000), expert_name=log_expert_name,
        )
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="The model returned malformed JSON. Please try again.") from exc
    return parsed, usage


def split_stance(content: str) -> tuple[str, str]:
    """Extract the 'STANCE: ...' line from a response.

    Models sometimes wrap it in markdown ('## STANCE:', '**STANCE:** ...') or put a
    heading above it — scan the first few non-empty lines and strip decoration."""
    content = content.strip()
    for line in [l for l in content.splitlines() if l.strip()][:5]:
        cleaned = line.strip().lstrip("#*-• ").replace("**", "").strip()
        if cleaned.upper().startswith("STANCE:"):
            return cleaned[7:].strip().rstrip("*").strip(), content
    return "", content
