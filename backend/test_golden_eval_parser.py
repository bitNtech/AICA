"""Self-check for golden_eval.py's parse_flow_file(): the only deterministic,
model-free part of that script (see its module docstring). Runs against the
real golden/flows/*.txt fixtures rather than synthetic ones, since the whole
point is confirming the parser handles the real files' actual quirks
(corrupted Tamil-script extraction, a stray mid-turn blank line in flow_19.txt).
"""

from __future__ import annotations

from pathlib import Path

from .scripts.golden_eval import parse_flow_file

FLOWS_DIR = Path(__file__).resolve().parent.parent / "golden" / "flows"


def test_flow_01_appointment_book_parses_exactly() -> None:
    spec = parse_flow_file(FLOWS_DIR / "flow_01.txt")

    assert spec.flow_number == 1
    assert spec.title == "Appointment Booking"
    assert spec.intent == "appointment.book"
    assert "cardiology consult" in spec.scenario.lower()
    assert spec.entities == [
        "patient_name",
        "mobile",
        "department",
        "doctor_name",
        "appointment_date",
        "appointment_time",
        "appointment_id",
        "consultation_fee",
    ]
    assert "APT-77219" in spec.outcome

    assert len(spec.caller_turns) == 9
    assert spec.caller_turns[0] == "Vanakkam madam. Cardiology-la oru appointment book pannanum."
    assert "98407 21534" in spec.caller_turns[2]
    assert spec.caller_turns[-1] == "Illa madam, ithu pothum. Romba nandri."
    # The flow's own scripted opening greeting (always the first AGENT turn)
    # must never be treated as caller input.
    assert not any("Naan Gayathri" in turn or "Naan Mohan" in turn for turn in spec.caller_turns)


def test_flow_08_lab_result_inquiry_parses_exactly() -> None:
    spec = parse_flow_file(FLOWS_DIR / "flow_08.txt")

    assert spec.flow_number == 8
    assert spec.intent == "lab.result_inquiry"
    assert "report emailed" in spec.outcome.lower()
    assert len(spec.caller_turns) == 9
    assert spec.caller_turns[0] == "Sir, nethu test pannen. Report vanthuduchaa?"
    # The caller's push to have a lab value read out - the exact turn the
    # golden flow exists to exercise (agent must refuse, per main_prompt.txt Sec9).
    assert any("TSH value" in turn for turn in spec.caller_turns)


def test_flow_19_stray_blank_line_does_not_split_a_turn() -> None:
    """flow_19.txt has a known data-quality quirk: a blank line accidentally
    splits one turn's romanized-wrap line from the rest of its turn. Confirm
    the parser's merge-back logic (see parse_flow_file's comment) handles it
    rather than raising or silently dropping/duplicating a turn."""
    spec = parse_flow_file(FLOWS_DIR / "flow_19.txt")

    assert spec.flow_number == 19
    assert spec.intent == "complaint.register"
    assert spec.caller_turns  # parses without raising, at least one turn recovered
    assert all(turn.strip() for turn in spec.caller_turns)  # no empty/whitespace-only turn


def test_all_twenty_golden_flows_parse_without_raising() -> None:
    paths = sorted(FLOWS_DIR.glob("flow_*.txt"))
    assert len(paths) == 20, f"expected 20 golden flow files, found {len(paths)}"

    for path in paths:
        spec = parse_flow_file(path)
        assert spec.flow_number == int(path.stem.split("_")[1])
        assert spec.intent, f"{path}: empty intent"
        assert spec.entities, f"{path}: empty entities list"
        assert spec.outcome, f"{path}: empty outcome"
        assert spec.caller_turns, f"{path}: no caller turns extracted"


if __name__ == "__main__":
    test_flow_01_appointment_book_parses_exactly()
    test_flow_08_lab_result_inquiry_parses_exactly()
    test_flow_19_stray_blank_line_does_not_split_a_turn()
    test_all_twenty_golden_flows_parse_without_raising()
    print("ok")
