from __future__ import annotations

import json
from typing import Any, AsyncIterator

import httpx

from .base import BaseProvider, ProviderError

API_URL = "https://api.openai.com/v1/responses"


def _normalize_usage(usage: dict) -> dict:
    details = usage.get("input_tokens_details") or {}
    return {
        "input_tokens": usage.get("input_tokens", 0) or 0,
        "output_tokens": usage.get("output_tokens", 0) or 0,
        "cached_tokens": details.get("cached_tokens", 0) or 0,
    }


class OpenAIProvider(BaseProvider):
    provider_id = "openai"

    def _headers(self, api_key: str) -> dict[str, str]:
        key = api_key.replace("‑", "-").replace("‐", "-").replace("−", "-").strip()
        return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def _input_items(self, system_prompt: str, messages: list[dict[str, str]]) -> list[dict]:
        items = [{"role": "user", "content": [{"type": "input_text", "text": system_prompt}]}]
        for message in messages:
            if message["role"] == "assistant":
                items.append({"role": "assistant", "content": [{"type": "output_text", "text": message["content"]}]})
            else:
                items.append({"role": "user", "content": [{"type": "input_text", "text": message["content"]}]})
        return items

    def _base_payload(self, model: str, system_prompt: str, messages: list[dict[str, str]], max_tokens: int) -> dict:
        payload: dict[str, Any] = {
            "model": model,
            "input": self._input_items(system_prompt, messages),
            "max_output_tokens": self._effective_max_tokens(model, max_tokens),
        }
        if model.startswith("gpt-5"):
            payload["reasoning"] = {"effort": self._reasoning_effort(model)}
        return payload

    async def validate_api_key(self, api_key: str) -> dict:
        payload = {
            "model": "gpt-4o-mini",
            "input": 'Return a JSON object like {"ok": true}.',
            "max_output_tokens": 32,
            "text": {"format": {"type": "json_object"}},
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(API_URL, json=payload, headers=self._headers(api_key))
        if response.status_code >= 400:
            raise ProviderError(f"OpenAI validation failed: {response.text[:300]}")
        return {"ok": True}

    async def generate_json(
        self, *, api_key: str, model: str, system_prompt: str,
        messages: list[dict[str, str]], max_tokens: int,
    ) -> dict:
        payload = self._base_payload(model, system_prompt, messages, max_tokens)
        payload["text"] = {"format": {"type": "json_object"}}
        if model.startswith("gpt-5"):
            payload["text"]["verbosity"] = "low"
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(API_URL, json=payload, headers=self._headers(api_key))
        if response.status_code >= 400:
            raise ProviderError(f"OpenAI request failed: {response.text[:500]}")
        data = response.json()
        text = self._extract_text(data)
        return {"text": text, "usage": _normalize_usage(data.get("usage", {}))}

    async def stream_text(
        self, *, api_key: str, model: str, system_prompt: str,
        messages: list[dict[str, str]], max_tokens: int,
    ) -> AsyncIterator[dict]:
        payload = self._base_payload(model, system_prompt, messages, max_tokens)
        payload["stream"] = True
        usage: dict = {"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0}
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream("POST", API_URL, json=payload, headers=self._headers(api_key)) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    raise ProviderError(f"OpenAI stream failed: {body.decode('utf-8', 'replace')[:500]}")
                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if not raw or raw == "[DONE]":
                        continue
                    try:
                        event = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    etype = event.get("type", "")
                    if etype == "response.output_text.delta" and event.get("delta"):
                        yield {"type": "chunk", "text": event["delta"]}
                    elif etype in ("response.completed", "response.incomplete"):
                        usage = _normalize_usage((event.get("response") or {}).get("usage", {}))
                    elif etype in ("response.failed", "error"):
                        message = json.dumps(event)[:300]
                        raise ProviderError(f"OpenAI stream error: {message}")
        yield {"type": "usage", "usage": usage}

    def _extract_text(self, data: dict) -> str:
        if data.get("output_text"):
            return data["output_text"]
        for output_item in data.get("output", []):
            for content_item in output_item.get("content", []):
                if content_item.get("text"):
                    return content_item["text"]
        incomplete = data.get("incomplete_details") or {}
        if incomplete.get("reason") == "max_output_tokens":
            raise ProviderError("OpenAI response hit its token budget before producing text")
        raise ProviderError("OpenAI response contained no text")

    def _reasoning_effort(self, model: str) -> str:
        if model in {"gpt-5", "gpt-5-mini", "gpt-5-nano"}:
            return "minimal"
        if model == "gpt-5-pro":
            return "high"
        if model.endswith("-pro"):
            return "medium"
        return "none"

    def _effective_max_tokens(self, model: str, max_tokens: int) -> int:
        if model == "gpt-5-pro":
            return max(max_tokens, 768)
        if model.endswith("-pro"):
            return max(max_tokens, 512)
        if model.startswith("gpt-5"):
            return max(max_tokens, 256)
        return max_tokens
