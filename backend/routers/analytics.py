from fastapi import APIRouter

import db

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("")
async def analytics():
    with db.get_conn() as conn:
        totals = db.row_to_dict(conn.execute(
            """SELECT COALESCE(SUM(input_tokens),0) AS input_tokens,
                      COALESCE(SUM(output_tokens),0) AS output_tokens,
                      COALESCE(SUM(cached_tokens),0) AS cached_tokens,
                      COALESCE(SUM(cost),0) AS cost,
                      COUNT(*) AS calls
               FROM usage_log""").fetchone())
        by_model = db.rows_to_dicts(conn.execute(
            """SELECT provider_type, model_id,
                      SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
                      SUM(cached_tokens) AS cached_tokens, SUM(cost) AS cost, COUNT(*) AS calls
               FROM usage_log GROUP BY provider_type, model_id ORDER BY cost DESC""").fetchall())
        by_provider = db.rows_to_dicts(conn.execute(
            """SELECT provider_type,
                      SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
                      SUM(cached_tokens) AS cached_tokens, SUM(cost) AS cost, COUNT(*) AS calls
               FROM usage_log GROUP BY provider_type ORDER BY cost DESC""").fetchall())
        by_expert = db.rows_to_dicts(conn.execute(
            """SELECT expert_name,
                      SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
                      SUM(cached_tokens) AS cached_tokens, SUM(cost) AS cost, COUNT(*) AS calls
               FROM usage_log WHERE expert_name != '' GROUP BY expert_name ORDER BY cost DESC""").fetchall())
        by_session = db.rows_to_dicts(conn.execute(
            """SELECT u.session_id, s.title,
                      SUM(u.input_tokens) AS input_tokens, SUM(u.output_tokens) AS output_tokens,
                      SUM(u.cached_tokens) AS cached_tokens, SUM(u.cost) AS cost, COUNT(*) AS calls
               FROM usage_log u LEFT JOIN sessions s ON s.id = u.session_id
               WHERE u.session_id IS NOT NULL
               GROUP BY u.session_id ORDER BY cost DESC""").fetchall())
        by_purpose = db.rows_to_dicts(conn.execute(
            """SELECT purpose,
                      SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
                      SUM(cached_tokens) AS cached_tokens, SUM(cost) AS cost, COUNT(*) AS calls
               FROM usage_log GROUP BY purpose ORDER BY cost DESC""").fetchall())
        by_day = db.rows_to_dicts(conn.execute(
            """SELECT DATE(created_at) AS day,
                      SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
                      SUM(cached_tokens) AS cached_tokens, SUM(cost) AS cost, COUNT(*) AS calls
               FROM usage_log GROUP BY DATE(created_at) ORDER BY day DESC LIMIT 90""").fetchall())
    return {"status": "ok", "totals": totals, "by_model": by_model, "by_provider": by_provider,
            "by_expert": by_expert, "by_session": by_session, "by_purpose": by_purpose, "by_day": by_day}
