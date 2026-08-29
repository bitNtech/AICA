"""Splits agent reply text into clauses for pipelined TTS synthesis.

v1 (BACKEND_COMPLETION.md Sec3.2/Sec6 item 2) feeds this the whole LLM reply
in one feed() call rather than real token-level streaming, but the
feed()/flush() interface is written against a streaming source from the
start - swapping in token-level LLM streaming later shouldn't require
reshaping this class.
"""

from __future__ import annotations

import re

# Guards against splitting mid-abbreviation ("Dr. Ramanathan") - a naive
# `.`/`?`/`!` splitter would cut it. Tamil/English code-mixed turns in this
# prompt commonly hit this (golden/main_prompt.txt).
_ABBREVIATIONS = frozenset({"dr", "mr", "mrs", "ms", "prof", "st", "rs", "no", "vs", "e.g", "i.e"})

# A clause ends at '.'/'?'/'!' followed by whitespace - never at end-of-buffer.
# Requiring an actual trailing space (not just "no more text yet") is what
# keeps a decimal like "37." from matching before the "5" of "37.5" has even
# arrived: mid-stream, buffer-end isn't evidence of a real sentence end, only
# whitespace is. The one deliberate consequence: the last clause of any text
# never closes via feed() alone, even for a complete one-shot reply - callers
# always finish with flush() to release it (see _split_reply_into_clauses in
# main.py).
_BOUNDARY_RE = re.compile(r"[.!?]+\s+")


class ClauseChunker:
    """Buffers streamed text and yields complete clauses as they close."""

    def __init__(self) -> None:
        self._buffer = ""

    def feed(self, text: str) -> list[str]:
        """Add text to the buffer; return any clauses that closed as a result."""
        self._buffer += text
        clauses: list[str] = []

        while True:
            boundary = self._find_next_boundary(self._buffer)
            if boundary is None:
                break
            clause = self._buffer[:boundary].strip()
            self._buffer = self._buffer[boundary:]
            if clause:
                clauses.append(clause)
        return clauses

    def flush(self) -> str | None:
        """Return and clear any trailing text that never closed a clause."""
        remainder = self._buffer.strip()
        self._buffer = ""
        return remainder or None

    def _find_next_boundary(self, text: str) -> int | None:
        for match in _BOUNDARY_RE.finditer(text):
            if self._is_real_boundary(text, match.start()):
                return match.end()
        return None

    def _is_real_boundary(self, text: str, punct_start: int) -> bool:
        word_start = punct_start
        while word_start > 0 and (text[word_start - 1].isalpha() or text[word_start - 1] == "."):
            word_start -= 1
        word = text[word_start:punct_start].rstrip(".").lower()
        return word not in _ABBREVIATIONS
