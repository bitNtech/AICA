"""Builds the per-turn system prompt: condensed core + ONE flow's playbook.

golden/main_prompt.txt is a ~15k-token specification document. Sending it whole
on every turn is what broke the agent in practice: Ollama's VRAM-derived default
num_ctx (2048-4096) silently truncated it *before* section 2's language rules,
so the model answered in English and invented a caller mobile number. Raising
num_ctx to hold it fixes correctness but allocates a KV cache far too large for
CPU-only inference - a trivial generation measured 222s on this machine.

So the prompt is assembled instead of shipped whole: golden/runtime_core.txt
carries the rules that apply to EVERY turn (language, turn discipline, ledger,
grounding, clinical safety, emergency override), and only the ACTIVE flow's
section-8 playbook is appended. main_prompt.txt stays the single source of truth
for those 20 playbooks - they are parsed out of it here, never duplicated.

Result: ~1.5k tokens per turn instead of ~15k, which is both fast enough for a
voice channel and small enough that the language rules are never truncated away.
"""

from __future__ import annotations

from dataclasses import dataclass
import logging
from pathlib import Path
import re

logger = logging.getLogger("aica.prompt_builder")

# Section 8 entries look like "--- FLOW 01 — appointment.book ---", but four of
# them carry a trailing qualifier the intent name must not absorb:
# "(OUTBOUND)", "(nurse-led)", "(OVERRIDE — speed beats everything)".
_FLOW_HEADER_RE = re.compile(r"^---\s*FLOW\s+(\d+)\s*—\s*([\w.]+).*?---\s*$", re.MULTILINE)

# Flow 14's standing facts are the only hard facts the agent may state without a
# tool result, so they ship with that playbook (see main_prompt.txt Sec8/Sec10).
DEFAULT_FLOW = "info.general"

# Emergency outranks everything and is already in the core prompt; it is listed
# here too so an explicit emergency turn still pulls in flow 18's full playbook.
EMERGENCY_INTENT = "emergency.escalate"

# Ordered most-specific first: the first intent whose pattern matches wins, so
# e.g. "report வந்துடுச்சா" routes to lab.result_inquiry rather than lab.book.
# Patterns cover the caller's own words in both scripts, per main_prompt.txt
# Sec6C's trigger table. This is a deterministic pre-router, not a classifier:
# it only picks which playbook to show the model, and the model still detects
# the real flow from the conversation - so a miss degrades to a slightly
# less-specific playbook, never to a wrong answer.
_INTENT_PATTERNS: list[tuple[str, str]] = [
    (
        EMERGENCY_INTENT,
        r"நெஞ்சு\s*வலி|chest\s*pain|மயக்க|மூச்சு\s*வாங்|மூச்சு\s*விட|வலிப்ப|seizure|"
        r"unconscious|ரத்தம்\s*போ|bleeding|சுத்த\s*முடிய|ambulance|108|"
        r"உயிர்|தூக்கி|விழுந்துட்டா|பேச\s*முடிய",
    ),
    (
        "complaint.escalation_angry",
        r"மூணாவது\s*தடவை|மூன்றாவது|consumer\s*court|social\s*media|"
        r"எத்தனை\s*தடவை|இன்னும்\s*வரல|காசு\s*வரல|refund\s*வரல|கத்த",
    ),
    (
        "complaint.register",
        r"complaint|புகார்|மோசமா\s*பேச|காக்க\s*வெச்|காத்திருந்த|சரி\s*இல்ல|rude|"
        r"மரியாதை\s*இல்ல",
    ),
    (
        "clinical.triage",
        r"காய்ச்சல|fever|வாந்தி|vomit|rash|தடிப்ப|வலிக்குது|"
        r"என்ன\s*பண்றதுன்னு\s*தெரியல|உடம்பு\s*சரி\s*இல்ல",
    ),
    (
        "prescription.refill",
        r"refill|தீர்ந்து|மாத்திரை\s*வேண|tablets?\s*வேண|மருந்து\s*வேண|stock\s*இல்ல",
    ),
    (
        "medication.query",
        r"side\s*effect|தூக்கம்\s*வர|சாப்பிட்ட\s*பிறகு|எப்போ\s*சாப்பிட|dose|"
        r"tablet.*பிரச்ச|மருந்து.*பிரச்ச",
    ),
    (
        "lab.result_inquiry",
        r"report\s*வந்த|result|report\s*கிடைக்|SMS\s*வரல|report\s*எப்போ|value",
    ),
    (
        "lab.book",
        r"test\s*எழுதி|scan\s*book|blood\s*test|sample\s*எடுக்|ultrasound|scan\s*பண்ண|"
        r"lab.*book|test.*book",
    ),
    (
        "insurance.query",
        r"insurance|policy|cover\s*ஆகும|cashless|pre.?auth|TPA|room\s*rent|co.?pay|claim",
    ),
    (
        "billing.query",
        r"bill|charge|extra\s*போட்|itemised|itemized|EMI|தவணை|கட்டணம்|amount.*தப்ப",
    ),
    (
        "records.request",
        r"case\s*sheet|discharge\s*summary|records?\s*வேண|medical\s*records|"
        r"copy\s*வேண|file\s*வேண",
    ),
    (
        "referral.status",
        r"referral|வேற\s*hospital|letter.*எழுத|refer\s*பண்ண",
    ),
    (
        "patient.register",
        r"register\s*பண்ண|புதுசா|new\s*patient|MRN\s*இல்ல|முதல்\s*தடவை|first\s*time.*register",
    ),
    (
        "appointment.followup",
        r"follow.?up|review.*வர\s*சொன்|course\s*முடிஞ்|திரும்ப\s*வர\s*சொன்",
    ),
    (
        "appointment.reschedule",
        r"postpone|prepone|reschedule|date\s*மாத்த|நேரம்\s*மாத்த|வேற\s*date|"
        r"அன்னைக்கு\s*வர\s*முடியா",
    ),
    (
        "appointment.cancel",
        r"cancel|ரத்து|வேணாம்.*appointment|appointment.*வேணாம",
    ),
    (
        "appointment.book",
        r"appointment|book\s*பண்ண|doctor.*பாக்க|consult|slot|சந்திக்க",
    ),
    (
        "info.general",
        r"timing|visiting\s*hours|parking|canteen|wheelchair|ICU|attender|"
        r"எப்படி\s*வர|எத்தனை\s*மணி|எங்க\s*இருக்கு",
    ),
]

