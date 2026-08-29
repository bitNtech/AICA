"""svara-TTS streaming adapter (voice-cloned, sentence-chunked synthesis).

Mirrors asr.py's load()/ready shape: the model and cloned-voice reference are
meant to be loaded once at startup (see main.py's lifespan) so per-call
synthesis never pays model-load latency. Output stays at the model's native
sample rate - BACKEND_COMPLETION.md Sec3.2 keeps resampling out of this
adapter so the same code path can serve a 16 kHz browser socket today and an
8 kHz SIP leg later without knowing which transport it's talking to.

load() is a placeholder: no real svara-TTS package/API reference exists yet.
synthesize()'s call into self._model assumes a plausible shape (text in,
float32 waveform in [-1, 1] out, at whatever rate self._model reports) so the
rest of this class - and main.py's wiring - is real and testable now; that
assumed shape is the only thing likely to need adjusting once the real
package lands.
"""

from __future__ import annotations

from dataclasses import dataclass
import logging

import numpy as np

from .settings import TtsSettings

logger = logging.getLogger("aica.tts")


@dataclass(frozen=True)
class SynthesisResult:
    samples: np.ndarray  # mono int16 PCM at `sample_rate`
    sample_rate: int


class SvaraTts:
    """Loads the svara-TTS model + cloned-voice reference once and synthesizes text."""

    def __init__(self, settings: TtsSettings) -> None:
        self.settings = settings
        self._model = None
        self._sample_rate: int | None = None

    @property
    def ready(self) -> bool:
        return self._model is not None

    @property
    def sample_rate(self) -> int:
        if self._sample_rate is None:
            raise RuntimeError("TTS model is not loaded")
        return self._sample_rate

    def load(self) -> None:
        """Load model weights and the cloned-voice reference during startup.

        PLACEHOLDER: replace this method's body with the real svara-TTS model
        + voice-reference load once that reference is available. Everything
        else in this class - ready gating, synthesize()'s output shape,
        main.py's wiring - is written against the interface below and should
        not need to change when this does.
        """
        raise NotImplementedError(
            "SvaraTts.load() is a placeholder - wire in the real svara-TTS model "
            "and cloned-voice reference here (see backend/tts.py)."
        )

    def synthesize(self, text: str, language: str) -> SynthesisResult:
        """Return mono int16 PCM for one clause, at the model's native rate."""
        if self._model is None:
            raise RuntimeError("TTS model is not loaded")

        text = text.strip()
        if not text:
            return SynthesisResult(samples=np.array([], dtype=np.int16), sample_rate=self.sample_rate)

        waveform = np.asarray(
            self._model.synthesize(
                text, language=language, voice_reference_path=self.settings.voice_reference_path
            ),
            dtype=np.float32,
        )
        samples = (np.clip(waveform, -1.0, 1.0) * 32767).astype(np.int16)
        return SynthesisResult(samples=samples, sample_rate=self.sample_rate)
