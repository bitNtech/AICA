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

from .conversation import (
    HOLDING_LINE,
    KNOWN_PLACEHOLDERS,
    AgentClause,
    AgentTurn,
    ConversationManager,
    ToolInvoked,
    render_template,
)
from .llm import LlmReply, ReplyComplete, TextDelta, ToolCall
from .settings import ConversationSettings

TEMPLATE = "Hello {{agent_name}}, caller {{caller_mobile}} mrn {{mrn}} unknown {{bogus_var}}."


class _ScriptedLlm:
    """Returns replies from a script in order; records every messages/tools call.

    Implements stream(), the interface conversation.py actually consumes, and
    deliberately emits each reply's content in small fragments rather than one
    lump - a fake that yielded whole sentences would never exercise the clause
    chunker's job of reassembling a clause split across deltas, which is the
    part most likely to break.
    """

    def __init__(self, replies: list[LlmReply]) -> None:
        self._replies = list(replies)
        self.calls: list[list[dict]] = []

    async def stream(self, messages: list[dict], tools: list[dict]):
        self.calls.append([dict(m) for m in messages])
        reply = self._replies.pop(0)
        for index in range(0, len(reply.content), 7):
            yield TextDelta(reply.content[index : index + 7])
        yield ReplyComplete(reply)

    async def complete(self, messages: list[dict], tools: list[dict]) -> LlmReply:
        async for event in self.stream(messages, tools):
            if isinstance(event, ReplyComplete):
                return event.reply
        raise AssertionError("scripted stream produced no ReplyComplete")


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
    # Stub the builder rather than reading the real prompt files: these tests
    # assert conversation plumbing, not prompt content.
    manager.prompts._core = TEMPLATE
    manager.prompts._playbooks = {}
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

    # The holding line leads: the model called the tool having said nothing, so
    # that is what the caller actually heard first (see HOLDING_LINE).
    assert reply == f"{HOLDING_LINE} MRN ARV-118342, T. Nagar-ல இருக்கு. சரியா?"
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


# --- the ledger actually reaching the prompt (the bug this suite missed) ---


def _system_prompt_of(llm: _ScriptedLlm, call_index: int = -1) -> str:
    """Everything the model was told as a system message on that call.

    Not just messages[0]. The standing facts deliberately ride at the END of
    the message list rather than in the system prompt, because the system
    prompt is the cached prefix and mutating it re-evaluates ~2.7k tokens (see
    ConversationManager._system_prompt_for). What these tests care about is
    that the facts REACH the model, not which slot carries them.
    """
    return "\n".join(
        message["content"]
        for message in llm.calls[call_index]
        if message.get("role") == "system" and message.get("content")
    )


async def test_tool_results_reach_the_model_on_the_very_next_iteration() -> None:
    """What a tool just returned must be in front of the model immediately.

    It was not. The ledger accumulated the MRN and patient name while the
    prompt's KNOWN FACTS block was rendered from the call's opening metadata,
    so every slot stayed blank for the whole call - and that block tells the
    model in as many words that "a blank value means it is not yet known -
    discover it normally". The prompt was instructing the agent to go re-ask
    for what the server already held.

    The facts now ride at the END of the message list rather than in the system
    prompt (that is a caching fix, see _system_prompt_for), so this asserts
    they reached the model, not which message carried them.
    """
    manager = _make_manager()
    manager.prompts._core = "CORE"
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(content="", tool_calls=(ToolCall(id="c1", name="lookupPatient", arguments={"mobile": "9840721534"}),)),
            LlmReply(content="சரியா சார்?"),
        ]
    )

    await manager.handle_utterance("conn-1", llm, "98407 21534")

    # The call AFTER the lookup - the one that decides what to say next - must
    # already see the looked-up facts, not only the following turn.
    prompt = _system_prompt_of(llm)
    assert "mrn: ARV-118342" in prompt
    assert "patient_name: Murugesan" in prompt
    assert "caller_mobile: 9840721534" in prompt


