"""Covers the intent router and the core+playbook assembly.

The point of these tests is the property that makes the runtime prompt safe to
shrink: whatever the router does, the language/safety rules are always present,
and only the flow-specific playbook varies.
"""

from __future__ import annotations

import json
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
    assert "Dr. Saravanan senior nephrologist" in booking
    # Another flow's exemplar must not leak in and pull the model off-flow.
    # The sentinel is the emergency example's street address, not its
    # "Ambulance அனுப்பிட்டேன்" line: runtime_core.txt now quotes that line
    # itself, to say that it reports something already done and is a lie
    # unless dispatchAmbulance has returned. A sentinel has to be a string
    # only the exemplar can produce.
    assert "Velachery, 4th Cross Street" not in booking


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


def test_exemplars_never_reuse_a_fact_from_the_mock_hospital_db() -> None:
    """Few-shot examples must not be copyable into a correct-looking answer.

    Exemplars exist to teach register - the Tamil/English mix, turn length,
    one question per turn. A small model also copies whatever is concrete in
    them, and while appointment.book's exemplar WAS the seeded patient record
    the model would say "MRN ARV-118342, address T. Nagar" having called no
    tool at all, and be right by coincidence. Keeping exemplar facts disjoint
    from the database is what turns that silent memorisation into a wrong
    answer that backend/grounding.py reports. See golden/flow_exemplars.json's
    header comment.
    """
    from .tools import MockHospitalDb

    db = MockHospitalDb()
    seeded: set[str] = set()
    for patient in db.patients.values():
        seeded |= {patient["mrn"], patient["name"], patient["mobile"]}
        # The spaced form is how the golden flows write a mobile aloud.
        seeded.add(f"{patient['mobile'][:5]} {patient['mobile'][5:]}")
    seeded |= set(db.appointments) | set(db.bills) | set(db.lab_orders)
    seeded |= set(db.referrals) | set(db.policies)
    for slots in db.slots.values():
        seeded |= {slot["doctor"] for slot in slots}
    # Department names are deliberately NOT in this set. "Orthopaedics" is
    # shared vocabulary a caller says out loud - it identifies no record and
    # copying it fabricates nothing. The invariant is about facts specific to a
    # seeded patient, booking or clinician.

    raw = json.loads(_EXEMPLARS.read_text(encoding="utf-8"))
    offenders: list[str] = []
    for intent, exchanges in raw.items():
        if intent.startswith("_"):
            continue
        for _role, text in exchanges:
            offenders += [f"{intent}: {fact!r}" for fact in seeded if fact and fact in text]

    assert not offenders, (
        "exemplars reuse facts from MockHospitalDb, so a model that copies them "
        "looks correct without calling a tool: " + "; ".join(sorted(offenders))
    )


_GOLDEN_FLOWS_DIR = _REPO_ROOT / "golden" / "flows"

# The one free-text fact (not a structured ID or mobile) known to have been
# copied character-for-character between an exemplar and a golden/flows/*.txt
# eval fixture - see the docstring below.
_EMERGENCY_EVAL_ADDRESS = "Ashok Nagar, 11th Avenue, number 24, ground floor"


