from __future__ import annotations

import json
from typing import AsyncIterator

import httpx

from .base import BaseProvider, ProviderError

BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


def _normalize_usage(meta: dict) -> dict:
    return {
        "input_tokens": meta.get("promptTokenCount", 0) or 0,
        "output_tokens": (meta.get("candidatesTokenCount", 0) or 0) + (meta.get("thoughtsTokenCount", 0) or 0),
        "cached_tokens": meta.get("cachedContentTokenCount", 0) or 0,
    }


class GeminiProvider(BaseProvider):
    provider_id = "gemini"

    def _normalize_model(self, model: str) -> str:
        if model == "gemini-2.5-flash-lite-preview-09-2025":
            return "gemini-2.5-flash-lite"
        return model

    def _headers(self, api_key: str) -> dict[str, str]:
        return {"x-goog-api-key": api_key.strip(), "Content-Type": "application/json"}

    def _payload(self, system_prompt: str, messages: list[dict[str, str]], max_tokens: int, json_mode: bool) -> dict:
        contents = []
        for message in messages:
            role = "model" if message["role"] == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": message["content"]}]})
        generation_config: dict = {"maxOutputTokens": max_tokens}
        # Thinking models (e.g. Gemini 3.x Pro) otherwise spend most of maxOutputTokens
        # "thinking", leaving too little budget for the visible answer and truncating it
        # mid-sentence. Keep the thinking budget small so the tokens go to the actual output.
        generation_config["thinkingConfig"] = {"thinkingBudget": 256}
        if json_mode:
            generation_config["responseMimeType"] = "application/json"
        return {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": contents,
            "generationConfig": generation_config,
        }

    async def validate_api_key(self, api_key: str) -> dict:
        payload = {
            "contents": [{"parts": [{"text": 'Return a JSON object like {"ok": true}.'}]}],
            "generationConfig": {"responseMimeType": "application/json", "maxOutputTokens": 32},
        }
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                f"{BASE_URL}/gemini-2.5-flash:generateContent",
                json=payload, headers=self._headers(api_key),
            )
        if response.status_code >= 400:
            raise ProviderError(f"Gemini validation failed: {response.text[:300]}")
        return {"ok": True}

    async def generate_json(
        self, *, api_key: str, model: str, system_prompt: str,
        messages: list[dict[str, str]], max_tokens: int,
    ) -> dict:
        model_name = self._normalize_model(model)
        payload = self._payload(system_prompt, messages, max_tokens, json_mode=True)
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                f"{BASE_URL}/{model_name}:generateContent",
                json=payload, headers=self._headers(api_key),
            )
        if response.status_code >= 400:
            raise ProviderError(f"Gemini request failed: {response.text[:500]}")
        data = response.json()
        text = self._extract_text(data)
        if not text:
            raise ProviderError("Gemini response contained no text")
        return {"text": text, "usage": _normalize_usage(data.get("usageMetadata", {}))}

    async def stream_text(
        self, *, api_key: str, model: str, system_prompt: str,
        messages: list[dict[str, str]], max_tokens: int,
    ) -> AsyncIterator[dict]:
        model_name = self._normalize_model(model)
        payload = self._payload(system_prompt, messages, max_tokens, json_mode=False)
        usage: dict = {"input_tokens": 0, "output_tokens": 0, "cached_tokens": 0}
        url = f"{BASE_URL}/{model_name}:streamGenerateContent?alt=sse"
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream("POST", url, json=payload, headers=self._headers(api_key)) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    raise ProviderError(f"Gemini stream failed: {body.decode('utf-8', 'replace')[:500]}")
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
                    text = self._extract_text(event)
                    if text:
                        yield {"type": "chunk", "text": text}
                    if event.get("usageMetadata"):
                        usage = _normalize_usage(event["usageMetadata"])
        yield {"type": "usage", "usage": usage}

    def _extract_text(self, data: dict) -> str:
        return "".join(
            part.get("text", "")
            for candidate in data.get("candidates", [])
            for part in candidate.get("content", {}).get("parts", [])
            if part.get("text")
        )