async def test_the_cached_prompt_prefix_does_not_change_when_the_ledger_does() -> None:
    """messages[0] must stay byte-identical as facts accumulate.

    Ollama caches the evaluated prefix of a prompt, and it is a PREFIX cache:
    change one word near the top and everything behind it is evaluated again.
    Measured on this repo's ~2.7k-token prompt: an unchanged prefix costs 36 ms
    to evaluate, a prefix mutated by a single word costs 28,895 ms. The KNOWN
    FACTS block used to live in that prefix and changed every time a tool
    returned anything, so the turns that did real work were the ones that paid
    ~29s twice - once at the top of the turn and once inside the tool loop.

    If a future change puts anything call-specific back into the system prompt,
    this fails and the latency regression is caught here rather than in a
    two-hour eval run.
    """
    manager = _make_manager()
    manager.prompts._core = "CORE"
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(content="", tool_calls=(ToolCall(id="c1", name="lookupPatient", arguments={"mobile": "9840721534"}),)),
            LlmReply(content="சரியா சார்?"),
        ]
    )

    await manager.handle_utterance("conn-1", llm, "98407 21534")

    prefixes = {call[0]["content"] for call in llm.calls}
    assert len(prefixes) == 1, (
        "the system prompt changed mid-turn; every change re-evaluates the "
        "whole prompt instead of hitting Ollama's prefix cache"
    )
    # And the thing that changed instead is the cheap tail.
    assert "ARV-118342" not in llm.calls[-1][0]["content"]


async def test_established_facts_block_carries_ids_with_no_placeholder_slot() -> None:
    """An appointment ID has no {{placeholder}}, so without its own block it
    survives only in a tool message that scrolls away on a long call."""
    manager = _make_manager()
    manager.prompts._core = "CORE"
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(
                content="",
                tool_calls=(
                    ToolCall(
                        id="c1",
                        name="bookAppointment",
                        arguments={
                            "mrn": "ARV-118342",
                            "department": "Cardiology",
                            "doctor": "Dr. Ramanathan",
                            "date_time": "2026-09-05 17:00",
                        },
                    ),
                ),
            ),
            LlmReply(content="Book ஆயிடுச்சு."),
        ]
    )

    await manager.handle_utterance("conn-1", llm, "ஆமாம் book பண்ணுங்க")

    prompt = _system_prompt_of(llm)
    assert "ESTABLISHED THIS CALL" in prompt
    assert "appointment ID: APT-" in prompt


# --- streaming, tool events and call control ---


async def test_stream_utterance_yields_clauses_then_the_completed_turn() -> None:
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm([LlmReply(content="கண்டிப்பா சார். Patient பேரு சொல்லுங்க?")])

    events = [event async for event in manager.stream_utterance("conn-1", llm, "book பண்ணணும்")]

    clauses = [event.text for event in events if isinstance(event, AgentClause)]
    assert clauses == ["கண்டிப்பா சார்.", "Patient பேரு சொல்லுங்க?"]
    assert isinstance(events[-1], AgentTurn)
    assert events[-1].text == "கண்டிப்பா சார். Patient பேரு சொல்லுங்க?"


async def test_stream_utterance_reports_each_executed_tool() -> None:
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(content="", tool_calls=(ToolCall(id="c1", name="lookupPatient", arguments={"mobile": "9840721534"}),)),
            LlmReply(content="சரி."),
        ]
    )

    events = [event async for event in manager.stream_utterance("conn-1", llm, "98407 21534")]

    tools = [event for event in events if isinstance(event, ToolInvoked)]
    assert [tool.name for tool in tools] == ["lookupPatient"]
    assert tools[0].result["mrn"] == "ARV-118342"


async def test_hang_up_tool_ends_the_turn_with_a_call_control_action() -> None:
    """hangUp used to execute against the mock DB and change nothing, leaving
    the agent to say goodbye and then sit on an open socket forever."""
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(
                content="நன்றி சார். வணக்கம்.",
                tool_calls=(ToolCall(id="c1", name="hangUp", arguments={"reason": "completed"}),),
            )
        ]
    )

    events = [event async for event in manager.stream_utterance("conn-1", llm, "வேற ஒண்ணும் இல்ல")]

    turn = events[-1]
    assert isinstance(turn, AgentTurn)
    assert turn.call_control is not None
    assert turn.call_control.action == "hang_up"
    assert turn.call_control.detail == "completed"


async def test_transfer_call_tool_reports_the_destination_desk() -> None:
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(content="", tool_calls=(ToolCall(id="c1", name="transferCall", arguments={"desk": "billing"}),)),
            LlmReply(content="Billing desk-க்கு transfer பண்றேன்."),
        ]
    )

    events = [event async for event in manager.stream_utterance("conn-1", llm, "billing desk வேணும்")]

    turn = events[-1]
    assert isinstance(turn, AgentTurn)
    assert turn.call_control is not None
    assert turn.call_control.action == "transfer"
    assert turn.call_control.detail == "billing"


