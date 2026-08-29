"""Covers the intent router and the core+playbook assembly.

The point of these tests is the property that makes the runtime prompt safe to
shrink: whatever the router does, the language/safety rules are always present,
and only the flow-specific playbook varies.
"""

from __future__ import annotations

from pathlib import Path
import re

import pytest

from backend.prompt_builder import (
    DEFAULT_FLOW,
    EMERGENCY_INTENT,
    PromptBuilder,
    detect_intent,
    parse_flow_playbooks,
)

_REPO_ROOT = Path(__file__).resolve().parent.parent
_MASTER_PROMPT = _REPO_ROOT / "golden" / "main_prompt.txt"
_RUNTIME_CORE = _REPO_ROOT / "golden" / "runtime_core.txt"
_TAMIL_RE = re.compile(r"[஀-௿]")


@pytest.mark.parametrize(
    ("utterance", "expected"),
    [
        ("Cardiology-ல ஒரு appointment book பண்ணணும்.", "appointment.book"),
        ("appointment-ஐ postpone பண்ணணும்", "appointment.reschedule"),
        ("நாளைக்கு dermatology appointment cancel பண்ணிடுங்க", "appointment.cancel"),
        ("tablets தீர்ந்துடுச்சு, refill வேணும்", "prescription.refill"),
        ("doctor test எழுதி கொடுத்திருக்காரு", "lab.book"),
        ("நேத்து test பண்ணேன், report வந்துடுச்சா?", "lab.result_inquiry"),
        ("gall bladder surgery insurance-ல cover ஆகுமா", "insurance.query"),
        ("discharge bill-ல ஒரு charge ரெண்டு தடவை", "billing.query"),
        ("என் அப்பாவோட case sheet records வேணும்", "records.request"),
        ("visiting hours என்ன?", "info.general"),
        ("மூணு நாளா காய்ச்சல் விடமாட்டேங்குது", "clinical.triage"),
        ("என் அப்பாவுக்கு நெஞ்சு வலி, மூச்சு வாங்குது", EMERGENCY_INTENT),
        ("ரெண்டு மணி நேரம் காக்க வெச்சீங்க, staff மோசமா பேசுனாங்க", "complaint.register"),
        ("இது மூணாவது தடவை call பண்றது, என் பணம் இன்னும் வரல", "complaint.escalation_angry"),
    ],
)
def test_detect_intent_routes_caller_words_to_the_right_flow(utterance: str, expected: str) -> None:
    assert detect_intent(utterance) == expected


def test_detect_intent_returns_none_for_a_bare_acknowledgement() -> None:
    # A bare "yes" must NOT re-route: conversation.py keeps the previous flow
    # sticky precisely because these carry no trigger at all.
    assert detect_intent("ஆமாம் சரி தான்") is None
    assert detect_intent("98407 21534") is None


def test_emergency_outranks_a_flow_mentioned_in_the_same_breath() -> None:
    # Sec6A: the emergency override outranks everything, including an explicit
    # billing/appointment intent stated in the same sentence.
    assert detect_intent("bill பத்தி கேட்கணும், ஆனா அப்பாவுக்கு நெஞ்சு வலி") == EMERGENCY_INTENT


def test_parse_flow_playbooks_finds_all_twenty_flows() -> None:
    playbooks = parse_flow_playbooks(_MASTER_PROMPT.read_text(encoding="utf-8"))

    assert len(playbooks) == 20
    assert {p.flow_number for p in playbooks.values()} == set(range(1, 21))
    assert playbooks["emergency.escalate"].flow_number == 18
    # Section 9 must not bleed into the last flow's body.
    assert "CLINICAL AND FACTUAL SAFETY" not in playbooks["complaint.escalation_angry"].body


_EXEMPLARS = _REPO_ROOT / "golden" / "flow_exemplars.json"


def _loaded_builder(with_exemplars: bool = False) -> PromptBuilder:
    builder = PromptBuilder(_RUNTIME_CORE, _MASTER_PROMPT, _EXEMPLARS if with_exemplars else None)
    builder.load()
    return builder


def test_every_flow_has_few_shot_exemplars() -> None:
    # A flow missing exemplars is the one most likely to drift into English,
    # so this is a real gap rather than a cosmetic one.
    builder = _loaded_builder(with_exemplars=True)

    assert set(builder._playbooks) <= set(builder._exemplars)


def test_exemplars_are_code_mixed_and_short() -> None:
    builder = _loaded_builder(with_exemplars=True)

    for intent, block in builder._exemplars.items():
        agent_lines = [line[4:] for line in block.splitlines() if line.startswith("YOU:")]
        assert agent_lines, f"{intent} has no agent exemplar turns"
        for line in agent_lines:
            assert _TAMIL_RE.search(line), f"{intent} exemplar is not in Tamil script: {line}"
            assert len(line.split()) <= 45, f"{intent} exemplar exceeds the 40-word turn limit: {line}"
            assert line.count("?") <= 1, f"{intent} exemplar asks more than one question: {line}"


def test_build_includes_only_the_active_flows_exemplars() -> None:
    builder = _loaded_builder(with_exemplars=True)

    booking = builder.build("appointment.book")

    assert "HOW A REAL CALL SOUNDS" in booking
    assert "Dr. Ramanathan senior interventional cardiologist" in booking
    # Another flow's exemplar must not leak in and pull the model off-flow.
    assert "Ambulance அனுப்பிட்டேன்" not in booking


def test_build_attaches_only_the_active_flows_playbook() -> None:
    builder = _loaded_builder()

    booking = builder.build("appointment.book")
    emergency = builder.build(EMERGENCY_INTENT)

    assert "bookAppointment ⇒ appointment ID" in booking
    assert "dispatchAmbulance" not in booking.split("PLAYBOOK")[1]
    assert "Take the ADDRESS FIRST" in emergency


def test_build_always_carries_the_language_and_safety_rules() -> None:
    builder = _loaded_builder()

    for intent in [None, "appointment.book", EMERGENCY_INTENT, "billing.query"]:
        prompt = builder.build(intent)
        assert "SPOKEN CHENNAI TAMIL" in prompt
        assert "Never diagnose" in prompt
        assert "NEVER invent or guess an ID" in prompt


def test_build_falls_back_to_general_information_for_an_unknown_intent() -> None:
    builder = _loaded_builder()

    assert builder.build(None) == builder.build(DEFAULT_FLOW)
    assert builder.build("not.a.real.intent") == builder.build(DEFAULT_FLOW)


def test_assembled_prompt_is_far_smaller_than_the_master_spec() -> None:
    # The whole reason this module exists: the master prompt is a ~15k-token
    # spec that either gets truncated (losing the language rules) or allocates
    # a KV cache too large for a small GPU.
    builder = _loaded_builder()

    assembled = builder.build("appointment.book")
    master = _MASTER_PROMPT.read_text(encoding="utf-8")

    assert len(assembled) < len(master) / 4


def test_build_raises_before_load() -> None:
    with pytest.raises(RuntimeError):
        PromptBuilder(_RUNTIME_CORE, _MASTER_PROMPT).build("appointment.book")
