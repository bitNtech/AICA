"""Offline golden-flow eval: replay each golden/flows/flow_*.txt against the
live Conversation Manager + LLM and report whether the expected terminal tool
for that flow's INTENT actually fired somewhere during the replay.

Per BACKEND_COMPLETION.md Sec3.6: golden/flows/*.txt (20 files) +
golden/main_prompt.txt are currently inert reference/eval data - nothing
consumes them. This script is the "small offline eval script" called for
there: it parses each flow file, feeds only the CALLER turns' clean romanized
transliterations through ConversationManager.handle_utterance() in order
(never the corrupted Tamil-script lines - see parse_flow_file), and checks
the tool-call names that fired against a small INTENT -> expected-tool table.

Like smoke_llm.py/interactive_llm.py, this is a manual/dev script, NOT a
pytest test - it needs a real or locally-served OpenAI-compatible
LLM_BASE_URL to produce a meaningful run and is not meant for CI. It imports
and uses ConversationManager/LlmClient/tools exactly as they exist today,
reusing smoke_llm.py's _LoggingLlmClient logging shim (see
backend/scripts/interactive_llm.py for the same import pattern).

Each flow starts with NOTHING known but the agent's own name, so the agent has
to work the flow rather than assume it - see run_flow().

IMPORTANT - this is a heuristic signal only, not a strict pass/fail gate.
A small/weak local LLM (or one running on modest hardware) may legitimately
fail many of these flows today; that does not mean the harness is broken.
It exists so prompt/model changes going forward have a repeatable regression
signal, not to assert correctness right now.

Only parse_flow_file() is unit-testable without a model/network call - see
backend/test_golden_eval_parser.py.

Usage:
    python -m backend.scripts.golden_eval

Requires LLM_BASE_URL (default http://localhost:8001/v1) to point at a
running OpenAI-compatible chat-completions server.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from pathlib import Path
import re
import sys

# Windows consoles default to cp1252, which can't print Tamil script - force
# UTF-8 so this doesn't crash mid-run on the exact platform it's meant for.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from backend.conversation import ConversationManager
from backend.llm import LlmClient
from backend.scripts.smoke_llm import SAMPLE_METADATA, _LoggingLlmClient
from backend.settings import ConversationSettings, LlmSettings

# --------------------------------------------------------------------------
# Parsing: pure, deterministic, no model/network. See
# backend/test_golden_eval_parser.py for unit coverage against the real
# golden/flows/*.txt fixtures.
# --------------------------------------------------------------------------

# The flow files are corrupted by a bad PDF-text-extraction: Tamil-script
# lines are missing combining vowel signs/conjuncts (e.g. "ஹா ப ட ." instead
# of proper Tamil). This is systemic across all 20 files and is not something
# this parser tries to fix - it only ever extracts the clean romanized
# transliteration line(s) that follow each Tamil-script turn, never the
# Tamil itself.
_TAMIL_CHAR_RE = re.compile(r"[஀-௿]")
_FLOW_HEADER_RE = re.compile(r"^FLOW\s+(\d+)$")

_HEADER_FIELD_ORDER = ("INTENT", "SCENARIO", "ENTITIES", "OUTCOME")


@dataclass
class FlowSpec:
    flow_number: int
    title: str
    intent: str
    scenario: str
    entities: list[str]
    outcome: str
    caller_turns: list[str]


def _split_blocks(text: str) -> list[list[str]]:
    """Split file text into blank-line-delimited blocks of non-blank lines."""
    blocks: list[list[str]] = []
    current: list[str] = []
    for raw_line in text.splitlines():
        if raw_line.strip() == "":
            if current:
                blocks.append(current)
                current = []
        else:
            current.append(raw_line)
    if current:
        blocks.append(current)
    return blocks


def _join_header_field(lines: list[str], keyword: str, path: Path) -> str:
    first = lines[0].strip()
    if not first.startswith(keyword):
        raise ValueError(f"{path}: expected a {keyword!r} block, got {first!r}")
    rest = first[len(keyword):].strip()
    parts = [rest] if rest else []
    parts.extend(line.strip() for line in lines[1:])
    return " ".join(part for part in parts if part)


def _parse_turn_block(lines: list[str], path: Path) -> tuple[str, str]:
    """Return (role, romanized_text) for one AGENT/CALLER turn block.

    The tag (AGENT/CALLER) only ever appears on the block's first line, which
    is always the (possibly corrupted) Tamil-script rendering of the turn -
    even in the rare case where that line has no Tamil Unicode characters at
    all (e.g. a turn that is just a spoken phone number, where the corrupted
    "Tamil" line and the romanized line are identical digits). So the first
    line is always excluded from the romanized text regardless of its
    content. Tamil script can wrap onto further untagged lines; once a line
    with no Tamil characters is reached, that line and everything after it
    in the block is the (possibly also wrapped) romanized transliteration.
    """
    if not lines:
        raise ValueError(f"{path}: empty turn block")

    first = lines[0].strip()
    if first.startswith("AGENT"):
        role = "AGENT"
    elif first.startswith("CALLER"):
        role = "CALLER"
    else:
        raise ValueError(f"{path}: turn block does not start with AGENT/CALLER: {first!r}")

    romanized_lines = [
        line.strip() for index, line in enumerate(lines) if index > 0 and not _TAMIL_CHAR_RE.search(line)
    ]
    if not romanized_lines:
        raise ValueError(f"{path}: turn block has no romanized transliteration line: {lines!r}")

    return role, " ".join(part for part in romanized_lines if part)


def parse_flow_file(path: Path) -> FlowSpec:
    """Parse one golden/flows/flow_NN.txt file into a FlowSpec.

    Pure function: no model/network calls, safe to unit test directly (see
    backend/test_golden_eval_parser.py). caller_turns holds only the clean
    romanized transliteration of each CALLER turn, in order - the flow's own
    scripted AGENT turns (including the opening greeting, always the first
    turn in the file) are never included, since ConversationManager.start_call()
    produces the real greeting independently and the golden flow's own
    illustrative AGENT responses are not fed into anything.
    """
    text = path.read_text(encoding="utf-8")
    blocks = _split_blocks(text)
    if len(blocks) < 1 + len(_HEADER_FIELD_ORDER):
        raise ValueError(f"{path}: expected a header + {_HEADER_FIELD_ORDER} blocks, found {len(blocks)} blocks total")

    header = blocks[0]
    flow_match = _FLOW_HEADER_RE.match(header[0].strip())
    if not flow_match:
        raise ValueError(f"{path}: expected a 'FLOW NN' header line, got {header[0]!r}")
    flow_number = int(flow_match.group(1))
    title = header[1].strip() if len(header) > 1 else ""

    intent = _join_header_field(blocks[1], "INTENT", path)
    scenario = _join_header_field(blocks[2], "SCENARIO", path)
    entities_raw = _join_header_field(blocks[3], "ENTITIES", path)
    entities = [entity.strip() for entity in entities_raw.split(",") if entity.strip()]
    outcome = _join_header_field(blocks[4], "OUTCOME", path)

    # A couple of the source files have a stray blank line accidentally
    # splitting one turn's romanized-wrap line off from the rest of its turn
    # (e.g. flow_19.txt, the caller's second-to-last turn) - a known data
    # quality issue in the extraction, not a real turn boundary. Any block
    # that doesn't start with the AGENT/CALLER tag is therefore not a new
    # turn; merge it back onto the previous turn block before parsing.
    turn_blocks: list[list[str]] = []
    for block in blocks[5:]:
        first = block[0].strip()
        if first.startswith("AGENT") or first.startswith("CALLER"):
            turn_blocks.append(block)
        elif turn_blocks:
            turn_blocks[-1] = turn_blocks[-1] + block
        else:
            raise ValueError(f"{path}: turn block does not start with AGENT/CALLER: {first!r}")

    caller_turns: list[str] = []
    for block in turn_blocks:
        role, romanized_text = _parse_turn_block(block, path)
        if role == "CALLER":
            caller_turns.append(romanized_text)

    return FlowSpec(
        flow_number=flow_number,
        title=title,
        intent=intent,
        scenario=scenario,
        entities=entities,
        outcome=outcome,
        caller_turns=caller_turns,
    )


# --------------------------------------------------------------------------
# Harness: talks to a real (or real-shaped) LLM. Not unit tested - see the
# module docstring.
# --------------------------------------------------------------------------

# Manually verified against tools.py's actual tool names by cross-checking
# every flow in golden/main_prompt.txt Sec8's "Ends:" lines - do not
# re-derive this, it is the ground truth for "did the model call the right
# kind of tool for this flow." None means the flow is informational/has no
# single terminal tool expected (not scored as PASS/FAIL - see run_flow).
INTENT_EXPECTED_TOOL: dict[str, str | None] = {
    "appointment.book": "bookAppointment",
    "appointment.reschedule": "rescheduleAppointment",
    "appointment.cancel": "cancelAppointment",
    "appointment.confirm": "confirmAppointment",
    "prescription.refill": "raiseRefill",
    "medication.query": "createTicket",
    "lab.book": "bookLabOrder",
    "lab.result_inquiry": "resendReport",
    "referral.status": None,
    "insurance.query": "createPreAuth",
    "billing.query": "createTicket",
    "records.request": "logRecordsRequest",
    "patient.register": "registerPatient",
    "info.general": None,
    "appointment.followup": "bookAppointment",
    "clinical.triage": "bookAppointment",
    "postprocedure.checkin": None,
    "emergency.escalate": "dispatchAmbulance",
    "complaint.register": "createTicket",
    "complaint.escalation_angry": "escalate",
}


@dataclass
class FlowResult:
    spec: FlowSpec
    expected_tool: str | None
    observed_tools: list[str]
    verdict: str  # "PASS" | "FAIL" | "N/A"


async def run_flow(spec: FlowSpec, manager: ConversationManager, llm) -> FlowResult:
    """Replay one flow's caller turns and report which tools fired.

    Starts the call with NOTHING known but the agent's own name - deliberately.
    An earlier version seeded the session with smoke_llm.py's SAMPLE_METADATA,
    which pre-filled the caller's MRN, name and mobile into the ledger. That
    made this a much weaker gate than it looked: the agent already "knew" the
    identity, so lookupPatient and verifyIdentity had no reason to fire, and a
    model that never called an identity tool still looked fine. A real inbound
    call knows the caller's number at best. Starting blank is what forces the
    flow to be worked rather than assumed.
    """
    connection_id = f"golden-flow-{spec.flow_number:02d}"
    manager.start_call(connection_id, agent_name=SAMPLE_METADATA["agent_name"])

    for turn_text in spec.caller_turns:
        print(f"\n--- flow {spec.flow_number:02d} caller turn ---\n{turn_text}")
        try:
            reply = await manager.handle_utterance(connection_id, llm, turn_text)
        except Exception as error:
            print(f"    [handle_utterance failed: {error!r} - stopping this flow's replay here]")
            break
        print(f"    agent: {reply}")

    session = manager._sessions.get(connection_id)
    observed_tools: list[str] = []
    if session is not None:
        for message in session.messages:
            for tool_call in message.get("tool_calls") or []:
                observed_tools.append(tool_call["function"]["name"])
    manager.end_call(connection_id)

    expected_tool = INTENT_EXPECTED_TOOL.get(spec.intent)
    if spec.intent not in INTENT_EXPECTED_TOOL:
        verdict = "N/A"  # unmapped intent - not scored
    elif expected_tool is None:
        verdict = "N/A"  # informational flow, no terminal tool expected
    elif expected_tool in observed_tools:
        verdict = "PASS"
    else:
        verdict = "FAIL"

    return FlowResult(spec=spec, expected_tool=expected_tool, observed_tools=observed_tools, verdict=verdict)


async def main() -> None:
    llm_settings = LlmSettings()
    print(f"LLM_BASE_URL={llm_settings.base_url}  LLM_MODEL={llm_settings.model}")
    print(
        "\nHeuristic signal only, not a strict pass/fail gate: a small/weak "
        "local LLM may legitimately fail many of these flows until run "
        "against a properly-sized model on better hardware later.\n"
    )

    llm = LlmClient(llm_settings)
    llm.load()
    logging_llm = _LoggingLlmClient(llm)

    conversation_settings = ConversationSettings()
    manager = ConversationManager(conversation_settings)
    manager.load()

    flows_dir = conversation_settings.prompt_path.parent / "flows"
    flow_paths = sorted(flows_dir.glob("flow_*.txt"))
    if not flow_paths:
        print(f"No flow files found under {flows_dir}")
        return

    results: list[FlowResult] = []
    for path in flow_paths:
        spec = parse_flow_file(path)
        print(f"\n{'=' * 70}\nFLOW {spec.flow_number:02d}: {spec.title}  (intent={spec.intent})\n{'=' * 70}")
        result = await run_flow(spec, manager, logging_llm)
        results.append(result)

    print(f"\n\n{'=' * 70}")
    print("GOLDEN FLOW REPLAY SUMMARY - heuristic signal only, not a strict pass/fail gate")
    print("=" * 70)

    pass_count = fail_count = na_count = 0
    for result in results:
        expected = result.expected_tool or "n/a"
        fired = "yes" if result.expected_tool and result.expected_tool in result.observed_tools else "no"
        print(
            f"flow {result.spec.flow_number:02d} | intent={result.spec.intent:<28} "
            f"expected_tool={expected:<22} fired={fired:<3} verdict={result.verdict}"
        )
        if result.verdict == "PASS":
            pass_count += 1
        elif result.verdict == "FAIL":
            fail_count += 1
        else:
            na_count += 1

    print(f"\n{pass_count} PASS / {fail_count} FAIL / {na_count} N/A out of {len(results)} flows")
    print(
        "(Heuristic signal only, not a strict pass/fail gate - a small/weak "
        "local LLM may legitimately fail many of these until run against a "
        "properly-sized model on better hardware later.)"
    )


if __name__ == "__main__":
    asyncio.run(main())
