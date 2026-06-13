from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator


class ProviderError(Exception):
    pass


class BaseProvider(ABC):
    """Async LLM provider interface.

    Usage dicts are normalized to: {"input_tokens", "output_tokens", "cached_tokens"}.
    """

    provider_id: str

    @abstractmethod
    async def validate_api_key(self, api_key: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    async def generate_json(
        self,
        *,
        api_key: str,
        model: str,
        system_prompt: str,
        messages: list[dict[str, str]],
        max_tokens: int,
    ) -> dict[str, Any]:
        """Non-streaming structured call. Returns {"text": str, "usage": dict}."""
        raise NotImplementedError

    @abstractmethod
    def stream_text(
        self,
        *,
        api_key: str,
        model: str,
        system_prompt: str,
        messages: list[dict[str, str]],
        max_tokens: int,
    ) -> AsyncIterator[dict[str, Any]]:
        """Streaming plain-text call. Yields {"type": "chunk", "text": str} events
        and finally one {"type": "usage", "usage": dict} event."""
        raise NotImplementedError