_COMPILED_PATTERNS = [(intent, re.compile(pattern, re.IGNORECASE)) for intent, pattern in _INTENT_PATTERNS]


def detect_intent(text: str) -> str | None:
    """Return the first intent whose trigger pattern matches, or None.

    Deterministic and cheap on purpose - a voice turn cannot afford an extra
    LLM round-trip just to pick which playbook to show.
    """
    for intent, pattern in _COMPILED_PATTERNS:
        if pattern.search(text):
            return intent
    return None


@dataclass(frozen=True)
class FlowPlaybook:
    flow_number: int
    intent: str
    body: str


def parse_flow_playbooks(master_prompt: str) -> dict[str, FlowPlaybook]:
    """Extract section 8's twenty per-flow playbooks, keyed by intent."""
    matches = list(_FLOW_HEADER_RE.finditer(master_prompt))
    if not matches:
        raise ValueError("no '--- FLOW NN — intent ---' headers found in the master prompt")

    playbooks: dict[str, FlowPlaybook] = {}
    for index, match in enumerate(matches):
        flow_number = int(match.group(1))
        intent = match.group(2)
        start = match.end()
        # A flow body runs to the next flow header, or to section 9's rule for
        # the last one (section 8 is the final flow-bearing section).
        if index + 1 < len(matches):
            end = matches[index + 1].start()
        else:
            section_end = master_prompt.find("\n====", start)
            end = section_end if section_end != -1 else len(master_prompt)
        playbooks[intent] = FlowPlaybook(
            flow_number=flow_number, intent=intent, body=master_prompt[start:end].strip()
        )
    return playbooks


class PromptBuilder:
    """Assembles core + one flow playbook into the per-turn system prompt."""

    def __init__(self, core_path: Path, master_prompt_path: Path) -> None:
        self.core_path = core_path
        self.master_prompt_path = master_prompt_path
        self._core: str | None = None
        self._playbooks: dict[str, FlowPlaybook] = {}

    @property
    def ready(self) -> bool:
        return self._core is not None

    def load(self) -> None:
        self._core = self.core_path.read_text(encoding="utf-8")
        self._playbooks = parse_flow_playbooks(self.master_prompt_path.read_text(encoding="utf-8"))
        logger.info(
            "prompt builder loaded: core=%d chars, %d flow playbooks",
            len(self._core),
            len(self._playbooks),
        )

    def build(self, intent: str | None) -> str:
        """Return the system prompt for a turn whose detected intent is `intent`."""
        if self._core is None:
            raise RuntimeError("PromptBuilder is not loaded")

        playbook = self._playbooks.get(intent or "") or self._playbooks.get(DEFAULT_FLOW)
        if playbook is None:
            return self._core

        return (
            f"{self._core}\n"
            "## THIS CALL'S PLAYBOOK — the flow you are handling right now\n"
            "Wording shown is a MODEL, not a script. Say it in your own words, one point per turn.\n"
            f"{playbook.body}\n"
        )
