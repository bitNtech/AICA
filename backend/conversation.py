"""Conversation Manager: routes a caller transcript through the assembled
prompt, the LLM, and the mock tool layer, producing the agent's turn.

Per BACKEND_COMPLETION.md Sec3.1: the prompt is assembled per turn by
prompt_builder.py (condensed core + one flow playbook + that flow's exemplars),
and the ledger is real server-side state per connection_id - an in-process dict
for v1, since Redis only buys reconnect and multi-process, neither of which
exists yet.

stream_utterance() is the interface the live transports use: it yields each
clause as soon as it closes, so TTS can start speaking while the model is still
generating, then a final AgentTurn carrying the full text, any call-control
action (hangUp/transferCall) and the grounding verdict for the turn.
handle_utterance() is the same thing collapsed to a string, for the eval
scripts and tests that have no use for partial output.

The ledger is rendered INTO the prompt, not merely carried alongside it, and is
refreshed inside the tool loop - see _system_prompt_for(). Rendering it from
the call's opening metadata instead left the prompt's KNOWN FACTS block blank
all call, which told the model to go re-discover facts the server already held.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import json
import logging
import re

from .clause_chunker import ClauseChunker
from .grounding import (
    AMBULANCE_CLAIM as _AMBULANCE_CLAIM,
    grounding_sources,
    unbacked_action_claims,
    ungrounded_identifiers,
)
from .llm import LlmClient, LlmReply, ReplyComplete
from .prompt_builder import PromptBuilder, detect_intent
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

# Tool results carry two kinds of key. Some are facts the agent must not
# re-ask for and must read back verbatim (mrn, appointment_id, eta_minutes).
# The rest are per-call control flow - whether a lookup hit, whether a tool
# errored, the nested payloads (slot lists, bill line items) that are already
# in the tool message verbatim a few lines up in the history. Only the first
# kind belongs in the standing facts block: restating "found: True" every turn
# teaches the model nothing and spends tokens, and re-flattening a slot list
# into prose invites it to quote a slot that was never offered.
_LEDGER_CONTROL_KEYS = frozenset({"found", "error", "status", "verified", "reason"})

# Human-readable labels for the ledger keys the tools in tools.py actually
# return. A key with no entry here is still shown (falling back to the raw
# key) rather than dropped - a new tool returning a new fact should surface
# to the model immediately, not go silently missing until someone updates
# this table.
_LEDGER_LABELS: dict[str, str] = {
    "appointment_id": "appointment ID",
    "bill_number": "bill number",
    "cancellation_reference": "cancellation reference",
    "confirmation_status": "appointment confirmation",
    "dispatch_id": "ambulance dispatch ID",
    "escalation_id": "escalation ID",
    "eta_minutes": "ambulance ETA (minutes)",
    "order_id": "lab order ID",
    "policy_number": "policy number",
    "preauth_reference": "pre-authorisation reference",
    "refill_reference": "refill reference",
    "request_id": "records request ID",
    "sent_channel": "report sent via",
    "ticket_id": "ticket ID",
    "transferred_to": "call transferred to",
}

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


@dataclass(frozen=True)
class CallControl:
    """A tool call that ends or moves the call, not just records something.

    hangUp and transferCall are the two tools whose whole purpose is to change
    what the TRANSPORT does. Executing them against MockHospitalDb and moving
    on left the agent saying its goodbye and then sitting on an open socket
    forever, waiting for a caller who had been told the call was over. The
    transports (main.py, telephony.py) act on this; the mock DB result stays
    exactly as it was, so the model still sees a normal tool result.
    """

    action: str  # "hang_up" | "transfer"
    detail: str = ""


@dataclass(frozen=True)
class AgentClause:
    """One speakable clause of the agent's reply, released as soon as it closes."""

    text: str


