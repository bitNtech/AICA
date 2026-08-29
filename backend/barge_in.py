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

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None

    def set(self, task: asyncio.Task) -> None:
        self._task = task

    def clear(self, task: asyncio.Task) -> None:
        """Clear only if `task` is still the tracked one (a superseded task's
        own cleanup must not clobber whatever replaced it)."""
        if self._task is task:
            self._task = None

    def interrupt(self) -> bool:
        """Cancel the in-flight speech task, if any. Returns whether one was cancelled."""
        task = self._task
        if task is not None and not task.done():
            task.cancel()
            return True
        return False
