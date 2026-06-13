"""Per-session LLM call logging for full traceability.

Each session gets two append-only files under backend/logs/:
  - session_<id>.md     human-readable timeline
  - session_<id>.jsonl  one raw JSON record per LLM call (exact prompts/outputs)

Files are appended across resumes (even days later), keyed by session id, so a
deliberation continued later lands in the same files. Calls not tied to a session
(expert builder, panel suggestions) go to logs/manthan-ai.jsonl.

Logs are gitignored and local-only.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import config


def _logs_dir() -> Path:
    # config.LOGS_DIR lets the test suite redirect logs into tests/tmp
    d = Path(getattr(config, "LOGS_DIR", config.BASE_DIR / "logs"))
    d.mkdir(parents=True, exist_ok=True)
    return d


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _append(path: Path, text: str) -> None:
    with open(path, "a", encoding="utf-8") as f:
        f.write(text)


def log_session_event(session_id: int, label: str, detail: str = "") -> None:
    """Write a boundary marker (session start, round start, dispatch, freeze…) to the .md timeline."""
    md = _logs_dir() / f"session_{session_id}.md"
    if not md.exists():
        _append(md, f"# Manthan session {session_id} — log\n\n_Started {_now()}_\n")
    line = f"\n## [{_now()}] {label}\n"
    if detail:
        line += f"\n{detail}\n"
    _append(md, line)


def log_call(session_id: int | None, *, purpose: str, provider: str, model: str,
             system_prompt: str, messages: list[dict], output: str,
             usage: dict, cost: float, duration_ms: int,
             expert_name: str = "", round_number: int | None = None,
             status: str = "done", error: str = "") -> None:
    """Append one LLM call (full prompts + output) to the session files (or manthan-ai.jsonl)."""
    record = {
        "ts": _now(),
        "session_id": session_id,
        "purpose": purpose,
        "expert_name": expert_name,
        "round": round_number,
        "provider": provider,
        "model": model,
        "status": status,
        "error": error,
        "duration_ms": duration_ms,
        "usage": usage,
        "cost": cost,
        "system_prompt": system_prompt,
        "input_messages": messages,
        "output": output,
    }

    if session_id is None:
        _append(_logs_dir() / "manthan-ai.jsonl", json.dumps(record, ensure_ascii=False) + "\n")
        return

    _append(_logs_dir() / f"session_{session_id}.jsonl", json.dumps(record, ensure_ascii=False) + "\n")

    # readable mirror
    md = _logs_dir() / f"session_{session_id}.md"
    if not md.exists():
        _append(md, f"# Manthan session {session_id} — log\n\n_Started {_now()}_\n")
    who = expert_name or "Manthan AI"
    head = f"\n### [{_now()}] {purpose}" + (f" · round {round_number}" if round_number else "") + f" — {who} ({model})\n"
    meta = (f"\n- status: **{status}**"
            f"{'  · error: ' + error if error else ''}"
            f"\n- tokens: in {usage.get('input_tokens', 0)} · out {usage.get('output_tokens', 0)} · cached {usage.get('cached_tokens', 0)}"
            f"\n- cost: ${cost:.6f} · {duration_ms} ms\n")
    sys_block = f"\n**System prompt:**\n```\n{system_prompt.strip()}\n```\n"
    in_block = "\n**Input:**\n"
    for m in messages:
        in_block += f"\n_({m.get('role', 'user')})_\n```\n{str(m.get('content', '')).strip()}\n```\n"
    out_block = f"\n**Output:**\n```\n{(output or '').strip()}\n```\n\n---\n"
    _append(md, head + meta + sys_block + in_block + out_block)
