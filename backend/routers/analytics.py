from fastapi import APIRouter, HTTPException

import db

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90, "all": None}
GRANULARITIES = {"daily", "weekly", "monthly"}

# SQLite strftime grouping per granularity (over created_at)
_BUCKET_SQL = {
    "daily": "DATE(created_at)",
    "weekly": "DATE(created_at, 'weekday 0', '-6 days')",   # Monday of that week
    "monthly": "strftime('%Y-%m-01', created_at)",
}

_AGG = """SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
          SUM(cached_tokens) AS cached_tokens, SUM(cost) AS cost, COUNT(*) AS calls"""

# qualified variant for queries that join another table (avoids ambiguous columns)
_AGG_U = """SUM(u.input_tokens) AS input_tokens, SUM(u.output_tokens) AS output_tokens,
            SUM(u.cached_tokens) AS cached_tokens, SUM(u.cost) AS cost, COUNT(*) AS calls"""


@router.get("")
async def analytics(range: str = "30d", granularity: str = "daily", provider: str = "all"):
    if range not in RANGE_DAYS:
        raise HTTPException(status_code=400, detail="range must be 7d, 30d, 90d, or all.")
    if granularity not in GRANULARITIES:
        raise HTTPException(status_code=400, detail="granularity must be daily, weekly, or monthly.")

    # build a shared WHERE clause for the selected range + provider
    where, params = [], []
    days = RANGE_DAYS[range]
    if days is not None:
        where.append("created_at >= DATE('now', ?)")
        params.append(f"-{days - 1} days")
    if provider != "all":
        where.append("provider_type = ?")
        params.append(provider)
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    bucket = _BUCKET_SQL[granularity]

    with db.get_conn() as conn:
        totals = db.row_to_dict(conn.execute(
            f"""SELECT COALESCE(SUM(input_tokens),0) AS input_tokens,
                       COALESCE(SUM(output_tokens),0) AS output_tokens,
                       COALESCE(SUM(cached_tokens),0) AS cached_tokens,
                       COALESCE(SUM(cost),0) AS cost, COUNT(*) AS calls
                FROM usage_log{clause}""", params).fetchone())

        by_provider = db.rows_to_dicts(conn.execute(
            f"SELECT provider_type, {_AGG} FROM usage_log{clause} GROUP BY provider_type ORDER BY cost DESC", params).fetchall())
        by_model = db.rows_to_dicts(conn.execute(
            f"SELECT provider_type, model_id, {_AGG} FROM usage_log{clause} GROUP BY provider_type, model_id ORDER BY cost DESC", params).fetchall())
        by_expert = db.rows_to_dicts(conn.execute(
            f"SELECT expert_name, {_AGG} FROM usage_log{clause}{' AND' if clause else ' WHERE'} expert_name != '' GROUP BY expert_name ORDER BY cost DESC", params).fetchall())
        by_purpose = db.rows_to_dicts(conn.execute(
            f"SELECT purpose, {_AGG} FROM usage_log{clause} GROUP BY purpose ORDER BY cost DESC", params).fetchall())

        u_where = [w.replace("created_at", "u.created_at").replace("provider_type", "u.provider_type") for w in where]
        u_where.append("u.session_id IS NOT NULL")
        sess_clause = " WHERE " + " AND ".join(u_where)
        by_session = db.rows_to_dicts(conn.execute(
            f"""SELECT u.session_id, s.title, {_AGG_U}
                FROM usage_log u LEFT JOIN sessions s ON s.id = u.session_id{sess_clause}
                GROUP BY u.session_id ORDER BY cost DESC""", params).fetchall())

        series = db.rows_to_dicts(conn.execute(
            f"SELECT {bucket} AS bucket, {_AGG} FROM usage_log{clause} GROUP BY bucket ORDER BY bucket", params).fetchall())

    return {
        "status": "ok",
        "range": range, "granularity": granularity, "provider": provider,
        "totals": totals,
        "by_provider": by_provider, "by_model": by_model, "by_expert": by_expert,
        "by_purpose": by_purpose, "by_session": by_session,
        "series": series,
    }