@dataclass(frozen=True)
class ToolInvoked:
    """One executed tool call, surfaced so a transport can show/persist it.

    The tool layer is where an agent turn is most opaque and most worth
    watching: "which tool fired, with what arguments, and what came back" is
    the difference between a reply that is grounded and one that is invented.
    Yielding it makes that visible in the console and durable in the call-event
    store, instead of only in server logs.
    """

    name: str
    arguments: dict
    result: dict


@dataclass(frozen=True)
class AgentTurn:
    """The completed turn: everything said, plus any call-control action."""

    text: str
    call_control: CallControl | None = None
    # IDs/phone numbers the agent stated that no tool, no caller turn and no
    # standing fact accounts for - see backend/grounding.py. Empty is the
    # expected case; anything here is a fabrication the caller was just told.
    ungrounded: tuple[str, ...] = ()
    # Actions the agent claimed to have COMPLETED with no tool call behind
    # them - "Ambulance அனுப்பிட்டேன்" having dispatched nothing. Separate from
    # `ungrounded` because there is no invented identifier to point at: the
    # sentence is a lie about what the server did, not about what it knows.
    unbacked_claims: tuple[str, ...] = ()


# Tool name -> the call-control action executing it implies.
_CALL_CONTROL_TOOLS: dict[str, str] = {"hangUp": "hang_up", "transferCall": "transfer"}

# Said only when the model calls a tool having spoken nothing at all this turn.
# Word for word what runtime_core.txt's TOOLS section already asks for before a
# lookup, so this is the prompt's own line rather than a new invention - and it
# is honest, because the tool call it promises is the very next thing that runs.
HOLDING_LINE = "ஒரு நிமிஷம் சார், system-ல check பண்றேன்..."

# Tools that must never be preceded by HOLDING_LINE. An ambulance dispatch is
# the one flow where the prompt demands speed and a said-out-loud confirmation
# instead ("say it is moving"), and announcing a system check before hanging up
# or transferring contradicts the goodbye the model just gave.
_NO_HOLDING_LINE = frozenset({"dispatchAmbulance", *_CALL_CONTROL_TOOLS})


@dataclass
class CallSession:
    connection_id: str
    metadata: dict[str, str]
    ledger: dict[str, object] = field(default_factory=dict)
    messages: list[dict] = field(default_factory=list)
    # Set when the model calls hangUp/transferCall; read by the transport once
    # the turn's remaining speech has actually been sent, so the agent's
    # closing line is not cut off by its own hang-up.
    call_control: CallControl | None = None
    # Sticky across turns: a caller states their reason once, then answers
    # follow-up questions ("ஆமாம்", a phone number) that match no trigger at
    # all. Re-detecting per turn would drop the playbook mid-flow, so a new
    # detection replaces this and silence leaves it alone (Sec6E).
    intent: str | None = None

    def known_facts(self) -> dict[str, str]:
        """Placeholder substitutions for this turn: opening metadata, overlaid
        by anything the ledger has since learned.

        Ledger wins on conflict: a tool result is a fresher, better-grounded
        source than whatever the call opened with (a CRM guess from caller ID,
        say). A blank/None ledger value never overwrites a real metadata one,
        so a tool returning `{"mrn": None}` cannot erase a known MRN.
        """
        facts = dict(self.metadata)
        for key in KNOWN_PLACEHOLDERS:
            value = self.ledger.get(key)
            if value not in (None, ""):
                facts[key] = str(value)
        return facts


