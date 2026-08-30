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
    KNOWN_PLACEHOLDERS,
    _with_language_reminder,
    AgentClause,
    AgentTurn,
    ConversationManager,
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

    async def stream(self, messages: list[dict], tools: list[dict] | None = None):
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


async def test_stream_utterance_yields_clauses_then_the_completed_turn() -> None:
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm([LlmReply(content="கண்டிப்பா சார். Patient பேரு சொல்லுங்க?")])

    events = [event async for event in manager.stream_utterance("conn-1", llm, "book பண்ணணும்")]

    clauses = [event.text for event in events if isinstance(event, AgentClause)]
    assert clauses == ["கண்டிப்பா சார்.", "Patient பேரு சொல்லுங்க?"]
    assert isinstance(events[-1], AgentTurn)
    assert events[-1].text == "கண்டிப்பா சார். Patient பேரு சொல்லுங்க?"


async def test_turn_reports_an_identifier_no_tool_returned() -> None:
    """The parroted-exemplar failure, end to end through the manager."""
    manager = _make_manager()
    manager.start_call("conn-1", agent_name="Gayathri")
    llm = _ScriptedLlm([LlmReply(content="ஆமாம், MRN ARV-604417-னு இருக்கு. சரியா?")])

    events = [event async for event in manager.stream_utterance("conn-1", llm, "என் details check பண்ணுங்க")]

    assert events[-1].ungrounded == ("ARV-604417",)


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


def test_language_reminder_forbids_claiming_a_system_action() -> None:
    """The inverse of the guard this replaces.

    _LANGUAGE_REMINDER is appended after the caller's turn, immediately before
    generation - the last thing the model reads before deciding what to say.
    While there WAS a tool layer this message had to open by naming "call a
    tool", because a speech-only version read as "produce speech now" and
    suppressed tool calling entirely across a four-turn booking.

    There are no tools now, so the failure mode flips: the risk is the model
    saying it looked something up, booked something or knows an MRN, none of
    which it can do. That claim is the one thing this message must keep
    forbidding, and no other test would catch its removal - they all script
    the LLM's output rather than generating it.
    """
    from .conversation import _LANGUAGE_REMINDER

    lowered = _LANGUAGE_REMINDER.lower()
    assert "mrn" in lowered
    # It must forbid the invention...
    assert "never claim you already booked" in lowered
    # ...without inviting the refusal that invention-avoidance produced live:
    # the agent answered a booking request with "book பண்ண முடியாது".
    assert "never refuse the request itself" in lowered
    # And it must not resurrect the tool vocabulary it used to require.
    assert "call a tool" not in lowered



def test_no_facts_block_is_sent_when_the_server_knows_nothing() -> None:
    """A browser call opens knowing only the agent's own name, so the block
    used to be five labels with blanks after them plus a paragraph explaining
    what a blank meant - ~70 tokens of empty scaffolding on every turn, and it
    put "mrn:" in front of a model that is told never to say an MRN.

    What the caller said is not lost: the transcript sits directly above in the
    message list, which is where a conversational agent's memory lives.
    """
    manager = _make_manager()
    manager.start_call("conn-blank", agent_name="Gayathri")
    session = manager._sessions["conn-blank"]

    assert manager._turn_facts_message(session) == ""

    messages = _with_language_reminder(session.messages, manager._turn_facts_message(session))
    assert not any("KNOWN FACTS" in str(m.get("content") or "") for m in messages)


def test_a_fact_the_server_does_know_is_still_carried() -> None:
    """The inverse: a telephony leg knows the caller's number before the call
    is answered, and that must not be re-asked."""
    manager = _make_manager()
    manager.start_call("conn-known", agent_name="Gayathri", caller_mobile="9840721534")
    session = manager._sessions["conn-known"]

    facts = manager._turn_facts_message(session)
    assert "caller_mobile: 9840721534" in facts
    # ...and the labels that are still unknown stay out of the prompt entirely.
    assert "mrn:" not in facts
    assert "patient_name:" not in facts


def test_a_long_call_never_pushes_the_system_prompt_out_of_the_context_window() -> None:
    """The assembled prompt is ~3.5k tokens against num_ctx 8192, so a call has
    ~4.6k tokens of room for history and nothing used to bound it. Overflow
    makes Ollama truncate from the FRONT, taking the language rules with it -
    the agent switches to English and invents identifiers, silently. That is
    the exact failure backend/prompt_builder.py exists to prevent.

    Driven through stream_utterance rather than by calling the trimmer
    directly: an earlier version of this test exercised the helper alone and
    still passed with the call site deleted, which is a test that cannot fail.
    """
    import asyncio

    from .conversation import MAX_HISTORY_MESSAGES

    turns = 60
    manager = _make_manager()
    llm = _ScriptedLlm([LlmReply(content=f"பதில் {i}.") for i in range(turns)])
    manager.start_call("conn-long", agent_name="Gayathri")
    session = manager._sessions["conn-long"]
    system_prompt = session.messages[0]

    async def run() -> None:
        for i in range(turns):
            async for _event in manager.stream_utterance("conn-long", llm, f"கேள்வி {i}."):
                pass

    asyncio.run(run())

    assert len(session.messages) <= MAX_HISTORY_MESSAGES + 1, (
        f"history grew to {len(session.messages)} messages - it will truncate the system prompt"
    )
    # The one message that must never be dropped.
    assert session.messages[0] is system_prompt
    # ...and the most recent exchange survives, because that is the context the
    # next turn actually depends on.
    assert session.messages[-1]["content"] == f"பதில் {turns - 1}."
    assert session.messages[-2]["content"] == f"கேள்வி {turns - 1}."

    # The prompt the model was last handed must still be the system prompt,
    # intact and in position 0 - that is what overflow destroys.
    last_messages = llm.calls[-1]
    assert last_messages[0]["role"] == "system"
    assert last_messages[0]["content"] == session.messages[0]["content"]
    assert len(last_messages) <= MAX_HISTORY_MESSAGES + 3  # + facts/reminder tail


