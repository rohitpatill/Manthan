"""End-to-end backend tests (mock provider mode — no network, no real keys).

Run from backend/:  python -m pytest tests/ -v
"""
import json
import os
import sys
from pathlib import Path

os.environ["MANTHAN_MOCK"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config  # noqa: E402

# isolate test database (throwaway location under tests/tmp/)
_TMP = config.BASE_DIR / "tests" / "tmp"
_TMP.mkdir(parents=True, exist_ok=True)
config.DB_PATH = _TMP / "test_manthan.db"
if config.DB_PATH.exists():
    config.DB_PATH.unlink()

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)


def collect_sse(response) -> list[dict]:
    events = []
    for line in response.iter_lines():
        if line.startswith("data:"):
            events.append(json.loads(line[5:].strip()))
    return events


# ---------- health & onboarding ----------

def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["mock_mode"] is True


def test_providers_empty_initially():
    r = client.get("/api/providers")
    body = r.json()
    assert body["providers"] == []
    assert set(body["catalog"].keys()) == {"openai", "gemini", "anthropic"}


def test_save_invalid_key_rejected():
    r = client.post("/api/providers", json={"provider_type": "openai", "api_key": "bad-key"})
    assert r.status_code == 400


def test_save_valid_keys():
    for provider in ("openai", "anthropic"):
        r = client.post("/api/providers", json={"provider_type": provider, "api_key": f"good-{provider}"})
        assert r.status_code == 200, r.text
    body = client.get("/api/providers").json()
    assert {p["provider_type"] for p in body["providers"]} == {"openai", "anthropic"}
    assert all(p["is_valid"] == 1 for p in body["providers"])


def test_default_model_requires_valid_provider():
    r = client.put("/api/providers/default-model",
                   json={"provider_type": "gemini", "model_id": "gemini-2.5-pro"})
    assert r.status_code == 400


def test_set_default_model():
    r = client.put("/api/providers/default-model",
                   json={"provider_type": "openai", "model_id": "gpt-4o-mini"})
    assert r.status_code == 200


# ---------- experts ----------

def test_seed_starters():
    r = client.post("/api/seed-starters")
    assert r.status_code == 200
    assert len(r.json()["experts"]) == 6


def test_create_expert_unconfigured_provider_rejected():
    r = client.post("/api/experts", json={
        "name": "X", "provider_type": "gemini", "model_id": "gemini-2.5-pro"})
    assert r.status_code == 400


def test_create_expert_bad_model_rejected():
    r = client.post("/api/experts", json={
        "name": "X", "provider_type": "openai", "model_id": "gpt-99"})
    assert r.status_code == 400


def test_expert_crud():
    r = client.post("/api/experts", json={
        "name": "Dr. Test", "title": "Tester", "persona": "Tests things.",
        "avatar_url": "https://example.com/a.png",
        "provider_type": "anthropic", "model_id": "claude-sonnet-4.6"})
    assert r.status_code == 200, r.text
    expert = r.json()["expert"]
    r = client.put(f"/api/experts/{expert['id']}", json={
        "name": "Dr. Test 2", "title": "Tester", "persona": "Tests more.",
        "avatar_url": "", "provider_type": "openai", "model_id": "gpt-5-mini"})
    assert r.status_code == 200
    assert r.json()["expert"]["name"] == "Dr. Test 2"
    r = client.post(f"/api/experts/{expert['id']}/duplicate")
    assert r.status_code == 200
    dup_id = r.json()["expert"]["id"]
    assert client.delete(f"/api/experts/{dup_id}").status_code == 200
    assert client.delete(f"/api/experts/{expert['id']}").status_code == 200
    assert client.delete("/api/experts/99999").status_code == 404


def test_expert_bad_avatar_rejected():
    r = client.post("/api/experts", json={
        "name": "X", "avatar_url": "not-a-url",
        "provider_type": "openai", "model_id": "gpt-4o-mini"})
    assert r.status_code == 400


def test_builder_chat():
    r = client.post("/api/experts/builder/chat", json={
        "messages": [{"role": "user", "content": "I need a skeptical economist"}]})
    assert r.status_code == 200
    body = r.json()
    assert body["ready"] is True
    assert body["expert"]["name"]


def test_suggest_experts():
    r = client.post("/api/experts/suggest", json={"problem": "Should we alter human biology?"})
    assert r.status_code == 200
    assert "expert_ids" in r.json()


# ---------- session lifecycle ----------

@pytest.fixture(scope="module")
def expert_ids():
    experts = client.get("/api/experts").json()["experts"]
    return [e["id"] for e in experts[:3]]


@pytest.fixture(scope="module")
def session_id(expert_ids):
    r = client.post("/api/sessions", json={
        "title": "Biology Decision", "expert_ids": expert_ids,
        "round2_enabled": True, "synthesis_enabled": True})
    assert r.status_code == 200, r.text
    return r.json()["session"]["id"]


