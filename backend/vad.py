"""Streaming TEN VAD segmentation for signed 16-bit PCM audio.

Same turn-taking state machine as the reference live-mic pipeline: pre-roll is
collected only while silent, so an utterance is exactly
`pre_roll_frames` of lead-in silence + every frame from VAD onset through the
`endpoint_silence_frames` silent tail that closes the turn.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import numpy as np
from ten_vad import TenVad

from .settings import AudioSettings


@dataclass(frozen=True)
class VadUpdate:
    probability: float
    speech_started: bool = False
    speech_ended: bool = False
    end_reason: str | None = None
    samples: np.ndarray | None = None


class TenVadSegmenter:
    """Accumulates speech into ASR-ready utterances."""

    def __init__(self, settings: AudioSettings) -> None:
        self.settings = settings
        self._vad = TenVad(settings.vad_hop_size, settings.vad_threshold)
        self._pre_roll: deque[np.ndarray] = deque(maxlen=settings.pre_roll_frames)
        self._utterance: list[np.ndarray] = []
        self._in_speech = False
        self._silence_frames = 0

    def process(self, frame: np.ndarray) -> VadUpdate:
        """Process one contiguous int16 frame exactly `vad_hop_size` long."""
        probability, speech_flag = self._vad.process(frame)

        if speech_flag == 1:
            started = not self._in_speech
            if started:
                self._in_speech = True
                # Prepend the buffered pre-speech audio so the first
                # syllable isn't lost to VAD onset lag.
                self._utterance = list(self._pre_roll)
            self._silence_frames = 0
            self._utterance.append(frame.copy())
            if len(self._utterance) >= self.settings.max_utterance_frames:
                return self._finish(probability, "max_duration")
            return VadUpdate(probability=probability, speech_started=started)

        if not self._in_speech:
            self._pre_roll.append(frame.copy())
            return VadUpdate(probability=probability)

        self._silence_frames += 1
        self._utterance.append(frame.copy())  # keep the trailing silence
        if self._silence_frames >= self.settings.endpoint_silence_frames:
            return self._finish(probability, "silence")
        return VadUpdate(probability=probability)

    @property
    def in_speech(self) -> bool:
        """True while an utterance is in progress (started, not yet ended)."""
        return self._in_speech

    def peek_utterance(self) -> np.ndarray | None:
        """Read-only snapshot of the in-progress utterance, for interim ASR.

        BACKEND_COMPLETION.md Sec3.4: partial/interim transcripts need to run
        on the caller's speech-so-far *before* vad_end closes the turn. This
        does not consume or mutate any state - process()/flush() behave
        exactly as before regardless of how often this is called.
        """
        if not self._in_speech or not self._utterance:
            return None
        return np.concatenate(self._utterance)

    def flush(self) -> VadUpdate | None:
        """Emit an in-progress utterance when a call closes."""
        if not self._in_speech:
            return None
        return self._finish(0.0, "call_ended")

    def _finish(self, probability: float, reason: str) -> VadUpdate:
        samples = np.concatenate(self._utterance)
        self._utterance = []
        self._in_speech = False
        self._silence_frames = 0
        self._pre_roll.clear()
        return VadUpdate(
            probability=probability,
            speech_ended=True,
            end_reason=reason,
            samples=samples,
        )