async def test_turn_reports_an_identifier_no_tool_returned() -> None:
    """The parroted-exemplar failure, end to end through the manager."""
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm([LlmReply(content="ஆமாம், MRN ARV-604417-னு இருக்கு. சரியா?")])

    events = [event async for event in manager.stream_utterance("conn-1", llm, "என் details check பண்ணுங்க")]

    assert events[-1].ungrounded == ("ARV-604417",)


async def test_a_looked_up_identifier_is_not_reported_as_invented() -> None:
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(content="", tool_calls=(ToolCall(id="c1", name="lookupPatient", arguments={"mobile": "9840721534"}),)),
            LlmReply(content="ஆமாம், MRN ARV-118342-னு இருக்கு. சரியா?"),
        ]
    )

    events = [event async for event in manager.stream_utterance("conn-1", llm, "98407 21534")]

    assert events[-1].ungrounded == ()


async def test_an_unbacked_ambulance_claim_gets_dispatched_server_side() -> None:
    """The phantom-ambulance failure (LLM_TEST_RESULTS.txt PART 7.3), closed.

    The model says the ambulance already left and calls no tool. Rather than
    only reporting that as a lie, the manager now makes it true: it calls
    dispatchAmbulance itself, using the caller's own utterance this turn as
    the address - exactly the shape the emergency exemplar demonstrates and
    every observed failure had (the address is given in the same turn the
    claim is made). The turn's unbacked_claims must come back empty, because
    the claim is no longer unbacked.
    """
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [LlmReply(content="Anna Nagar, 2nd street, number 8. Ambulance அனுப்பிட்டேன், இப்பவே கிளம்பிடுச்சு.")]
    )

    events = [
        event
        async for event in manager.stream_utterance(
            "conn-1", llm, "Anna Nagar, 2nd street, number 8."
        )
    ]

    invocations = [event for event in events if isinstance(event, ToolInvoked)]
    assert len(invocations) == 1
    assert invocations[0].name == "dispatchAmbulance"
    assert invocations[0].arguments == {"address": "Anna Nagar, 2nd street, number 8."}
    assert "eta_minutes" in invocations[0].result

    turn = events[-1]
    assert isinstance(turn, AgentTurn)
    assert turn.unbacked_claims == ()

    # The fallback call is now real history: the next turn's system prompt is
    # built from a session that actually contains a dispatchAmbulance result.
    session = manager._sessions["conn-1"]
    tool_names = {
        call["function"]["name"]
        for message in session.messages
        for call in (message.get("tool_calls") or [])
    }
    assert "dispatchAmbulance" in tool_names


async def test_a_real_dispatch_is_not_duplicated_by_the_fallback() -> None:
    """When the model calls the tool itself, the fallback must stay silent."""
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(
                content="",
                tool_calls=(ToolCall(id="c1", name="dispatchAmbulance", arguments={"address": "T. Nagar"}),),
            ),
            LlmReply(content="Ambulance அனுப்பிட்டேன், இப்பவே கிளம்பிடுச்சு."),
        ]
    )

    events = [event async for event in manager.stream_utterance("conn-1", llm, "T. Nagar")]

    invocations = [event for event in events if isinstance(event, ToolInvoked)]
    assert len(invocations) == 1  # the model's own call, not a second server-side one
    assert events[-1].unbacked_claims == ()


def test_record_interrupted_turn_keeps_history_honest_after_barge_in() -> None:
    """Barge-in cancels the turn mid-yield, so the assistant message is never
    appended and the model's next turn sees its own line answered by nothing."""
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    # Simulate a caller turn having been taken, so the last message is not the
    # greeting's own assistant line.
    manager._sessions["conn-1"].messages.append({"role": "user", "content": "slots என்ன?"})

    manager.record_interrupted_turn("conn-1", "Dr. Ramanathan-oda slots")

    assert manager._sessions["conn-1"].messages[-1] == {
        "role": "assistant",
        "content": "Dr. Ramanathan-oda slots",
    }


def test_record_interrupted_turn_ignores_blank_duplicate_and_unknown_calls() -> None:
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    before = len(manager._sessions["conn-1"].messages)

    manager.record_interrupted_turn("conn-1", "   ")
    # The greeting already left an assistant message last; appending another
    # would read as the agent taking two turns in a row.
    manager.record_interrupted_turn("conn-1", "something")
    manager.record_interrupted_turn("no-such-call", "something")

    assert len(manager._sessions["conn-1"].messages) == before


