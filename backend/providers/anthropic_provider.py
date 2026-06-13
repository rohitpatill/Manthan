from __future__ import annotations

import json
from typing import AsyncIterator

import httpx

from .base import BaseProvider, ProviderError

API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"


class AnthropicProvider(BaseProvider):
    provider_id = "anthropic"

    def _headers(self, api_key: str) -> dict[str, str]:
        return {
            "x-api-key": api_key.strip(),
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        }

    def _payload(self, model: str, system_prompt: str, messages: list[dict[str, str]], max_tokens: int) -> dict:
        return {
            "model": self._normalize_model_name(model),
            "max_tokens": max_tokens,
            "system": [{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": m["role"], "content": m["content"]} for m in messages],
        }

    async def validate_api_key(self, api_key: str) -> dict:
        payload = {
            "model": "claude-haiku-4-5",
            "max_tokens": 32,
            "system": "Return short plain text only.",
            "messages": [{"role": "user", "content": "Reply with OK"}],
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(API_URL, json=payload, headers=self._headers(api_key))
        if response.status_code >= 400:
            raise ProviderError(f"Anthropic validation failed: {response.text[:300]}")
        return {"ok": True}

    async def generate_json(
        self, *, api_key: str, model: str, system_prompt: str,
        messages: list[dict[str, str]], max_tokens: int,
    ) -> dict:
        payload = self._payload(model, system_prompt, messages, max_tokens)
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(API_URL, json=payload, headers=self._headers(api_key))
        if response.status_code >= 400:
            raise ProviderError(f"Anthropic request failed: {response.text[:500]}")
        data = response.json()
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
        if not text:
            raise ProviderError("Anthropic response contained no text")
        return {"text": text, "usage": self._normalize_usage(data.get("usage", {}))}

    async def stream_text(
        self, *, api_key: str, model: str, system_prompt: str,
        messages: list[dict[str, str]], max_tokens: int,
    ) -> AsyncIterator[dict]:
        payload = self._payload(model, system_prompt, messages, max_tokens)
        payload["stream"] = True
        usage: dict = {"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0}
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream("POST", API_URL, json=payload, headers=self._headers(api_key)) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    raise ProviderError(f"Anthropic stream failed: {body.decode('utf-8', 'replace')[:500]}")
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if not raw:
                        continue
                    try:
                        event = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    etype = event.get("type", "")
                    if etype == "content_block_delta":
                        delta = event.get("delta", {})
                        if delta.get("type") == "text_delta" and delta.get("text"):
                            yield {"type": "chunk", "text": delta["text"]}
                    elif etype == "message_start":
                        start_usage = (event.get("message") or {}).get("usage", {})
                        usage["input_tokens"] = start_usage.get("input_tokens", 0) or 0
                        usage["cached_tokens"] = start_usage.get("cache_read_input_tokens", 0) or 0
                    elif etype == "message_delta":
                        delta_usage = event.get("usage", {})
                        usage["output_tokens"] = delta_usage.get("output_tokens", 0) or 0
                    elif etype == "error":
                        raise ProviderError(f"Anthropic stream error: {json.dumps(event)[:300]}")
        yield {"type": "usage", "usage": usage}

    def _normalize_usage(self, usage: dict) -> dict:
        return {
            "input_tokens": usage.get("input_tokens", 0) or 0,
            "output_tokens": usage.get("output_tokens", 0) or 0,
            "cached_tokens": usage.get("cache_read_input_tokens", 0) or 0,
        }

    def _normalize_model_name(self, model: str) -> str:
        direct_map = {
            "claude-opus-4": "claude-opus-4-0",
            "claude-sonnet-4": "claude-sonnet-4-0",
        }
        if model in direct_map:
            return direct_map[model]
        return model.replace(".7", "-7").replace(".6", "-6").replace(".5", "-5").replace(".1", "-1")
