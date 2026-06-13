"""Deterministic mock provider used when MANTHAN_MOCK=1 (test mode).

Behaves like a real provider but needs no network or API key. The intake /
builder JSON responses are shaped by sniffing the system prompt so the full
application flow can be exercised end-to-end.
"""
from __future__ import annotations

import asyncio
import json
from typing import AsyncIterator

from .base import BaseProvider, ProviderError

MOCK_USAGE = {"input_tokens": 120, "output_tokens": 80, "cached_tokens": 10}


class MockProvider(BaseProvider):
    provider_id = "mock"

    async def validate_api_key(self, api_key: str) -> dict:
        if api_key == "bad-key":
            raise ProviderError("Mock validation failed: bad key")
        return {"ok": True}

    async def generate_json(
        self, *, api_key: str, model: str, system_prompt: str,
        messages: list[dict[str, str]], max_tokens: int,
    ) -> dict:
        last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
        if "Manthan AI" in system_prompt and "intake" in system_prompt.lower():
            ready = "READY" in last_user.upper() or len(last_user) > 80
            payload = {
                "assistant_message": "Understood. Could you share more detail?" if not ready
                else "I have a complete picture. Ready to brief the council.",
                "ready_to_dispatch": ready,
                "compiled_brief": f"BRIEF: {last_user[:400]}" if ready else "",
            }
        elif "persona designer" in system_prompt.lower():
            payload = {
                "assistant_message": "Here is a draft expert.",
                "ready": True,
                "expert": {
                    "name": "Dr. Mock Expert",
                    "title": "Mock Specialist",
                    "persona": "A meticulous mock persona for testing.",
                    "suggested_provider_type": "openai",
                    "suggested_model_id": "gpt-4o-mini",
                },
            }
        elif "suggest" in system_prompt.lower():
            payload = {"expert_ids": [], "reasoning": "Mock suggestion."}
        else:
            payload = {"ok": True}
        return {"text": json.dumps(payload), "usage": dict(MOCK_USAGE)}

    async def stream_text(
        self, *, api_key: str, model: str, system_prompt: str,
        messages: list[dict[str, str]], max_tokens: int,
    ) -> AsyncIterator[dict]:
        if api_key == "fail-key":
            raise ProviderError("Mock stream failure (simulated)")
        if "synthesis" in system_prompt.lower():
            text = ("STANCE: Combined verdict reached.\n"
                    "The panel largely agrees, with one notable conflict, resolved as follows. "
                    "Final recommendation: proceed carefully.")
        else:
            text = (f"STANCE: As a {model} expert I recommend option A.\n"
                    "Reasoning: based on my persona and the brief, here is my detailed, "
                    "independent analysis of the problem with key risks and trade-offs.")
        for i in range(0, len(text), 24):
            await asyncio.sleep(0.001)
            yield {"type": "chunk", "text": text[i:i + 24]}
        yield {"type": "usage", "usage": dict(MOCK_USAGE)}
