"""Mechanically scores whether replies are actually spoken Tamil-English
code-mix, on scenarios that appear NOWHERE in golden/ — new names, new
intents, new phrasing.

Why this exists: "it looks Tamil" is not a check. The two real failure modes
observed on this pipeline were (a) a model that answered in fluent pure
English, and (b) a model that produced Tamil script but semantic gibberish.
Neither is caught by the golden-flow tool-call harness (golden_eval.py), which
only asks whether the right tool fired.

So this scores each reply on the properties golden/main_prompt.txt Sec2 and
Sec3 actually demand, and prints the transcript for a human to read. It is a
FLOOR: passing means nothing is mechanically wrong, not that the Tamil is good.
A native reader still has to read the transcript.

Scenarios are deliberately unseen so a fine-tuned model that merely memorised
the 20 training flows scores badly here - that is the point.

Usage:
    python -m backend.scripts.register_eval
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from backend.conversation import ConversationManager
from backend.llm import LlmClient
from backend.scripts.smoke_llm import SAMPLE_METADATA
from backend.settings import ConversationSettings, LlmSettings

_TAMIL_RE = re.compile(r"[஀-௿]")
_LATIN_RE = re.compile(r"[A-Za-z]")
# Devanagari / Kannada / Telugu - Sec2 forbids all three outright.
_WRONG_SCRIPT_RE = re.compile(r"[ऀ-ॿಀ-೿ఀ-౿]")
# Sec2 "audio stability": these must never reach a TTS engine. The numbered-list
# arm is anchored to line start on purpose - unanchored, it fires on the period
# after any time or amount ("மாலை 5:00. எது...") and reports a correct turn as
# broken, which is worse than missing a list.
_SPOKEN_SYMBOL_RE = re.compile(r"[*#|•→\[\]{}<>_`]|^\s*\d+[.)]\s", re.MULTILINE)
_WORD_RE = re.compile(r"[\w஀-௿]+")

# Names/IDs the model must never emit: they are in neither the ledger, the
# prompt's standing facts, nor any tool result for these scenarios. Catching a
# fabricated identifier is the single highest-value grounding check.
_FABRICATION_RE = re.compile(r"\b(?:98765\d{5}|1234\d+|ARV-0{3}\d+|APT-0{3}\d+)\b")


@dataclass
class Scenario:
    name: str
    turns: list[str]
    # Intents never exercised by the 20 golden flows, so memorisation cannot help.
    note: str = ""


SCENARIOS: list[Scenario] = [
    Scenario(
        "dietician referral (unseen intent)",
        [
            "மேடம், sugar patient-க்கு diet plan வேணும். Dietician-ஐ பாக்க முடியுமா?",
            "என் பேரு Kalaiselvi. இந்த வாரம் எப்போ வேணாலும் வரலாம்.",
        ],
    ),
    Scenario(
        "physiotherapy after knee surgery (unseen intent)",
        [
            "Knee replacement ஆயிடுச்சு, physiotherapy session book பண்ணணும்.",
            "வாரத்துக்கு ரெண்டு தடவை வர முடியும்.",
        ],
    ),
    Scenario(
        "travel vaccination (unseen intent)",
        [
            "சார், நான் அடுத்த மாசம் foreign travel போறேன். Vaccination வேணும்.",
            "Yellow fever certificate வேணும்னு சொன்னாங்க.",
        ],
    ),
    Scenario(
        "blood bank enquiry (unseen intent)",
        [
            "B positive blood இருக்கா? எங்க அத்தைக்கு operation.",
            "நாளைக்கு காலைக்கு தேவைப்படும்.",
        ],
    ),
    Scenario(
        "mobile number update (unseen intent)",
        [
            "என்னோட registered mobile number மாத்தணும் மேடம்.",
            "பழைய number தான் இப்போ வேலை செய்யல.",
        ],
    ),
    Scenario(
        "caller speaks English throughout (mirroring rule, Sec2)",
        [
            "Hello, I need to book an appointment with a skin doctor.",
            "Sometime this weekend would be good.",
        ],
        note="Sec2 allows shifting to majority English here, but Tamil address forms should survive.",
    ),
    Scenario(
        "emergency mid-billing (override, Sec6A)",
        [
            "மேடம், bill-ல ஒரு charge சரி இல்லன்னு நினைக்கிறேன்.",
            "ஐயோ மேடம், என் கணவருக்கு திடீர்னு நெஞ்சு வலி, மூச்சு வாங்குது!",
        ],
        note="Turn 2 must abandon billing and take the address first.",
    ),
]


@dataclass
class TurnScore:
    reply: str
    tamil_ratio: float
    has_english: bool
    wrong_script: bool
    symbols: bool
    word_count: int
    question_count: int
    fabricated: list[str] = field(default_factory=list)

    @property
    def problems(self) -> list[str]:
        issues: list[str] = []
        if not self.reply.strip():
            issues.append("EMPTY reply")
            return issues
        if self.tamil_ratio < 0.35:
            issues.append(f"too little Tamil ({self.tamil_ratio:.0%} of words)")
        if self.tamil_ratio > 0.95:
            issues.append(f"no English code-mix ({self.tamil_ratio:.0%} Tamil)")
        if self.wrong_script:
            issues.append("Devanagari/Kannada/Telugu script present")
        if self.symbols:
            issues.append("unspeakable symbol/bullet in a voice reply")
        if self.word_count > 45:
            issues.append(f"turn too long ({self.word_count} words, limit 40)")
        if self.question_count > 1:
            issues.append(f"{self.question_count} questions in one turn (limit 1)")
        if self.fabricated:
            issues.append(f"fabricated identifier(s): {', '.join(self.fabricated)}")
        return issues


def score_reply(reply: str) -> TurnScore:
    words = _WORD_RE.findall(reply)
    tamil_words = [w for w in words if _TAMIL_RE.search(w)]
    return TurnScore(
        reply=reply,
        tamil_ratio=len(tamil_words) / len(words) if words else 0.0,
        has_english=bool(_LATIN_RE.search(reply)),
        wrong_script=bool(_WRONG_SCRIPT_RE.search(reply)),
        symbols=bool(_SPOKEN_SYMBOL_RE.search(reply)),
        word_count=len(words),
        question_count=reply.count("?"),
        fabricated=_FABRICATION_RE.findall(reply),
    )


async def main() -> None:
    llm_settings = LlmSettings()
    print(f"LLM_BASE_URL={llm_settings.base_url}  LLM_MODEL={llm_settings.model}\n")

    llm = LlmClient(llm_settings)
    llm.load()
    manager = ConversationManager(ConversationSettings())
    manager.load()

    total = clean = 0
    for index, scenario in enumerate(SCENARIOS):
        connection_id = f"register-{index}"
        print("=" * 72)
        print(f"{scenario.name}")
        if scenario.note:
            print(f"  note: {scenario.note}")
        print("=" * 72)
        print(f"agent: {manager.start_call(connection_id, **SAMPLE_METADATA)}")

        for turn in scenario.turns:
            print(f"\ncaller: {turn}")
            try:
                reply = await manager.handle_utterance(connection_id, llm, turn)
            except Exception as error:
                print(f"  [FAILED: {error!r}]")
                total += 1
                continue

            score = score_reply(reply)
            print(f"agent : {reply}")
            print(
                f"        tamil={score.tamil_ratio:.0%} english={'y' if score.has_english else 'n'} "
                f"words={score.word_count} questions={score.question_count}"
            )
            total += 1
            if score.problems:
                for problem in score.problems:
                    print(f"        !! {problem}")
            else:
                clean += 1
                print("        ok")
        manager.end_call(connection_id)

    print("\n" + "=" * 72)
    print(f"{clean}/{total} turns mechanically clean")
    print(
        "Floor check only - clean means nothing is mechanically wrong, NOT that\n"
        "the Tamil reads naturally. Read the transcript above before trusting it."
    )


if __name__ == "__main__":
    asyncio.run(main())
