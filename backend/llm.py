"""OpenAI-compatible streaming LLM adapter.

Wraps an OpenAI-compatible async client (works for both vLLM and TGI) rather
than hand-rolling a transport - see BACKEND_COMPLETION.md Sec3.1. This keeps the
model swappable via LlmSettings alone: llm.py and conversation.py never know
whether they are talking to Llama 3.1 8B, Qwen2.5-7B, or anything else.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging

from .settings import LlmSettings

logger = logging.getLogger("aica.llm")


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass(frozen=True)
class LlmReply:
    content: str
    tool_calls: tuple[ToolCall, ...] = ()


class LlmClient:
    """Loads an OpenAI-compatible async client once and streams chat completions."""

    def __init__(self, settings: LlmSettings) -> None:
        self.settings = settings
        self._client = None

    @property
    def ready(self) -> bool:
        return self._client is not None

    def load(self) -> None:
        """Construct the client during startup, keeping call-time latency low."""
        from openai import AsyncOpenAI

        self._client = AsyncOpenAI(base_url=self.settings.base_url, api_key=self.settings.api_key)
        logger.info("LLM client configured for %s at %s", self.settings.model, self.settings.base_url)

    async def complete(self, messages: list[dict], tools: list[dict]) -> LlmReply:
        """Stream one chat completion and reassemble it into a single reply.

        Streaming happens at this layer so it is ready for token-level
        consumption later; for now the caller (conversation.py) waits for the
        full reply - sentence-boundary streaming into TTS is a later item.
        """
        if self._client is None:
            raise RuntimeError("LLM client is not loaded")

        stream = await self._client.chat.completions.create(
            model=self.settings.model,
            messages=messages,
            tools=tools,
            tool_choice="auto",
            temperature=self.settings.temperature,
            max_tokens=self.settings.max_tokens,
            stream=True,
        )

        content_parts: list[str] = []
        # Tool-call deltas are index-addressed and build up incrementally across
        # chunks: id/name usually arrive in the first delta for that index,
        # argument fragments (partial JSON) keep arriving after.
        pending_calls: dict[int, dict[str, str]] = {}

        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                content_parts.append(delta.content)
            for tool_call_delta in delta.tool_calls or []:
                slot = pending_calls.setdefault(tool_call_delta.index, {"id": "", "name": "", "arguments": ""})
                if tool_call_delta.id:
                    slot["id"] = tool_call_delta.id
                function = tool_call_delta.function
                if function and function.name:
                    slot["name"] = function.name
                if function and function.arguments:
                    slot["arguments"] += function.arguments

        tool_calls = tuple(
            ToolCall(id=slot["id"], name=slot["name"], arguments=_parse_arguments(slot["arguments"]))
            for _, slot in sorted(pending_calls.items())
        )
        return LlmReply(content="".join(content_parts), tool_calls=tool_calls)


def _parse_arguments(raw: str) -> dict:
    if not raw.strip():
        return {}
    return json.loads(raw)