def test_session_expert_count_limits():
    assert client.post("/api/sessions", json={"expert_ids": []}).status_code == 400
    assert client.post("/api/sessions", json={"expert_ids": list(range(1, 13))}).status_code == 400


def test_intake_not_ready_then_ready(session_id):
    r = client.post(f"/api/sessions/{session_id}/intake", json={"message": "hi"})
    assert r.status_code == 200
    assert r.json()["ready_to_dispatch"] is False
    r = client.post(f"/api/sessions/{session_id}/intake", json={
        "message": "READY. Humanity must decide whether to alter our biology for survival. "
                   "Weigh ethics, science, economics. We want a recommendation."})
    body = r.json()
    assert body["ready_to_dispatch"] is True
    assert body["compiled_brief"].startswith("BRIEF:")


def test_round2_before_round1_rejected(session_id):
    with client.stream("POST", f"/api/sessions/{session_id}/round2") as r:
        assert r.status_code == 400


def test_dispatch_round1(session_id, expert_ids):
    with client.stream("POST", f"/api/sessions/{session_id}/dispatch",
                       json={"brief": "BRIEF: should humanity alter its biology?"}) as r:
        assert r.status_code == 200
        events = collect_sse(r)
    types = [e["type"] for e in events]
    assert types.count("expert_start") == 3
    assert types.count("expert_done") == 3
    assert "chunk" in types
    assert events[-1]["type"] == "stage_done"
    done = [e for e in events if e["type"] == "expert_done"]
    assert all(e["stance"] for e in done)
    assert all(e["usage"]["cost"] >= 0 for e in done)


def test_dispatch_twice_rejected(session_id):
    r = client.post(f"/api/sessions/{session_id}/dispatch", json={"brief": "again"})
    assert r.status_code == 409


def test_synthesis_round1(session_id):
    with client.stream("POST", f"/api/sessions/{session_id}/synthesize?round=1") as r:
        assert r.status_code == 200
        events = collect_sse(r)
    types = [e["type"] for e in events]
    assert "synthesis_start" in types and "synthesis_done" in types


def test_round2(session_id):
    with client.stream("POST", f"/api/sessions/{session_id}/round2") as r:
        assert r.status_code == 200
        events = collect_sse(r)
    assert [e["type"] for e in events].count("expert_done") == 3


def test_synthesis_round2_freezes_session(session_id):
    with client.stream("POST", f"/api/sessions/{session_id}/synthesize?round=2") as r:
        events = collect_sse(r)
    assert events[-1]["session_status"] == "frozen"
    detail = client.get(f"/api/sessions/{session_id}").json()
    assert detail["session"]["status"] == "frozen"
    # full record present: 3 r1 + 3 r2 expert responses + 2 syntheses
    responses = detail["responses"]
    assert len([x for x in responses if x["kind"] == "expert" and x["round"] == 1]) == 3
    assert len([x for x in responses if x["kind"] == "expert" and x["round"] == 2]) == 3
    assert len([x for x in responses if x["kind"] == "synthesis"]) == 2
    assert detail["usage_totals"]["cost"] > 0
    assert len(detail["intake_messages"]) == 4


def test_frozen_session_is_readonly(session_id):
    r = client.post(f"/api/sessions/{session_id}/intake", json={"message": "more"})
    assert r.status_code == 409
    with client.stream("POST", f"/api/sessions/{session_id}/round2") as r:
        assert r.status_code == 409


def test_round2_prompt_includes_synthesis_and_structure():
    """Round-2 prompt must carry platform context, brief, own answer, peers, and the R1 synthesis."""
    import prompts
    peers = [
        {"name": "Alice", "title": "Economist", "content": "Peer A reasoning."},
        {"name": "Bob", "title": "Ethicist", "content": "Peer B reasoning."},
    ]
    msg = prompts.round2_user_message(
        brief="Should we do X?", own_answer="STANCE: yes\nMy round 1 view.",
        peers=peers, synthesis="STANCE: mixed\nThe panel was split.")
    assert "round 2" in msg.lower() and "Manthan council" in msg
    assert "Should we do X?" in msg
    assert "My round 1 view." in msg
    assert "Alice" in msg and "Bob" in msg and "Peer A reasoning." in msg
    assert "round-1 synthesis" in msg and "The panel was split." in msg
    # without synthesis, that section is omitted
    msg2 = prompts.round2_user_message("b", "o", peers, synthesis="")
    assert "round-1 synthesis" not in msg2