def test_exemplars_never_reuse_a_fact_from_a_golden_eval_flow() -> None:
    """Few-shot examples must not double as the answer key for golden_eval.

    test_exemplars_never_reuse_a_fact_from_the_mock_hospital_db keeps exemplar
    facts disjoint from tools.py's seeded DB, so a model that copies an
    exemplar's MRN or mobile is caught because the copied value does not match
    any real record. It says nothing about golden/flows/*.txt, the fixtures
    backend/scripts/golden_eval.py replays to score tool-calling - and that
    overlap existed: flow_18's caller gave the exact address
    emergency.escalate's exemplar dispatches an ambulance to, character for
    character, and the same was true of a mobile number in
    appointment.reschedule, a bill number in complaint.escalation_angry, an
    MRN in referral.status and others (LLM_TEST_RESULTS.txt PART 7.5). A PASS
    on a flow whose exemplar hands it the answer is indistinguishable from
    reciting the exemplar, which is exactly what golden_eval is supposed to
    rule out.

    So exemplar facts must also be disjoint from every golden/flows/*.txt
    fixture - using backend.grounding's own identifier shapes, since that is
    the same notion of "fact" the runtime grounding check polices.
    """
    from .grounding import extract_identifiers

    eval_facts: set[str] = set()
    for flow_path in _GOLDEN_FLOWS_DIR.glob("flow_*.txt"):
        eval_facts |= extract_identifiers(flow_path.read_text(encoding="utf-8"))

    raw = json.loads(_EXEMPLARS.read_text(encoding="utf-8"))
    offenders: list[str] = []
    for intent, exchanges in raw.items():
        if intent.startswith("_"):
            continue
        for _role, text in exchanges:
            found = extract_identifiers(text) & eval_facts
            offenders += [f"{intent}: {fact!r}" for fact in found]

    assert not offenders, (
        "exemplars reuse an identifier from a golden/flows/*.txt eval fixture, "
        "so a PASS on that flow may just be the exemplar recited back: "
        + "; ".join(sorted(offenders))
    )


def test_the_emergency_exemplar_dispatches_to_a_different_address_than_flow_18() -> None:
    """Guards the one overlap that is free text, not a structured identifier.

    extract_identifiers() only knows structured IDs and phone numbers, so it
    cannot see that emergency.escalate's exemplar used to send the ambulance
    to the exact address golden/flows/flow_18.txt's caller gives - the
    clearest case of an exemplar being copyable as the answer, since flow_18
    is the ONE flow in the emergency intent and its address is now the
    exemplar's only free variable.
    """
    raw = json.loads(_EXEMPLARS.read_text(encoding="utf-8"))
    exemplar_text = json.dumps(raw[EMERGENCY_INTENT], ensure_ascii=False)
    flow_18 = (_GOLDEN_FLOWS_DIR / "flow_18.txt").read_text(encoding="utf-8")

    assert _EMERGENCY_EVAL_ADDRESS in flow_18, "flow_18.txt's address changed; update this test's fixture"
    assert _EMERGENCY_EVAL_ADDRESS not in exemplar_text


# "ஒரு நிமிஷம், check பண்றேன்" and friends: the agent telling the caller it is
# going to look something up.
_NARRATES_A_LOOKUP_RE = re.compile(r"ஒரு நிமிஷம்|check பண்றேன்|பாக்கறேன்|பாத்துடலாம்")


def test_an_exemplar_that_narrates_a_lookup_also_shows_the_tool_step() -> None:
    """A narrated lookup with no tool step teaches the exact failure we hit.

    Six flows used to say "பாக்கறேன் மேடம்" and then state a patient name, a
    doctor, a referral stage or a refund amount that no tool had returned -
    a worked example of narrating a database query and producing the answer
    from nowhere. runtime_core.txt forbids it in words ("Never narrate a
    lookup you did not perform"), and the model followed the example instead:
    asked for a lab value three times it held the refusal that its exemplar
    demonstrates, while the refusal that was only written as a rule collapsed.

    So wherever an exemplar narrates a lookup, it must also show the call.
    """
    raw = json.loads(_EXEMPLARS.read_text(encoding="utf-8"))

    offenders: list[str] = []
    for intent, exchanges in raw.items():
        if intent.startswith("_"):
            continue
        narrates = any(
            role == "agent" and _NARRATES_A_LOOKUP_RE.search(text) for role, text in exchanges
        )
        if narrates and not any(role == "tool" for role, _text in exchanges):
            offenders.append(intent)

    assert not offenders, (
        "these exemplars narrate a lookup but never show the tool call, which "
        "demonstrates inventing the result: " + ", ".join(sorted(offenders))
    )
