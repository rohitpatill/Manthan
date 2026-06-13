"""Manthan live end-to-end test.

Runs the COMPLETE product flow against the actual app and verifies every
database entry after each call. Works in two modes:

  Mock mode (no keys needed):   set MANTHAN_MOCK=1
      PowerShell:  $env:MANTHAN_MOCK="1"; python tests/live_test.py
  Live mode (real API spend!):  put real keys in backend/.env, then
      PowerShell:  python tests/live_test.py

In live mode it uses small/cheap models for experts. Expect a few cents of usage.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config  # noqa: E402

LIVE = not config.MOCK_MODE
# isolated database for this run (throwaway location under tests/tmp/)
_TMP = config.BASE_DIR / "tests" / "tmp"
_TMP.mkdir(parents=True, exist_ok=True)
config.DB_PATH = _TMP / ("live_manthan.db" if LIVE else "mocklive_manthan.db")
if config.DB_PATH.exists():
    config.DB_PATH.unlink()

from fastapi.testclient import TestClient  # noqa: E402

import db  # noqa: E402
from main import app  # noqa: E402

PASS = 0
FAIL = 0

CHEAP_MODELS = {"openai": "gpt-4o-mini", "gemini": "gemini-3.1-flash-lite-preview", "anthropic": "claude-haiku-4.5"}


def check(label: str, condition: bool, detail: str = ""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  [PASS] {label}")
    else:
        FAIL += 1
        print(f"  [FAIL] {label}  {detail}")


def q(sql: str, params=()) -> list[dict]:
    with db.get_conn() as conn:
        return db.rows_to_dicts(conn.execute(sql, params).fetchall())


def collect_sse(response) -> list[dict]:
    events = []
    for line in response.iter_lines():
        if line.startswith("data:"):
            events.append(json.loads(line[5:].strip()))
    return events


def main():
    with TestClient(app) as client:   # context manager triggers startup (env key import)
        print(f"\n=== Manthan live test ({'LIVE — real API calls' if LIVE else 'MOCK mode'}) ===\n")

        # ---- 1. health + providers ----
        print("[1] Health & provider keys")
        r = client.get("/api/health")
        check("health endpoint", r.status_code == 200 and r.json()["status"] == "ok")
        if not LIVE:
            for p in ("openai", "gemini", "anthropic"):
                client.post("/api/providers", json={"provider_type": p, "api_key": f"good-{p}"})
        providers = client.get("/api/providers").json()["providers"]
        valid = [p["provider_type"] for p in providers if p["is_valid"]]
        print(f"      valid providers: {valid or 'NONE'}")
        if not valid:
            print("\n  !! No valid provider keys. Put real keys in backend/.env and rerun.")
            print("     (placeholder REPLACE-ME keys are ignored by design)\n")
            return
        db_rows = q("SELECT provider_type, is_valid, api_key_ciphertext FROM provider_configs")
        check("keys stored encrypted in DB",
              all(row["api_key_ciphertext"] and "sk-" not in row["api_key_ciphertext"] for row in db_rows))

        # ---- 2. default model ----
        print("[2] Default model")
        default_provider = valid[0]
        default_model = CHEAP_MODELS[default_provider]
        r = client.put("/api/providers/default-model",
                       json={"provider_type": default_provider, "model_id": default_model})
        check("set default model", r.status_code == 200)
        check("default model persisted in settings table",
              q("SELECT value FROM settings WHERE key='default_model_id'")[0]["value"] == default_model)

        # ---- 3. experts ----
        print("[3] Experts (manual create x3 + DB verification)")
        personas = [
            ("Dr. Asha Rao", "Neurologist", "A precise clinical neurologist who reasons from evidence, "
             "flags medical risk, and quantifies uncertainty before recommending anything."),
            ("Viktor Brandt", "Macro-Economist", "A blunt macro-economist obsessed with incentives, "
             "second-order effects and what happens at scale over a decade."),
            ("Sister Lucia Mendes", "Ethicist", "A compassionate but rigorous ethicist who weighs harms, "
             "consent and dignity, and names moral trade-offs others avoid."),
        ]
        expert_ids = []
        for i, (name, title, persona) in enumerate(personas):
            provider = valid[i % len(valid)]
            r = client.post("/api/experts", json={
                "name": name, "title": title, "persona": persona,
                "provider_type": provider, "model_id": CHEAP_MODELS[provider]})
            check(f"create expert: {name} ({provider})", r.status_code == 200, r.text[:200])
            if r.status_code == 200:
                expert_ids.append(r.json()["expert"]["id"])
        rows = q("SELECT id, name, persona, provider_type, model_id FROM experts")
        check("3 experts in DB with full personas",
              len([x for x in rows if x["id"] in expert_ids]) == 3 and all(len(x["persona"]) > 50 for x in rows if x["id"] in expert_ids))

        print("[3b] Expert builder via Manthan AI")
        r = client.post("/api/experts/builder/chat", json={
            "messages": [{"role": "user", "content": "Build me a veteran startup founder who has failed twice "
                          "and succeeded once, brutally honest about execution risk."}]})
        check("builder chat returns draft", r.status_code == 200, r.text[:200])
        if r.status_code == 200:
            body = r.json()
            print(f"      ready={body['ready']} expert={json.dumps(body.get('expert'))[:140]}...")
            check("builder usage logged in DB", len(q("SELECT * FROM usage_log WHERE purpose='builder'")) >= 1)

        # ---- 4. session + intake ----
        print("[4] Council session + intake chat")
        r = client.post("/api/sessions", json={
            "title": "Four-day work week decision", "expert_ids": expert_ids,
            "round2_enabled": True, "synthesis_enabled": True})
        check("create session", r.status_code == 200, r.text[:200])
        sid = r.json()["session"]["id"]
        check("session_experts snapshot in DB (3 rows, personas copied)",
              len(q("SELECT * FROM session_experts WHERE session_id=? AND persona != ''", (sid,))) == 3)

        r = client.post(f"/api/sessions/{sid}/intake", json={"message": "hi"})
        check("intake handles thin input without dispatching",
              r.status_code == 200 and r.json()["ready_to_dispatch"] is False, r.text[:200])
        print(f"      Manthan AI: {r.json()['assistant_message'][:120]}")

        full_problem = ("READY. Our 40-person software company is deciding whether to switch permanently "
                        "to a 4-day work week at full pay. Revenue is stable, clients are in 3 time zones, "
                        "two senior engineers threaten to quit if we don't, finance worries about delivery "
                        "capacity. Should we do it, and if yes how should we roll it out? "
                        "We want a clear recommendation with risks.")
        r = client.post(f"/api/sessions/{sid}/intake", json={"message": full_problem})
        body = r.json()
        check("intake compiles brief when ready", body.get("ready_to_dispatch") is True and len(body.get("compiled_brief", "")) > 50, str(body)[:300])
        brief = body["compiled_brief"]
        print(f"      brief: {brief[:140]}...")
        check("intake messages stored (4 rows: 2 user + 2 assistant)",
              len(q("SELECT * FROM intake_messages WHERE session_id=?", (sid,))) == 4)
        check("intake usage logged", len(q("SELECT * FROM usage_log WHERE session_id=? AND purpose='intake'", (sid,))) == 2)

        # ---- 5. round 1 dispatch (streaming) ----
        print("[5] Round 1 — parallel streaming dispatch")
        with client.stream("POST", f"/api/sessions/{sid}/dispatch", json={"brief": brief}) as resp:
            check("dispatch returns SSE", resp.status_code == 200)
            events = collect_sse(resp)
        types = [e["type"] for e in events]
        done = [e for e in events if e["type"] == "expert_done"]
        failed = [e for e in events if e["type"] == "expert_failed"]
        check("all 3 experts completed (or failures reported per-expert)",
              len(done) + len(failed) == 3, f"done={len(done)} failed={len(failed)}")
        check("streaming chunks were emitted", types.count("chunk") > 3)
        for e in failed:
            print(f"      !! expert {e['expert_id']} failed: {e['error'][:160]}")
        for e in done:
            print(f"      expert {e['expert_id']} stance: {e['stance'][:110]}")
        r1_rows = q("SELECT * FROM responses WHERE session_id=? AND kind='expert' AND round=1", (sid,))
        check("round-1 responses persisted in DB", len(r1_rows) == 3)
        check("done responses have stance + content",
              all((x["stance"] and len(x["content"]) > 50) for x in r1_rows if x["status"] == "done"))
        usage_rows = q("SELECT * FROM usage_log WHERE session_id=? AND purpose='expert_r1'", (sid,))
        check("per-expert usage rows with cost", len(usage_rows) == len(done) and all(u["cost"] >= 0 for u in usage_rows))

        # ---- 6. synthesis round 1 ----
        print("[6] Synthesis (round 1)")
        with client.stream("POST", f"/api/sessions/{sid}/synthesize?round=1") as resp:
            sevents = collect_sse(resp)
        sdone = [e for e in sevents if e["type"] == "synthesis_done"]
        check("synthesis completed", len(sdone) == 1, str(sevents[-1])[:200])
        srow = q("SELECT * FROM responses WHERE session_id=? AND kind='synthesis' AND round=1", (sid,))
        check("synthesis persisted with content", len(srow) == 1 and len(srow[0]["content"]) > 100)
        print(f"      synthesis stance: {srow[0]['stance'][:120]}")

        # ---- 7. round 2 debate ----
        print("[7] Round 2 — debate (each expert sees peers)")
        with client.stream("POST", f"/api/sessions/{sid}/round2") as resp:
            events2 = collect_sse(resp)
        done2 = [e for e in events2 if e["type"] == "expert_done"]
        check("round 2 completed for all experts", len(done2) + len([e for e in events2 if e["type"] == "expert_failed"]) == 3)
        r2_rows = q("SELECT * FROM responses WHERE session_id=? AND kind='expert' AND round=2 AND status='done'", (sid,))
        check("round-2 responses persisted", len(r2_rows) == len(done2))

        # ---- 8. final synthesis + freeze ----
        print("[8] Final synthesis + freeze")
        with client.stream("POST", f"/api/sessions/{sid}/synthesize?round=2") as resp:
            sevents2 = collect_sse(resp)
        check("final synthesis done", any(e["type"] == "synthesis_done" for e in sevents2))
        check("session frozen", sevents2[-1].get("session_status") == "frozen", str(sevents2[-1]))
        r = client.post(f"/api/sessions/{sid}/intake", json={"message": "one more thing"})
        check("frozen session rejects further intake (409)", r.status_code == 409)
        detail = client.get(f"/api/sessions/{sid}").json()
        check("frozen session full record retrievable",
              detail["session"]["status"] == "frozen"
              and len(detail["intake_messages"]) == 4
              and len([x for x in detail["responses"] if x["kind"] == "synthesis"]) == 2)
        check("session usage totals > 0", detail["usage_totals"]["output_tokens"] > 0)
        print(f"      session cost: ${detail['usage_totals']['cost']:.6f} | "
              f"in={detail['usage_totals']['input_tokens']} out={detail['usage_totals']['output_tokens']} "
              f"cached={detail['usage_totals']['cached_tokens']}")

        # ---- 9. expert suggestion ----
        print("[9] Expert suggestion")
        r = client.post("/api/experts/suggest", json={"problem": "Should we relocate our HQ to another country?"})
        check("suggest returns valid expert ids", r.status_code == 200
              and all(i in [x["id"] for x in q("SELECT id FROM experts")] for i in r.json()["expert_ids"]), r.text[:200])
        if r.status_code == 200:
            print(f"      suggested: {r.json()['expert_ids']} — {r.json()['reasoning'][:120]}")

        # ---- 10. analytics ----
        print("[10] Analytics")
        a = client.get("/api/analytics").json()
        check("analytics totals match usage_log sum",
              a["totals"]["calls"] == len(q("SELECT * FROM usage_log")))
        check("breakdowns populated",
              len(a["by_model"]) >= 1 and len(a["by_expert"]) >= 3 and len(a["by_session"]) >= 1 and len(a["by_day"]) == 1)
        print(f"      total spend this run: ${a['totals']['cost']:.6f} across {a['totals']['calls']} calls")

        # ---- 11. variations: synthesis-off / round2-off session ----
        print("[11] Variation: 1 expert, no round 2, no synthesis")
        r = client.post("/api/sessions", json={
            "expert_ids": expert_ids[:1], "round2_enabled": False, "synthesis_enabled": False})
        sid2 = r.json()["session"]["id"]
        with client.stream("POST", f"/api/sessions/{sid2}/dispatch", json={"brief": brief}) as resp:
            ev = collect_sse(resp)
        check("single-expert session freezes right after round 1",
              ev[-1].get("session_status") == "frozen", str(ev[-1]))
        with client.stream("POST", f"/api/sessions/{sid2}/round2") as resp:
            check("round 2 correctly rejected when disabled/frozen", resp.status_code in (400, 409))

        print(f"\n=== RESULT: {PASS} passed, {FAIL} failed "
              f"({'LIVE' if LIVE else 'MOCK'} mode, db: {config.DB_PATH.name}) ===\n")
        sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
