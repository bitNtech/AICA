"""Streaming TEN VAD segmentation for signed 16-bit PCM audio.

Same turn-taking state machine as the reference live-mic pipeline: pre-roll is
collected only while silent, so an utterance is exactly
`pre_roll_frames` of lead-in silence + every frame from VAD onset through the
`endpoint_silence_frames` silent tail that closes the turn.

Two debounces sit on top of raw TEN VAD, because one flagged 16 ms hop is not
a human turn. Measured over the 87 real captured turns in call_events.db, 46
transcribed to <=3 characters and 34 to the EMPTY STRING - 39% of everything
the VAD opened held no speech at all, and each of those still ran the ASR and
could cancel the agent mid-sentence.

  onset   `vad_start_frames` consecutive flagged hops before a turn opens.
          The candidate frames are KEPT and prepended, so confirming an onset
          delays the turn by at most 64 ms and never clips a syllable.
  resume  `vad_resume_frames` consecutive flagged hops to restart the endpoint
          countdown. Resetting on a single hop is what let background noise
          hold the microphone open indefinitely.

A third gate, LOUDNESS, applies to onset only: a turn may not open unless the
frames are also loud relative to the room. It is read in exactly one place, the
not-yet-in-speech branch of process(). Once a turn is open, endpointing is the
VAD flag alone.

That split is the whole design. An energy gate applied to every frame was tried
here and reverted: a quiet trailing syllable scored as silence, the endpoint
countdown ran on through the middle of a word, and turns came back as
one-character transcripts. Loudness may refuse to START a turn; it must never
be able to END one.
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
    speech_frame: bool = False
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
        # Flagged frames seen before an onset is confirmed. Held rather than
        # dropped so a confirmed turn still starts at its true first syllable.
        self._candidate: list[np.ndarray] = []
        self._in_speech = False
        self._silence_frames = 0
        self._resume_frames = 0
        # Learned continuously while nobody is speaking, so the onset bar
        # tracks the actual room rather than a number guessed at a desk.
        self._noise_rms: float | None = None

    @staticmethod
    def _rms(frame: np.ndarray) -> float:
        samples = frame.astype(np.float32)
        return float(np.sqrt(np.mean(samples * samples)))

    def _update_noise_floor(self, rms: float) -> None:
        """Track the room level while nobody is talking."""
        if self._noise_rms is None:
            self._noise_rms = rms
            return
        alpha = self.settings.vad_noise_ema
        self._noise_rms = (1.0 - alpha) * self._noise_rms + alpha * rms

    def _loud_enough_to_open_a_turn(self, rms: float) -> bool:
        """Whether this frame is loud enough to START a turn.

        ONSET ONLY. Never consulted once a turn is open - see the module
        docstring for the failure that rule exists to prevent.
        """
        floor = self.settings.vad_onset_min_rms
        if self._noise_rms is not None:
            floor = max(floor, self._noise_rms * self.settings.vad_onset_snr)
        return rms >= floor

    @property
    def noise_floor(self) -> float:
        """The room level learned so far. Diagnostics only."""
        return self._noise_rms or 0.0

    def process(self, frame: np.ndarray) -> VadUpdate:
        """Process one contiguous int16 frame exactly `vad_hop_size` long."""
        probability, speech_flag = self._vad.process(frame)
        speaking = speech_flag == 1

        if not self._in_speech:
            rms = self._rms(frame)
            if not speaking:
                # Only frames the VAD calls non-speech teach the noise floor.
                # Learning from speech would let a talking caller raise the bar
                # against themselves.
                self._update_noise_floor(rms)
            if speaking and self._loud_enough_to_open_a_turn(rms):
                self._candidate.append(frame.copy())
                if len(self._candidate) < self.settings.vad_start_frames:
                    # Not yet enough evidence to call this a turn. No
                    # speech_frame either, so a blip cannot feed barge-in.
                    return VadUpdate(probability=probability)

                self._in_speech = True
                # Pre-roll first, then the candidate frames that confirmed the
                # onset: together they are the caller's true first syllable.
                self._utterance = list(self._pre_roll) + self._candidate
                self._candidate = []
                self._pre_roll.clear()
                if len(self._utterance) >= self.settings.max_utterance_frames:
                    return self._finish(probability, "max_duration")
                return VadUpdate(probability=probability, speech_frame=True, speech_started=True)

            # Either the run broke before it was long enough, or it was not
            # loud enough to be someone talking TO us. Keep the audio as
            # pre-roll in case real speech follows immediately.
            self._pre_roll.extend(self._candidate)
            self._candidate = []
            self._pre_roll.append(frame.copy())
            return VadUpdate(probability=probability)

        if speaking:
            self._utterance.append(frame.copy())
            # Only a SUSTAINED run restarts the endpoint countdown. A single
            # blip inside the silence window used to reset it outright, which
            # is how background noise held a turn open indefinitely.
            self._resume_frames += 1
            if self._resume_frames >= self.settings.vad_resume_frames:
                self._silence_frames = 0
            if len(self._utterance) >= self.settings.max_utterance_frames:
                return self._finish(probability, "max_duration")
            return VadUpdate(probability=probability, speech_frame=True)

        self._resume_frames = 0
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
        self._candidate = []
        self._in_speech = False
        self._silence_frames = 0
        self._resume_frames = 0
        self._pre_roll.clear()
        return VadUpdate(
            probability=probability,
            speech_ended=True,
            end_reason=reason,
            samples=samples,
        )
