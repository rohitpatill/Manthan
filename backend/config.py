import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _load_env_file() -> dict[str, str]:
    env: dict[str, str] = {}
    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return env
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip("'").strip('"')
    return env


_ENV_FILE = _load_env_file()

ENV_API_KEYS = {
    "openai": _ENV_FILE.get("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY") or "",
    "gemini": _ENV_FILE.get("GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY") or "",
    "anthropic": _ENV_FILE.get("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_API_KEY") or "",
}
# Obvious placeholders are ignored so startup doesn't waste validation calls.
ENV_API_KEYS = {
    p: ("" if "REPLACE-ME" in k.upper() else k) for p, k in ENV_API_KEYS.items()
}
DB_PATH = BASE_DIR / "manthan.db"
UPLOADS_DIR = BASE_DIR / "uploads"
AVATARS_DIR = UPLOADS_DIR / "avatars"
AVATARS_DIR.mkdir(parents=True, exist_ok=True)

# When MANTHAN_MOCK=1, all provider calls are served by a deterministic mock
# (used by the test suite — no real API keys or network needed).
MOCK_MODE = os.getenv("MANTHAN_MOCK") == "1"

# Word cap turned into a token budget for expert answers (~500 words).
EXPERT_MAX_TOKENS = 900
SYNTHESIS_MAX_TOKENS = 1500
INTAKE_MAX_TOKENS = 800
BUILDER_MAX_TOKENS = 1200

MAX_EXPERTS_PER_SESSION = 10
MIN_EXPERTS_PER_SESSION = 1