def _format_established_facts(session: CallSession) -> str:
    """Render the non-placeholder ledger facts as a standing block.

    KNOWN FACTS in the core prompt only has slots for the seven caller-identity
    placeholders. Everything else a call establishes - the appointment ID just
    booked, the ticket number just raised, the ambulance ETA - has no slot, and
    lives only in a tool message that scrolls further back with every turn. On
    a long call that is exactly how an agent ends up inventing a reference ID
    at closing time, which the prompt's GROUNDING section forbids outright. So
    the facts ride at the front of every turn instead, where they cannot scroll
    away.
    """
    lines = []
    for key, value in session.ledger.items():
        if key in KNOWN_PLACEHOLDERS or key in _LEDGER_CONTROL_KEYS:
            continue
        # Scalars only. Nested payloads (slot lists, bill line items) are
        # already verbatim in their tool message; flattening them to prose here
        # would both duplicate tokens and blur which values a tool actually
        # returned - the thing GROUNDING most needs kept sharp.
        if not isinstance(value, (str, int, float, bool)) or value in (None, ""):
            continue
        lines.append(f"{_LEDGER_LABELS.get(key, key)}: {value}")

    if not lines:
        return ""
    return (
        "\n## ESTABLISHED THIS CALL — say these back exactly, never re-ask, never re-invent\n"
        + "\n".join(lines)
    )