def test_the_english_caller_detector_counts_words_not_letters() -> None:
    """Switching the register on this was built and measured TWICE, and made
    things worse both times - prose alone only half-moved it and introduced
    parroting; an English worked example alongside the twenty Tamil ones
    produced ungrammatical output mixing both. So it is not wired in: a
    coherent Tamil answer beats a broken half-English one.

    The detector is kept because the measurement is the correct one and any
    future attempt needs it. This guards the part that was genuinely hard: a
    code-mixed TAMIL line must not read as English. "Cardiology-ல ஒரு
    appointment book பண்ணணும்" is 64% Latin BY CHARACTER, which is why the
    count is by word.
    """
    from .conversation import caller_is_speaking_english

    assert caller_is_speaking_english("Hello, I need to book an appointment.")
    assert caller_is_speaking_english("Sometime this weekend would be good.")

    assert not caller_is_speaking_english("Cardiology-ல ஒரு appointment book பண்ணணும்.")
    assert not caller_is_speaking_english("Report வந்துடுச்சா?")
    # A phone number is evidence of neither language.
    assert not caller_is_speaking_english("98407 21534")


def test_the_reminder_keeps_one_register_instruction() -> None:
    """After the mirroring revert, exactly one register rule reaches the model
    and no {{register}} placeholder survives unfilled."""
    from .conversation import _LANGUAGE_REMINDER, _with_language_reminder

    assert "{{register}}" not in _LANGUAGE_REMINDER
    assert "never pure English" in _LANGUAGE_REMINDER
    assert "HOW THIS SOUNDS IN ENGLISH" not in "".join(
        str(m["content"]) for m in _with_language_reminder([], "")
    )


# --- turn discipline: ONE question per turn (LLM_STACK.md Sec9 item 1) ---
#
# runtime_core.txt states this rule three ways in one line and the model breaks
# it anyway. These drive the real stream_utterance path rather than a helper,
# because the two guards written before this one initially PASSED with the
# code deleted.


async def test_a_second_question_is_never_spoken() -> None:
    manager = _make_manager()
    manager.start_call("conn-q", agent_name="Gayathri")
    # The exact shape recorded in call_events.db: two questions, two clauses,
    # with a non-question closing line behind them that must survive.
    llm = _ScriptedLlm(
        [
            LlmReply(
                content=(
                    "சரி சார். உங்க mobile number சொல்லுங்களா? "
                    "எந்த நாள் convenient? Desk-ல இருந்து call பண்ணுவாங்க."
                )
            )
        ]
    )

    events = [event async for event in manager.stream_utterance("conn-q", llm, "book பண்ணணும்")]
    clauses = [event.text for event in events if isinstance(event, AgentClause)]

    assert "எந்த நாள் convenient?" not in clauses, "the second question reached TTS"
    assert sum(clause.count("?") for clause in clauses) == 1
    # The closing line is not a question and must NOT be collateral damage -
    # a guard that truncated the tail would drop the whole handoff promise.
    assert "Desk-ல இருந்து call பண்ணுவாங்க." in clauses
    assert events[-1].text == " ".join(clauses)


async def test_history_records_what_was_spoken_not_what_was_generated() -> None:
    """Otherwise the model believes it asked a question the caller never heard."""
    manager = _make_manager()
    manager.start_call("conn-q2", agent_name="Gayathri")
    llm = _ScriptedLlm([LlmReply(content="Patient பேரு சொல்லுங்க? வயசு என்ன?")])

    async for _event in manager.stream_utterance("conn-q2", llm, "book பண்ணணும்"):
        pass

    said = manager._sessions["conn-q2"].messages[-1]
    assert said["role"] == "assistant"
    assert "வயசு என்ன?" not in said["content"]


async def test_one_question_per_turn_is_left_alone() -> None:
    """The guard must not fire on a well-formed turn."""
    manager = _make_manager()
    manager.start_call("conn-q3", agent_name="Gayathri")
    llm = _ScriptedLlm([LlmReply(content="கண்டிப்பா சார். Patient பேரு சொல்லுங்க?")])

    events = [event async for event in manager.stream_utterance("conn-q3", llm, "book பண்ணணும்")]

    assert events[-1].text == "கண்டிப்பா சார். Patient பேரு சொல்லுங்க?"