def test_expert_model_propagates_on_dispatch(expert_ids):
    """Editing an expert's model after a session is created should take effect at dispatch."""
    r = client.post("/api/sessions", json={
        "expert_ids": expert_ids[:1], "round2_enabled": False, "synthesis_enabled": False})
    sid = r.json()["session"]["id"]
    se = r.json()["experts"][0]
    assert se["model_id"] != "gpt-5-nano"
    # change the source expert's model in the library
    client.put(f"/api/experts/{expert_ids[0]}", json={
        "name": se["name"], "title": se["title"], "persona": "Updated persona for propagation test.",
        "provider_type": "openai", "model_id": "gpt-5-nano", "avatar_url": ""})
    with client.stream("POST", f"/api/sessions/{sid}/dispatch", json={"brief": "test brief"}) as resp:
        collect_sse(resp)
    detail = client.get(f"/api/sessions/{sid}").json()
    assert detail["experts"][0]["model_id"] == "gpt-5-nano"
    assert "propagation test" in detail["experts"][0]["persona"]


def test_expert_failure_isolation_and_retry():
    """One expert on an unconfigured provider must fail without blocking others; retry recovers it."""
    # all three providers valid while we build experts + session
    client.post("/api/providers", json={"provider_type": "openai", "api_key": "good-openai"})
    client.post("/api/providers", json={"provider_type": "gemini", "api_key": "good-gemini"})
    good = client.post("/api/experts", json={
        "name": "Works", "title": "OK", "persona": "Reliable expert.",
        "provider_type": "openai", "model_id": "gpt-4o-mini"}).json()["expert"]
    bad = client.post("/api/experts", json={
        "name": "Breaks", "title": "Fail", "persona": "Expert with no key.",
        "provider_type": "gemini", "model_id": "gemini-2.5-flash"}).json()["expert"]
    r = client.post("/api/sessions", json={
        "title": "Failure Test", "expert_ids": [good["id"], bad["id"]],
        "round2_enabled": False, "synthesis_enabled": True})
    sid = r.json()["session"]["id"]
    # NOW remove gemini's key → the gemini expert will fail at dispatch
    client.delete("/api/providers/gemini")
    failing_se = next(e["id"] for e in r.json()["experts"] if e["provider_type"] == "gemini")
    with client.stream("POST", f"/api/sessions/{sid}/dispatch", json={"brief": "test brief"}) as resp:
        events = collect_sse(resp)
    types = [e["type"] for e in events]
    assert types.count("expert_failed") == 1   # gemini has no key configured
    assert types.count("expert_done") == 1     # the other expert still completed
    # retry the failed expert after fixing the key (before synthesis freezes the session)
    client.post("/api/providers", json={"provider_type": "gemini", "api_key": "good-gemini"})
    with client.stream("POST", f"/api/sessions/{sid}/experts/{failing_se}/retry", json={"round": 1}) as resp:
        revents = collect_sse(resp)
    assert any(e["type"] == "expert_done" for e in revents)
    detail = client.get(f"/api/sessions/{sid}").json()
    r1 = [x for x in detail["responses"] if x["kind"] == "expert" and x["round"] == 1]
    assert all(x["status"] == "done" for x in r1)
    # synthesis completes the session
    with client.stream("POST", f"/api/sessions/{sid}/synthesize?round=1") as resp:
        sevents = collect_sse(resp)
    assert any(e["type"] == "synthesis_done" for e in sevents)


def test_sessions_list():
    body = client.get("/api/sessions").json()
    assert len(body["sessions"]) >= 2
    assert all("experts" in s and "total_cost" in s for s in body["sessions"])


def test_rename_and_delete_session(expert_ids):
    r = client.post("/api/sessions", json={"expert_ids": expert_ids[:1]})
    sid = r.json()["session"]["id"]
    assert client.patch(f"/api/sessions/{sid}", json={"title": "Renamed"}).status_code == 200
    assert client.get(f"/api/sessions/{sid}").json()["session"]["title"] == "Renamed"
    assert client.delete(f"/api/sessions/{sid}").status_code == 200
    assert client.get(f"/api/sessions/{sid}").status_code == 404


# ---------- analytics & uploads ----------

def test_analytics():
    body = client.get("/api/analytics").json()
    assert body["totals"]["calls"] > 0
    assert body["totals"]["cost"] > 0
    assert len(body["by_model"]) >= 1
    assert len(body["by_expert"]) >= 1
    assert len(body["by_session"]) >= 1
    assert len(body["by_day"]) >= 1


def test_avatar_upload():
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
    r = client.post("/api/uploads/avatar", files={"file": ("a.png", png, "image/png")})
    assert r.status_code == 200
    assert r.json()["avatar_url"].startswith("/uploads/avatars/")
    r = client.post("/api/uploads/avatar", files={"file": ("a.txt", b"x", "text/plain")})
    assert r.status_code == 400


def test_delete_provider_flags_experts():
    # ensure gemini exists first so this test is order-independent
    client.post("/api/providers", json={"provider_type": "gemini", "api_key": "good-gemini"})
    r = client.delete("/api/providers/gemini")
    assert r.status_code == 200
    assert client.put("/api/providers/default-model",
                      json={"provider_type": "gemini", "model_id": "gemini-2.5-pro"}).status_code == 400
