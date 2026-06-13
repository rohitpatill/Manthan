from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

import config
import db
from routers import analytics, experts, providers, sessions, uploads

app = FastAPI(title="Manthan API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(config.UPLOADS_DIR)), name="uploads")

app.include_router(providers.router)
app.include_router(experts.router)
app.include_router(sessions.router)
app.include_router(analytics.router)
app.include_router(uploads.router)


STARTER_EXPERTS = [
    ("Dr. Elena Vasquez", "Scientist — evidence-first empiricist",
     "Dr. Elena Vasquez is a research scientist with two decades across molecular biology and "
     "systems thinking. She evaluates every claim against evidence, demands falsifiability, and "
     "is openly skeptical of intuition-driven arguments. She values rigor over speed, quantifies "
     "uncertainty explicitly, and frames problems as testable hypotheses with measurable outcomes."),
    ("Prof. Daniel Okafor", "Ethicist — moral philosophy and consequences",
     "Prof. Daniel Okafor teaches applied ethics. He weighs every decision through multiple moral "
     "frameworks — consequentialist, deontological, virtue ethics — and surfaces who benefits, who "
     "bears the cost, and which values are being traded away silently. He is calm, precise, and "
     "unafraid to call a popular option morally indefensible."),
    ("Meera Krishnan", "Economist — incentives and second-order effects",
     "Meera Krishnan is a macro-and-behavioral economist. She instinctively maps incentives, "
     "opportunity costs, and second-order market effects everyone else misses. She thinks in "
     "trade-offs, distrusts plans that assume people will act against their incentives, and always "
     "asks what happens at scale and over time."),
    ("Col. James Hartmann", "Strategist — risk, contingency and execution",
     "Col. James Hartmann (ret.) spent a career in military strategy and crisis operations. He "
     "thinks in scenarios, branches and contingencies: what is the objective, what can go wrong, "
     "what is the fallback. He is blunt, allergic to wishful thinking, and insists every plan name "
     "its single point of failure and its exit conditions."),
    ("Dr. Sofia Lindqvist", "Psychologist — human behavior and motivation",
     "Dr. Sofia Lindqvist is a clinical and organizational psychologist. She reads the human layer "
     "of every problem: motivation, fear, bias, group dynamics, and how people actually behave "
     "versus how plans assume they behave. She is warm but incisive, and flags emotional and "
     "relational consequences others treat as noise."),
    ("Rajan Mehta", "Engineer — systems, feasibility and failure modes",
     "Rajan Mehta is a principal engineer who has built and broken large systems. He decomposes "
     "problems into components, interfaces and constraints, estimates feasibility honestly, and "
     "hunts for failure modes and hidden complexity. He values simple robust designs and will say "
     "plainly when something is harder than it sounds."),
]


def seed_starter_experts() -> None:
    """Seed starter experts once a provider exists; idempotent."""
    with db.get_conn() as conn:
        if conn.execute("SELECT COUNT(*) AS c FROM experts").fetchone()["c"] > 0:
            return
        provider = conn.execute(
            "SELECT provider_type FROM provider_configs WHERE is_valid = 1 ORDER BY id LIMIT 1").fetchone()
        if not provider:
            return
        provider_type = provider["provider_type"]
        default_models = {"openai": "gpt-4o-mini", "gemini": "gemini-2.5-flash", "anthropic": "claude-sonnet-4.6"}
        model_id = default_models.get(provider_type, "gpt-4o-mini")
        for name, title, persona in STARTER_EXPERTS:
            conn.execute(
                """INSERT INTO experts (name, title, persona, provider_type, model_id, is_starter)
                   VALUES (?, ?, ?, ?, ?, 1)""",
                (name, title, persona, provider_type, model_id),
            )


db.init_db()


async def import_env_keys() -> None:
    """Auto-import API keys from .env on startup: validate each and store it,
    so the user can just drop keys in .env instead of using the Settings UI."""
    from providers import PROVIDER_CATALOG, ProviderError, get_provider
    for provider_type, api_key in config.ENV_API_KEYS.items():
        if not api_key:
            continue
        with db.get_conn() as conn:
            row = conn.execute(
                "SELECT is_valid FROM provider_configs WHERE provider_type = ?", (provider_type,)
            ).fetchone()
            if row and row["is_valid"]:
                continue  # already configured and valid — don't overwrite
        display_name = PROVIDER_CATALOG[provider_type]["name"]
        try:
            await get_provider(provider_type).validate_api_key(api_key)
            is_valid, error = 1, ""
            print(f"[env-keys] {display_name}: key validated OK")
        except ProviderError as exc:
            is_valid, error = 0, str(exc)[:300]
            print(f"[env-keys] {display_name}: validation FAILED — {error}")
        except Exception as exc:
            is_valid, error = 0, f"validation error: {exc}"[:300]
            print(f"[env-keys] {display_name}: {error}")
        with db.get_conn() as conn:
            conn.execute(
                """INSERT INTO provider_configs
                   (provider_type, display_name, api_key_ciphertext, masked_key, is_valid, validation_error, validated_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                   ON CONFLICT(provider_type) DO UPDATE SET
                     api_key_ciphertext = excluded.api_key_ciphertext, masked_key = excluded.masked_key,
                     is_valid = excluded.is_valid, validation_error = excluded.validation_error,
                     validated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP""",
                (provider_type, display_name, db.encrypt_secret(api_key), db.mask_key(api_key), is_valid, error),
            )


@app.on_event("startup")
async def startup() -> None:
    db.init_db()
    await import_env_keys()
    seed_starter_experts()


@app.post("/api/seed-starters")
async def seed_starters():
    """Called by the frontend right after onboarding to populate starter experts."""
    seed_starter_experts()
    with db.get_conn() as conn:
        experts_list = db.rows_to_dicts(conn.execute("SELECT * FROM experts ORDER BY id").fetchall())
    return {"status": "ok", "experts": experts_list}


@app.post("/api/admin/clear-data")
async def clear_data(keep_keys: bool = True, sessions: bool = True,
                     experts: bool = True, analytics: bool = True):
    """Selectively wipe local data. The three flags (sessions, experts, analytics) are
    independent — the session_experts snapshot means deleting experts never corrupts
    existing/frozen sessions. When keep_keys is False this is the 'start from scratch'
    action: everything is wiped (all flags forced on) plus provider keys and settings.

    - sessions  → sessions (+ cascaded responses/intake/session_experts)
    - analytics → usage_log (per-LLM-call metering that powers the dashboard)
    - experts   → the reusable expert library (frozen sessions keep their own copy)
    """
    if not keep_keys:
        sessions = experts = analytics = True
    with db.get_conn() as conn:
        if sessions:
            conn.execute("DELETE FROM sessions")
        if analytics:
            conn.execute("DELETE FROM usage_log")
        if experts:
            conn.execute("DELETE FROM experts")
        if not keep_keys:
            conn.execute("DELETE FROM provider_configs")
            conn.execute("DELETE FROM settings")
    return {"status": "ok"}


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "Manthan", "mock_mode": config.MOCK_MODE}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
