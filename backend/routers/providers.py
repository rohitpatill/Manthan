from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import db
from providers import PROVIDER_CATALOG, ProviderError, get_provider, model_exists

router = APIRouter(prefix="/api/providers", tags=["providers"])


class ProviderKeyIn(BaseModel):
    provider_type: str
    api_key: str


class DefaultModelIn(BaseModel):
    provider_type: str
    model_id: str


def _provider_list(conn) -> list[dict]:
    rows = db.rows_to_dicts(conn.execute(
        """SELECT id, provider_type, display_name, masked_key, is_valid, validation_error, validated_at
           FROM provider_configs ORDER BY provider_type""").fetchall())
    return rows


@router.get("")
async def list_providers():
    with db.get_conn() as conn:
        providers = _provider_list(conn)
        default_model = {
            "provider_type": db.get_setting(conn, "default_provider_type"),
            "model_id": db.get_setting(conn, "default_model_id"),
        }
    return {"status": "ok", "providers": providers, "catalog": PROVIDER_CATALOG, "default_model": default_model}


@router.post("")
async def save_provider_key(payload: ProviderKeyIn):
    if payload.provider_type not in PROVIDER_CATALOG:
        raise HTTPException(status_code=400, detail="Unsupported provider type.")
    key = payload.api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="API key cannot be empty.")
    provider = get_provider(payload.provider_type)
    try:
        await provider.validate_api_key(key)
    except ProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    display_name = PROVIDER_CATALOG[payload.provider_type]["name"]
    ciphertext = db.encrypt_secret(key)
    with db.get_conn() as conn:
        conn.execute(
            """INSERT INTO provider_configs
               (provider_type, display_name, api_key_ciphertext, masked_key, is_valid, validation_error, validated_at, updated_at)
               VALUES (?, ?, ?, ?, 1, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
               ON CONFLICT(provider_type) DO UPDATE SET
                 api_key_ciphertext = excluded.api_key_ciphertext, masked_key = excluded.masked_key,
                 is_valid = 1, validation_error = '', validated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP""",
            (payload.provider_type, display_name, ciphertext, db.mask_key(key)),
        )
        providers = _provider_list(conn)
    return {"status": "ok", "message": f"{display_name} key validated.", "providers": providers}


@router.delete("/{provider_type}")
async def delete_provider_key(provider_type: str):
    with db.get_conn() as conn:
        row = conn.execute("SELECT id FROM provider_configs WHERE provider_type = ?", (provider_type,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Provider not configured.")
        conn.execute("DELETE FROM provider_configs WHERE provider_type = ?", (provider_type,))
        # Flag default model if it relied on this provider
        if db.get_setting(conn, "default_provider_type") == provider_type:
            db.set_setting(conn, "default_provider_type", "")
            db.set_setting(conn, "default_model_id", "")
        affected = db.rows_to_dicts(conn.execute(
            "SELECT id, name FROM experts WHERE provider_type = ?", (provider_type,)).fetchall())
    return {"status": "ok", "experts_needing_reassignment": affected}


@router.put("/default-model")
async def set_default_model(payload: DefaultModelIn):
    if payload.provider_type not in PROVIDER_CATALOG or not model_exists(payload.provider_type, payload.model_id):
        raise HTTPException(status_code=400, detail="Unknown provider/model combination.")
    with db.get_conn() as conn:
        row = conn.execute(
            "SELECT is_valid FROM provider_configs WHERE provider_type = ?", (payload.provider_type,)
        ).fetchone()
        if not row or not row["is_valid"]:
            raise HTTPException(status_code=400, detail=f"Provider '{payload.provider_type}' has no valid API key.")
        db.set_setting(conn, "default_provider_type", payload.provider_type)
        db.set_setting(conn, "default_model_id", payload.model_id)
    return {"status": "ok"}