class ConversationManager:
    """Owns the prompt builder, per-call sessions, and the shared mock hospital DB."""

    def __init__(self, settings: ConversationSettings) -> None:
        self.settings = settings
        self.prompts = PromptBuilder(
            settings.runtime_core_path, settings.prompt_path, settings.exemplars_path
        )
        self.db = MockHospitalDb()
        self._sessions: dict[str, CallSession] = {}

    @property
    def ready(self) -> bool:
        return self.prompts.ready

    def load(self) -> None:
        """Read the prompts once during startup, keeping call-time latency low."""
        self.prompts.load()

    def start_call(self, connection_id: str, **metadata: str) -> str:
        """Open a new call session and return the scripted greeting (Sec5A - no LLM call)."""
        if not self.prompts.ready:
            raise RuntimeError("ConversationManager prompt is not loaded")

        greeting = render_template(OPENING_LINE, metadata)
        session = CallSession(
            connection_id=connection_id,
            metadata=dict(metadata),
            ledger=dict(metadata),
            # The system message is a placeholder here and rewritten every turn
            # by _refresh_system_prompt() once the flow is known - index 0 is
            # reserved for it so history stays append-only.
            messages=[
                {"role": "system", "content": ""},
                {"role": "assistant", "content": greeting},
            ],
        )
        session.messages[0]["content"] = self._system_prompt_for(session)
        self._sessions[connection_id] = session
        return greeting

    async def prewarm(self, connection_id: str, llm: LlmClient) -> bool:
        """Evaluate this call's prompt while the caller is hearing the greeting.

        The greeting is a fixed line spoken with no LLM involvement at all, and
        it takes roughly three seconds of audio to say. For those three seconds
        the model is idle while the caller is occupied - which is exactly long
        enough to pay the one cost that cannot be cached away.

        That cost is the first prompt evaluation. Ollama caches the evaluated
        prefix of a prompt, so the SECOND turn onwards is nearly free (measured
        294 ms), but the first turn of a call has to evaluate ~2.7k tokens cold
        and that measured 6-8 seconds - the single largest contributor to
        first-turn latency. Doing it here moves it off the critical path and
        underneath audio the caller is already listening to.

        Generates one token, which is the smallest amount of work that still
        forces a full prompt evaluation. The result is thrown away; the point
        is the server-side cache it leaves behind.

        Best effort by design. A prewarm that fails, times out or is cancelled
        must never affect the call - the turn that follows simply pays the cold
        cost it would have paid anyway, so every failure mode here degrades to
        "no faster than before".
        """
        session = self._sessions.get(connection_id)
        if session is None:
            return False

        try:
            messages = _with_language_reminder(
                session.messages, self._turn_facts_message(session)
            )
            async for event in llm.stream(messages, TOOL_SCHEMAS, max_tokens=1):
                if isinstance(event, ReplyComplete):
                    break
        except asyncio.CancelledError:
            # The caller spoke before the warm finished. Their turn owns the
            # model now; drop this quietly rather than racing it.
            raise
        except Exception as error:
            logger.info("prompt prewarm for %s did not complete (%s)", connection_id, error)
            return False

        logger.info("prompt prewarmed for %s", connection_id)
        return True

    def _system_prompt_for(self, session: CallSession) -> str:
        """The STATIC half of the prompt: rules, playbook, exemplars.

        Deliberately rendered against the call's OPENING metadata, which is
        fixed at start_call, rather than against the live ledger - so this text
        changes only when the detected flow changes, and is byte-identical
        across the turns in between.

        That matters for one measured reason. Ollama caches the evaluated
        prefix of a prompt, and the cache is a prefix cache: mutate one word
        near the top and everything behind it is evaluated again. On this box,
        with this ~2.7k-token prompt:

            identical prefix          36 ms
            prefix mutated by a word  28,895 ms

        The live ledger is exactly what mutates - a tool returns an MRN and the
        KNOWN FACTS block changes - so rendering it in HERE re-evaluated the
        whole prompt on every turn that learned anything, and twice on any turn
        with a tool call, since the prompt is refreshed inside the tool loop.

        The ledger still reaches the model, and still reaches it on the
        iteration right after the lookup (the PART 6 fix this must not undo) -
        it is just carried by _turn_facts_message() at the END of the message
        list, where changing it costs a hundred tokens instead of three
        thousand. Later is also strictly better for recency, which is the same
        reasoning that put _LANGUAGE_REMINDER last.
        """
        return render_template(self.prompts.build(session.intent), dict(session.metadata))

    def _turn_facts_message(self, session: CallSession) -> str:
        """The VOLATILE half: what this call has actually established so far.

        Rendered fresh every turn and appended near the end of the message
        list. See _system_prompt_for for why it is not in the system prompt.
        """
        facts = session.known_facts()
        lines = [
            "## KNOWN FACTS — already verified, never ask for these again",
            f"caller_name: {facts.get('caller_name', '')}",
            f"caller_mobile: {facts.get('caller_mobile', '')}",
            f"mrn: {facts.get('mrn', '')}",
            f"patient_name: {facts.get('patient_name', '')}",
            f"last_visit: {facts.get('last_visit', '')}",
            "A blank value means it is not yet known — discover it normally. "
            "Never say a label or a blank aloud.",
        ]
        prompt = "\n".join(lines)
        established = _format_established_facts(session)
        if established:
            prompt = f"{prompt}\n{established}\n"
        return prompt

    def end_call(self, connection_id: str) -> None:
        self._sessions.pop(connection_id, None)

    async def handle_utterance(self, connection_id: str, llm: LlmClient, text: str) -> str:
        """Run one caller turn and return the agent's full reply text.

        Kept for callers with no use for partial output - the eval scripts and
        the unit tests. Live transports should use stream_utterance() instead,
        so the first clause reaches TTS without waiting for the last token.
        """
        spoken: list[str] = []
        async for event in self.stream_utterance(connection_id, llm, text):
            if isinstance(event, AgentTurn):
                return event.text
            if isinstance(event, AgentClause):
                spoken.append(event.text)
        # stream_utterance always ends with an AgentTurn; this is unreachable
        # short of a generator being closed early by its consumer.
        return " ".join(spoken)

    def _check_grounding(self, session: CallSession, reply: str) -> tuple[str, ...]:
        """Flag identifiers in `reply` that nothing in this call accounts for."""
        # Sources are tool results and caller turns (grounding_sources), plus
        # the facts this call actually holds. NOT the system prompt: it carries
        # the few-shot exemplars, whose worked example includes an MRN, and
        # treating that as provenance is exactly how a parroted exemplar passes
        # for a lookup. See backend/grounding.py.
        sources = grounding_sources(session.messages)
        sources += [str(value) for value in session.ledger.values() if value not in (None, "")]
        sources += [str(value) for value in session.metadata.values() if value not in (None, "")]
        invented = ungrounded_identifiers(reply, sources)
        if invented:
            logger.error(
                "GROUNDING: %s stated identifier(s) no tool returned: %s",
                session.connection_id,
                ", ".join(invented),
            )
        return tuple(invented)

    def _check_action_claims(self, session: CallSession, reply: str) -> tuple[str, ...]:
        """Flag actions `reply` says are done that no tool in this call did."""
        called = {
            call["function"]["name"]
            for message in session.messages
            for call in (message.get("tool_calls") or [])
        }
        claims = unbacked_action_claims(reply, called)
        if claims:
            logger.error(
                "UNBACKED CLAIM: %s %s - no tool call behind it",
                session.connection_id,
                "; ".join(claims),
            )
        return tuple(claims)

    def _dispatch_ambulance_fallback(
        self, session: CallSession, connection_id: str, caller_text: str
    ) -> ToolInvoked | None:
        """Actually send the ambulance the agent just told the caller was sent.

        LLM_TEST_RESULTS.txt PART 7.3: given a chest-pain call and an address,
        the model says "Ambulance அனுப்பிட்டேன், இப்பவே கிளம்பிடுச்சு" (I have
        sent an ambulance, it has left right now) and calls dispatchAmbulance
        approximately never. Three separate prompt fixes failed to move it -
        runtime_core.txt's EMERGENCY section, its GROUNDING section, and
        _LANGUAGE_REMINDER (the last one also caused degenerate repetition and
        was reverted) - so this stops being a thing the prompt is trusted to
        get right. Left alone, this is worse than a wrong ID: there is no
        invented identifier for backend/grounding.py's other check to catch,
        and the caller stops looking for help because they were just told help
        is coming.

        Scoped deliberately to this one claim, not a general "auto-call
        whatever the model claims" mechanism: dispatchAmbulance takes exactly
        one required argument, and every observed failure (and the exemplar
        that demonstrates the correct shape) has the caller state the address
        in the SAME turn the agent claims the dispatch - it is `caller_text`,
        the utterance this call of stream_utterance is already handling. Other
        claims (a booking made, a ticket raised) need arguments - a
        department, a specific slot among several offered - that are not
        similarly unambiguous, so auto-completing THOSE is left as the
        product decision the handoff calls it, not silently done here.

        Runs against MockHospitalDb, same as a model-issued call would; this
        only supplies the call the model failed to make, not a new capability.
        """
        address = caller_text.strip()
        if not address:
            return None
        arguments = {"address": address}
        result = execute_tool(self.db, "dispatchAmbulance", arguments)
        session.ledger.update(result)
        call_id = f"auto-dispatch-{len(session.messages)}"
        session.messages.append(
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": call_id,
                        "type": "function",
                        "function": {
                            "name": "dispatchAmbulance",
                            "arguments": json.dumps(arguments, ensure_ascii=False),
                        },
                    }
                ],
            }
        )
        session.messages.append(
            {"role": "tool", "tool_call_id": call_id, "content": json.dumps(result, ensure_ascii=False)}
        )
        logger.warning(
            "AUTO-DISPATCH: %s server dispatched an ambulance to %r - the agent "
            "had already told the caller this was done, with no tool call behind it",
            connection_id,
            address,
        )
        return ToolInvoked(name="dispatchAmbulance", arguments=arguments, result=dict(result))

    def record_interrupted_turn(self, connection_id: str, spoken: str) -> None:
        """Append what the agent actually got out before the caller cut in.

        Barge-in cancels the task consuming stream_utterance(), which can land
        on a yield - leaving the turn's assistant message never appended, so
        the model's next turn sees the caller's line answered by nothing at
        all. Recording the truncated text keeps the history honest: the model
        should believe it said exactly what the caller heard, no more, so it
        can pick up mid-thought rather than start the same sentence again.
        """
        session = self._sessions.get(connection_id)
        if session is None:
            return
        text = spoken.strip()
        if not text:
            return
        if session.messages and session.messages[-1].get("role") == "assistant":
            return
        session.messages.append({"role": "assistant", "content": text})

    async def stream_utterance(self, connection_id: str, llm: LlmClient, text: str):
        """Run one caller turn, yielding each clause as soon as it closes.

        Yields zero or more AgentClause, then exactly one AgentTurn carrying
        the full text and any call-control action.

        Clauses are released optimistically, before it is known whether this
        LLM response will also carry a tool call. That is deliberate and
        matches how the golden flows actually sound: the agent says "ஒரு
        நிமிஷம் சார், system-ல check பண்றேன்..." and THEN does the lookup, so
        speech preceding a tool call is the wanted behaviour, not a mistake to
        guard against. It is also what hides tool latency from the caller.
        """
        session = self._sessions.get(connection_id)
        if session is None:
            raise RuntimeError(f"no active call session for {connection_id}")

        detected = detect_intent(text)
        if detected is not None and detected != session.intent:
            logger.info("flow detected for %s: %s", connection_id, detected)
            session.intent = detected
        session.messages[0]["content"] = self._system_prompt_for(session)

        session.messages.append({"role": "user", "content": text})

        spoken: list[str] = []
        for _ in range(self.settings.max_tool_iterations):
            chunker = ClauseChunker()
            reply: LlmReply | None = None

            # Rebuilt every iteration on purpose: the iteration right after a
            # lookupPatient is the first consumer of what it returned.
            facts = self._turn_facts_message(session)
            async for event in llm.stream(
                _with_language_reminder(session.messages, facts), TOOL_SCHEMAS
            ):
                if isinstance(event, ReplyComplete):
                    reply = event.reply
                    break
                for clause in chunker.feed(event.text):
                    spoken.append(clause)
                    yield AgentClause(clause)

            if reply is None:
                raise RuntimeError("LLM stream ended without a ReplyComplete event")

            # The chunker never closes a clause on buffer-end (see
            # clause_chunker.py), so the reply's last clause only exists once
            # the stream is done and we ask for it.
            remainder = chunker.flush()
            if remainder:
                spoken.append(remainder)
                yield AgentClause(remainder)

            if not reply.tool_calls:
                # History keeps this response's own content, so the transcript
                # sent to the model stays faithful to what it produced. The
                # TURN, though, is everything the caller heard this turn -
                # including any preamble spoken before a tool call in an
                # earlier iteration. Grounding has to see all of it: an
                # invented ID is just as invented when it lands in "ஒரு
                # நிமிஷம் சார், MRN ... check பண்றேன்" before the lookup as
                # when it lands in the answer after it.
                session.messages.append({"role": "assistant", "content": reply.content})
                spoken_text = " ".join(spoken)
                unbacked_claims = self._check_action_claims(session, spoken_text)
                if _AMBULANCE_CLAIM in unbacked_claims:
                    invoked = self._dispatch_ambulance_fallback(session, connection_id, text)
                    if invoked is not None:
                        yield invoked
                        unbacked_claims = self._check_action_claims(session, spoken_text)
                yield AgentTurn(
                    text=spoken_text,
                    call_control=session.call_control,
                    ungrounded=self._check_grounding(session, spoken_text),
                    unbacked_claims=unbacked_claims,
                )
                return

            if not spoken and not any(call.name in _NO_HOLDING_LINE for call in reply.tool_calls):
                # Dead air. Measured: a lookupPatient turn where the model
                # produced no text at all, so the caller heard silence for the
                # whole tool round-trip AND for the generation that followed
                # it - the two slowest things in a turn, back to back, with
                # nothing over them. Deliberately not appended to
                # session.messages: history stays faithful to what the model
                # itself produced (see the comment above), while `spoken` is
                # what the caller actually heard, which is what grounding and
                # the call log need.
                spoken.append(HOLDING_LINE)
                yield AgentClause(HOLDING_LINE)

            session.messages.append(_assistant_tool_call_message(reply))
            for call in reply.tool_calls:
                result = execute_tool(self.db, call.name, call.arguments)
                session.ledger.update(result)
                action = _CALL_CONTROL_TOOLS.get(call.name)
                if action is not None:
                    detail = str(call.arguments.get("desk") or call.arguments.get("reason") or "")
                    session.call_control = CallControl(action=action, detail=detail)
                    logger.info("call control requested for %s: %s %s", connection_id, action, detail)
                session.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )
                yield ToolInvoked(name=call.name, arguments=dict(call.arguments), result=dict(result))

            # The facts the loop just learned reach the next iteration through
            # _turn_facts_message(), which is rebuilt at the top of every
            # iteration - so the iteration that follows a lookupPatient still
            # sees the MRN and patient name it returned, which is the whole
            # point of refreshing inside the loop rather than once per turn.
            #
            # messages[0] is deliberately NOT rewritten here any more. It is
            # static for the flow, and rewriting it with a changed ledger is
            # what threw away the prefix cache and cost ~29s of prompt
            # re-evaluation on exactly the turns that had done a tool call.

            # hangUp is terminal: the prompt's CLOSING section says "do not
            # speak after the tool call", so there is nothing left for another
            # iteration to produce and looping again would only invite the
            # model to talk past its own goodbye.
            if session.call_control is not None and session.call_control.action == "hang_up":
                full_text = " ".join(spoken)
                yield AgentTurn(
                    text=full_text,
                    call_control=session.call_control,
                    ungrounded=self._check_grounding(session, full_text),
                    unbacked_claims=self._check_action_claims(session, full_text),
                )
                return

        logger.error("tool-call loop did not terminate within %d iterations for %s", self.settings.max_tool_iterations, connection_id)
        raise RuntimeError("LLM tool-call loop did not terminate")


