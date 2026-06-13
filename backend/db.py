import json
import re
import sqlite3
import sys
from base64 import b64decode, b64encode
from contextlib import contextmanager
from typing import Any

import config


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_conn():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS provider_configs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider_type TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                api_key_ciphertext TEXT NOT NULL DEFAULT '',
                masked_key TEXT NOT NULL DEFAULT '',
                is_valid INTEGER NOT NULL DEFAULT 0,
                validation_error TEXT NOT NULL DEFAULT '',
                validated_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS experts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                persona TEXT NOT NULL DEFAULT '',
                avatar_url TEXT NOT NULL DEFAULT '',
                provider_type TEXT NOT NULL,
                model_id TEXT NOT NULL,
                is_starter INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'briefing',
                round2_enabled INTEGER NOT NULL DEFAULT 0,
                synthesis_enabled INTEGER NOT NULL DEFAULT 1,
                compiled_brief TEXT NOT NULL DEFAULT '',
                round1_done INTEGER NOT NULL DEFAULT 0,
                round2_done INTEGER NOT NULL DEFAULT 0,
                synth1_done INTEGER NOT NULL DEFAULT 0,
                synth2_done INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS session_experts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                expert_id INTEGER REFERENCES experts(id) ON DELETE SET NULL,
                name TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                persona TEXT NOT NULL DEFAULT '',
                avatar_url TEXT NOT NULL DEFAULT '',
                provider_type TEXT NOT NULL,
                model_id TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS intake_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                session_expert_id INTEGER REFERENCES session_experts(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,              -- 'expert' | 'synthesis'
                round INTEGER NOT NULL DEFAULT 1,
                stance TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'done',  -- 'done' | 'failed'
                error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(session_id, session_expert_id, kind, round)
            );

            CREATE TABLE IF NOT EXISTS usage_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
                expert_name TEXT NOT NULL DEFAULT '',
                provider_type TEXT NOT NULL,
                model_id TEXT NOT NULL,
                purpose TEXT NOT NULL,           -- intake | builder | suggest | expert_r1 | expert_r2 | synthesis_r1 | synthesis_r2
                input_tokens INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                cached_tokens INTEGER NOT NULL DEFAULT 0,
                cost REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        provider_columns = {row["name"] for row in conn.execute("PRAGMA table_info(provider_configs)").fetchall()}
        if "masked_key" not in provider_columns:
            conn.execute("ALTER TABLE provider_configs ADD COLUMN masked_key TEXT NOT NULL DEFAULT ''")


def mask_key(key: str) -> str:
    key = (key or "").strip()
    if len(key) < 8:
        return key[:2] + "…"
    return key[:6] + "…" + key[-4:]


# --- secrets (Windows DPAPI, base64 fallback elsewhere) ---

if sys.platform == "win32":
    from ctypes import POINTER, Structure, byref, c_char, cast, create_string_buffer, string_at, windll
    from ctypes.wintypes import DWORD

    class DATA_BLOB(Structure):
        _fields_ = [("cbData", DWORD), ("pbData", POINTER(c_char))]

    def _dpapi(value: bytes, encrypt: bool) -> bytes:
        buffer = create_string_buffer(value, len(value))
        in_blob = DATA_BLOB(len(value), cast(buffer, POINTER(c_char)))
        out_blob = DATA_BLOB()
        fn = windll.crypt32.CryptProtectData if encrypt else windll.crypt32.CryptUnprotectData
        if not fn(byref(in_blob), None, None, None, None, 0, byref(out_blob)):
            raise OSError("DPAPI call failed")
        try:
            return string_at(out_blob.pbData, out_blob.cbData)
        finally:
            windll.kernel32.LocalFree(out_blob.pbData)


def encrypt_secret(value: str) -> str:
    if not value:
        return ""
    if sys.platform == "win32":
        return b64encode(_dpapi(value.encode("utf-8"), True)).decode("ascii")
    return b64encode(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> str:
    if not value:
        return ""
    if sys.platform == "win32":
        return _dpapi(b64decode(value.encode("ascii")), False).decode("utf-8")
    return b64decode(value.encode("ascii")).decode("utf-8")


# --- helpers ---

def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def rows_to_dicts(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]


def get_setting(conn, key: str, default: str = "") -> str:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(conn, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def loads(value: str | None, default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default