def test_language_reminder_offers_calling_a_tool_as_the_first_option() -> None:
    """Regression guard for a bug that silently disabled the whole tool layer.

    _LANGUAGE_REMINDER is appended after the caller's turn, immediately before
    generation. An earlier version spoke only about HOW TO SPEAK - language,
    turn length, one question - and the model read that as "produce speech
    now": across a four-turn booking it called zero tools and invented an MRN.
    Deleting the message entirely made lookupPatient fire on the first attempt.
    The fix is not to delete it (it exists to stop English drift) but to name
    calling a tool as one of the two things the model may do next.

    So: if this message ever stops mentioning tools, tool calling regresses to
    nothing and no other test in this suite would notice, because they all use
    a scripted LLM that calls tools on command.
    """
    from .conversation import _LANGUAGE_REMINDER

    assert "tool" in _LANGUAGE_REMINDER.lower()
    speech_rules = _LANGUAGE_REMINDER.lower().find("if you speak")
    tool_rule = _LANGUAGE_REMINDER.lower().find("tool")
    assert tool_rule < speech_rules, (
        "the tool clause must come before the speaking rules - it is the "
        "trailing speech instruction that suppresses tool calls"
    )


async def test_grounding_covers_speech_said_before_a_tool_call() -> None:
    """An invented ID in the pre-tool preamble counts too.

    The agent routinely speaks before it calls a tool ("ஒரு நிமிஷம் சார்,
    check பண்றேன்..."), which is wanted - it hides tool latency. But the turn
    used to be judged on the LAST LLM response only, so anything fabricated in
    that preamble was never examined.
    """
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(
                content="ஒரு நிமிஷம் சார், APT-99999-ஐ check பண்றேன்.",
                tool_calls=(ToolCall(id="c1", name="lookupPatient", arguments={"mobile": "9840721534"}),),
            ),
            LlmReply(content="கிடைச்சுடுச்சு சார்."),
        ]
    )

    events = [event async for event in manager.stream_utterance("conn-1", llm, "என் details")]

    turn = events[-1]
    assert "APT-99999" in turn.text, "the turn must report everything the caller heard"
    assert turn.ungrounded == ("APT-99999",)

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


async def test_a_silent_tool_call_gets_a_holding_line_so_the_caller_hears_something() -> None:
    """Measured dead air: the model called lookupPatient having said nothing, so
    the caller heard silence for the tool round-trip AND the reply after it."""
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(content="", tool_calls=(ToolCall(id="c1", name="lookupPatient", arguments={"mobile": "9840721534"}),)),
            LlmReply(content="ரவி குமார் சார்."),
        ]
    )

    events = [event async for event in manager.stream_utterance("conn-1", llm, "98407 21534")]

    spoken = [event.text for event in events if isinstance(event, AgentClause)]
    assert spoken[0] == HOLDING_LINE, f"caller heard nothing before the lookup: {spoken}"
    # Spoken before the tool ran, not after it - that is the whole point.
    assert events.index(next(e for e in events if isinstance(e, AgentClause))) < events.index(
        next(e for e in events if isinstance(e, ToolInvoked))
    )
    # History stays faithful to what the MODEL produced; the turn reports what
    # the CALLER heard.
    turn = next(event for event in events if isinstance(event, AgentTurn))
    assert HOLDING_LINE in turn.text
    session = manager._sessions["conn-1"]
    assert not any(HOLDING_LINE in (m.get("content") or "") for m in session.messages)


async def test_a_tool_call_the_model_already_spoke_for_gets_no_holding_line() -> None:
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(content="ஒரு நிமிஷம் சார். ", tool_calls=(ToolCall(id="c1", name="lookupPatient", arguments={"mobile": "9840721534"}),)),
            LlmReply(content="ரவி குமார் சார்."),
        ]
    )

    events = [event async for event in manager.stream_utterance("conn-1", llm, "98407 21534")]

    assert not any(isinstance(e, AgentClause) and e.text == HOLDING_LINE for e in events)


async def test_an_ambulance_dispatch_is_never_delayed_by_a_holding_line() -> None:
    """The emergency flow demands speed and 'say it is moving' - not 'one moment,
    I'll check the system'."""
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm(
        [
            LlmReply(content="", tool_calls=(ToolCall(id="c1", name="dispatchAmbulance", arguments={"address": "12 Anna Nagar"}),)),
            LlmReply(content="Ambulance கிளம்பிடுச்சு சார்."),
        ]
    )

    events = [event async for event in manager.stream_utterance("conn-1", llm, "நெஞ்சு வலி!")]

    assert not any(isinstance(e, AgentClause) and e.text == HOLDING_LINE for e in events)