# Recency beats distance: a small model reliably drifts into pure English by
# the third or fourth turn even with the language rules in the system message,
# because those sit thousands of tokens back while the recent turns are the
# strongest signal. This rides immediately before generation, costs ~40 tokens,
# and is not stored in history - so it never accumulates across a long call.
_LANGUAGE_REMINDER = (
    # It MUST open with the tool clause. This message sits after the caller's
    # turn, immediately before generation, and an earlier version of it talked
    # only about how to speak - which read to the model as "produce speech now"
    # and suppressed tool calling completely. Measured, not guessed: with that
    # version the agent never called a single tool across a four-turn booking
    # and invented an MRN; with the message removed entirely, lookupPatient
    # fired on the first attempt and the agent read back the real record. So
    # the reminder earns its place only if it names calling a tool as one of
    # the two things the model may do next.
    "[Next you may either call a tool or speak. If you need a fact you do not "
    "already have from a tool result in THIS call - an MRN, an address, a "
    "slot, a bill, a report - call the tool now; do not answer from memory. "
    # The speaking rules below are ordered by how often each is actually
    # broken, measured with backend/scripts/register_eval.py on unseen
    # scenarios - most-violated first, not most important-sounding first.
    "If you speak: ONE question per turn - never two - and put it last. "
    "Under 40 words. Never repeat the caller's own sentence back at them. "
    "Reply in spoken Chennai Tamil (Tamil script) code-mixed with English "
    "hospital words in Latin script - never pure English. "
    "If the caller speaks English, mirror them but keep சார்/மேடம். "
    "Never invent an ID, number or name.]"
)


def _with_language_reminder(messages: list[dict], facts: str = "") -> list[dict]:
    """Append this turn's volatile context, then the reminder.

    Order is load-bearing in two directions. The facts go AFTER the history so
    that changing them re-evaluates a hundred tokens instead of the three
    thousand sitting in front of them (see _system_prompt_for). The reminder
    stays LAST, because that is the message the model reads immediately before
    it decides whether to call a tool or speak - see the comment on
    _LANGUAGE_REMINDER, and the regression test that guards it.
    """
    tail: list[dict] = []
    if facts:
        tail.append({"role": "system", "content": facts})
    tail.append({"role": "system", "content": _LANGUAGE_REMINDER})
    return [*messages, *tail]


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
