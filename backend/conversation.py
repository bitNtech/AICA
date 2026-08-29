"""Conversation Manager: routes a caller transcript through the master prompt,
the LLM, and the mock tool layer, returning the agent's reply text.

Per BACKEND_COMPLETION.md Sec3.1: golden/main_prompt.txt is loaded once and
templated per call from caller metadata; the ledger is real server-side state
per connection_id (an in-process dict for v1 - Redis is a later scaling step
for reconnect/multi-process, not needed yet).

Text-only for now: handle_utterance() waits for the LLM's full reply rather
than streaming tokens out. Sentence-boundary streaming into TTS is a later
item, once there is an audio-out path to stream into.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import json
import logging
import re

from .llm import LlmClient, LlmReply
from .settings import ConversationSettings
from .tools import TOOL_SCHEMAS, MockHospitalDb, execute_tool

logger = logging.getLogger("aica.conversation")

# Placeholders golden/main_prompt.txt is known to use (its Sec1/Sec5B/Sec6D
# references: {{agent_name}}, {{caller_mobile}}, {{mrn}}, {{campaign}},
# {{patient_name}}, {{caller_name}}, {{last_visit}}). Anything else in the
# template is almost certainly a typo or a new placeholder nobody wired up -
# substituting it with "" would silently leak a blank into what the agent
# says on a live call, so unknown placeholders are left as literal text and
# logged instead of guessed at.
KNOWN_PLACEHOLDERS = frozenset(
    {"agent_name", "caller_name", "caller_mobile", "mrn", "campaign", "last_visit", "patient_name"}
)

_PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")

# golden/main_prompt.txt Sec5A: the opening line is said verbatim on
# [CALL_CONNECTED], before any LLM call - "Your first action is always to
# SPEAK. Never call a tool or hang up on the first turn."
OPENING_LINE = "வணக்கம், அருவி ஹாஸ்பிட்டல். நான் {{agent_name}} பேசுறேன். உங்களுக்கு எப்படி help பண்ணலாம்?"


def render_template(template: str, metadata: dict[str, str]) -> str:
    def _substitute(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in KNOWN_PLACEHOLDERS:
            logger.warning("unknown template placeholder {{%s}} left unsubstituted", key)
            return match.group(0)
        return metadata.get(key, "")

    return _PLACEHOLDER_RE.sub(_substitute, template)


@dataclass
class CallSession:
    connection_id: str
    metadata: dict[str, str]
    ledger: dict[str, object] = field(default_factory=dict)
    messages: list[dict] = field(default_factory=list)


class ConversationManager:
    """Owns the master prompt, per-call sessions, and the shared mock hospital DB."""

    def __init__(self, settings: ConversationSettings) -> None:
        self.settings = settings
        self._prompt_template: str | None = None
        self.db = MockHospitalDb()
        self._sessions: dict[str, CallSession] = {}

    @property
    def ready(self) -> bool:
        return self._prompt_template is not None

    def load(self) -> None:
        """Read the master prompt once during startup, keeping call-time latency low."""
        self._prompt_template = self.settings.prompt_path.read_text(encoding="utf-8")
        logger.info("loaded master prompt (%d chars)", len(self._prompt_template))

    def start_call(self, connection_id: str, **metadata: str) -> str:
        """Open a new call session and return the scripted greeting (Sec5A - no LLM call)."""
        if self._prompt_template is None:
            raise RuntimeError("ConversationManager prompt is not loaded")

        system_prompt = render_template(self._prompt_template, metadata)
        greeting = render_template(OPENING_LINE, metadata)
        session = CallSession(
            connection_id=connection_id,
            metadata=dict(metadata),
            ledger=dict(metadata),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "assistant", "content": greeting},
            ],
        )
        self._sessions[connection_id] = session
        return greeting

    def end_call(self, connection_id: str) -> None:
        self._sessions.pop(connection_id, None)

    async def handle_utterance(self, connection_id: str, llm: LlmClient, text: str) -> str:
        """Run one caller turn through the tool-call loop and return the agent's reply text."""
        session = self._sessions.get(connection_id)
        if session is None:
            raise RuntimeError(f"no active call session for {connection_id}")

        session.messages.append({"role": "user", "content": text})

        for _ in range(self.settings.max_tool_iterations):
            reply = await llm.complete(session.messages, TOOL_SCHEMAS)

            if not reply.tool_calls:
                session.messages.append({"role": "assistant", "content": reply.content})
                return reply.content

            session.messages.append(_assistant_tool_call_message(reply))
            for call in reply.tool_calls:
                result = execute_tool(self.db, call.name, call.arguments)
                session.ledger.update(result)
                session.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )

        logger.error("tool-call loop did not terminate within %d iterations for %s", self.settings.max_tool_iterations, connection_id)
        raise RuntimeError("LLM tool-call loop did not terminate")


def _assistant_tool_call_message(reply: LlmReply) -> dict:
    return {
        "role": "assistant",
        "content": reply.content or None,
        "tool_calls": [
            {
                "id": call.id,
                "type": "function",
                "function": {"name": call.name, "arguments": json.dumps(call.arguments, ensure_ascii=False)},
            }
            for call in reply.tool_calls
        ],
    }
