"""Tracks the in-flight agent-speech task so a fresh caller turn can cancel it.

BACKEND_COMPLETION.md Sec3.2: the moment VAD emits a fresh speech_started while
the agent is speaking, the orchestrator must cancel the in-flight TTS
generation and stop sending further audio immediately. ActiveSpeech is the
"is the agent currently talking" state that didn't exist before - deliberately
kept free of asyncio.Task's caller (main.py's speak()/handle_conversation_turns)
so the cancellation bookkeeping itself is unit-testable without a websocket,
VAD, or TTS model.
"""

from __future__ import annotations

import asyncio


class ActiveSpeech:
    """Holds at most one in-flight agent-speech task per call."""

    def __init__(self, sustained_frames: int = 1) -> None:
        self._task: asyncio.Task | None = None
        self._sustained_frames = max(1, sustained_frames)
        self._speech_frames = 0

    def set(self, task: asyncio.Task) -> None:
        self._task = task

    def clear(self, task: asyncio.Task) -> None:
        """Clear only if `task` is still the tracked one (a superseded task's
        own cleanup must not clobber whatever replaced it)."""
        if self._task is task:
            self._task = None

    def note_speech(self, speech_frame: bool, speech_started: bool = False) -> bool:
        """Interrupt only once the caller has been speaking for long enough.

        VAD flags speech per 16 ms hop, and cancelling the agent's turn on the
        FIRST flagged hop is what made it stoppable by a cough, a keystroke or
        a breath - the caller then hears the agent give up mid-sentence for no
        reason. Requiring `sustained_frames` consecutive flagged hops keeps a
        real interjection working (a spoken word is far longer than the gate)
        while noise blips, which are one or two hops, pass under it.

        Returns True on the single frame that actually cancelled something, so
        the caller can log the barge-in once rather than every frame after.
        """
        if speech_started:
            self._speech_frames = 0
        if not speech_frame:
            return False
        self._speech_frames += 1
        if self._speech_frames != self._sustained_frames:
            return False
        return self.interrupt()

    def interrupt(self) -> bool:
        """Cancel the in-flight speech task, if any. Returns whether one was cancelled."""
        task = self._task
        if task is not None and not task.done():
            task.cancel()
            return True
        return False
