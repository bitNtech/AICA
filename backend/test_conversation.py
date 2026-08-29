"""Self-check for ConversationManager's prompt templating and tool-call loop.

Uses a fake LlmClient with scripted replies (no real model, no network) so the
orchestration logic - ledger updates, message-history shape, loop termination,
multi-turn continuity - is exercised deterministically. Bypasses load()'s file
read the same way test_asr.py bypasses IndicConformerAsr.load(): the template
is set directly on the manager.
"""

from __future__ import annotations

import contextlib
import logging

from .conversation import KNOWN_PLACEHOLDERS, ConversationManager, render_template
from .llm import LlmReply, ToolCall
from .settings import ConversationSettings

TEMPLATE = "Hello {{agent_name}}, caller {{caller_mobile}} mrn {{mrn}} unknown {{bogus_var}}."


class _ScriptedLlm:
    """Returns replies from a script in order; records every messages/tools call."""

    def __init__(self, replies: list[LlmReply]) -> None:
        self._replies = list(replies)
        self.calls: list[list[dict]] = []

    async def complete(self, messages: list[dict], tools: list[dict]) -> LlmReply:
        self.calls.append([dict(m) for m in messages])
        return self._replies.pop(0)


class _ListHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


@contextlib.contextmanager
def _captured_log_records(logger_name: str):
    logger = logging.getLogger(logger_name)
    handler = _ListHandler()
    logger.addHandler(handler)
    try:
        yield handler.records
    finally:
        logger.removeHandler(handler)


def _make_manager(max_tool_iterations: int = 6) -> ConversationManager:
    manager = ConversationManager(ConversationSettings(max_tool_iterations=max_tool_iterations))
    manager._prompt_template = TEMPLATE
    return manager


def test_render_template_substitutes_known_placeholders_only() -> None:
    with _captured_log_records("aica.conversation") as records:
        rendered = render_template(
            TEMPLATE, {"agent_name": "Gayathri", "caller_mobile": "9840721534", "mrn": "ARV-118342"}
        )

    assert rendered == "Hello Gayathri, caller 9840721534 mrn ARV-118342 unknown {{bogus_var}}."
    assert any("bogus_var" in record.getMessage() for record in records)
    assert {"agent_name", "caller_mobile", "mrn"} <= KNOWN_PLACEHOLDERS


def test_start_call_returns_greeting_without_any_llm_call() -> None:
    manager = _make_manager()

    greeting = manager.start_call("conn-1", agent_name="Gayathri", caller_mobile="9840721534")

    assert "Gayathri" in greeting
    session = manager._sessions["conn-1"]
    assert session.messages[0]["role"] == "system"
    assert session.messages[1] == {"role": "assistant", "content": greeting}
    assert session.ledger["agent_name"] == "Gayathri"


async def test_handle_utterance_without_tool_calls_returns_content() -> None:
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm([LlmReply(content="Cardiology-ல appointment வேணும், சரியா?")])

    reply = await manager.handle_utterance("conn-1", llm, "Cardiology-ல appointment book பண்ணனும்")

    assert reply == "Cardiology-ல appointment வேணும், சரியா?"
    messages = manager._sessions["conn-1"].messages
    assert messages[-2] == {"role": "user", "content": "Cardiology-ல appointment book பண்ணனும்"}
    assert messages[-1] == {"role": "assistant", "content": reply}


async def test_handle_utterance_executes_tool_call_and_updates_ledger() -> None:
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(
                content="", tool_calls=(ToolCall(id="call_1", name="lookupPatient", arguments={"mobile": "9840721534"}),)
            ),
            LlmReply(content="MRN ARV-118342, T. Nagar-ல இருக்கு. சரியா?"),
        ]
    )

    reply = await manager.handle_utterance("conn-1", llm, "என் mobile number 9840721534")

    assert reply == "MRN ARV-118342, T. Nagar-ல இருக்கு. சரியா?"
    session = manager._sessions["conn-1"]
    assert session.ledger["mrn"] == "ARV-118342"
    assert session.ledger["patient_name"] == "Murugesan"

    tool_result_messages = [m for m in session.messages if m.get("role") == "tool"]
    assert len(tool_result_messages) == 1
    assert tool_result_messages[0]["tool_call_id"] == "call_1"

    assistant_tool_call_messages = [m for m in session.messages if m.get("role") == "assistant" and "tool_calls" in m]
    assert assistant_tool_call_messages[0]["tool_calls"][0]["function"]["name"] == "lookupPatient"


async def test_ledger_reaches_the_llm_context_on_the_next_turn() -> None:
    """Proxy for "never re-ask": once a fact is in the ledger, it must be part
    of what the LLM sees on subsequent turns (actual re-ask avoidance is model
    behaviour driven by the prompt, not something a unit test can assert)."""
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(
                content="", tool_calls=(ToolCall(id="call_1", name="lookupPatient", arguments={"mobile": "9840721534"}),)
            ),
            LlmReply(content="ஒரு appointment book பண்ணலாமா?"),
            LlmReply(content="சரி, Cardiology-க்கு book பண்றேன்."),
        ]
    )

    await manager.handle_utterance("conn-1", llm, "என் mobile 9840721534")
    await manager.handle_utterance("conn-1", llm, "ஆமாம் Cardiology")

    second_turn_messages = llm.calls[-1]
    serialized = str(second_turn_messages)
    assert "ARV-118342" in serialized  # the tool result from turn 1 is still in context
    assert "Murugesan" in serialized


async def test_tool_loop_raises_after_max_iterations_instead_of_looping_forever() -> None:
    manager = _make_manager(max_tool_iterations=3)
    manager.start_call("conn-1", agent_name="Gayathri")
    always_tool_calls = LlmReply(content="", tool_calls=(ToolCall(id="call_x", name="lookupPatient", arguments={}),))
    llm = _ScriptedLlm([always_tool_calls, always_tool_calls, always_tool_calls])

    try:
        await manager.handle_utterance("conn-1", llm, "hello")
    except RuntimeError:
        assert len(llm.calls) == 3
        return
    raise AssertionError("handle_utterance must not loop forever on a model that never stops calling tools")


async def test_handle_utterance_without_active_session_raises() -> None:
    manager = _make_manager()
    llm = _ScriptedLlm([])

    try:
        await manager.handle_utterance("no-such-conn", llm, "hello")
    except RuntimeError:
        return
    raise AssertionError("handle_utterance must refuse to run without an active session")


if __name__ == "__main__":
    import asyncio

    test_render_template_substitutes_known_placeholders_only()
    test_start_call_returns_greeting_without_any_llm_call()
    asyncio.run(test_handle_utterance_without_tool_calls_returns_content())
    asyncio.run(test_handle_utterance_executes_tool_call_and_updates_ledger())
    asyncio.run(test_ledger_reaches_the_llm_context_on_the_next_turn())
    asyncio.run(test_tool_loop_raises_after_max_iterations_instead_of_looping_forever())
    asyncio.run(test_handle_utterance_without_active_session_raises())
    print("ok")
