import config

from .anthropic_provider import AnthropicProvider
from .base import BaseProvider, ProviderError
from .gemini_provider import GeminiProvider
from .mock_provider import MockProvider
from .openai_provider import OpenAIProvider


def get_provider(provider_id: str) -> BaseProvider:
    if config.MOCK_MODE:
        return MockProvider()
    if provider_id == "openai":
        return OpenAIProvider()
    if provider_id == "gemini":
        return GeminiProvider()
    if provider_id == "anthropic":
        return AnthropicProvider()
    raise ProviderError(f"Unsupported provider: {provider_id}")
