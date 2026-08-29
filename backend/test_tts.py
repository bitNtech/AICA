"""Self-check for SvaraTts's synthesis interface (load()/ready/synthesize()).

Stubs the model directly the way test_asr.py bypasses IndicConformerAsr.load()
- the real svara-TTS import is a placeholder, see backend/tts.py.
"""

from __future__ import annotations

import numpy as np

from .settings import TtsSettings
from .tts import SvaraTts


class _FakeModel:
    """Records how synthesis was called; returns a scripted float32 waveform."""

    def __init__(self, waveform) -> None:
        self.waveform = waveform
        self.calls: list[dict] = []

    def synthesize(self, text, *, language, voice_reference_path):
        self.calls.append({"text": text, "language": language, "voice_reference_path": voice_reference_path})
        return self.waveform


def _make_tts(waveform, sample_rate: int = 22_050) -> tuple[SvaraTts, _FakeModel]:
    tts = SvaraTts(TtsSettings(voice_reference_path="voices/agent.wav"))
    model = _FakeModel(waveform)
    tts._model = model
    tts._sample_rate = sample_rate
    return tts, model


def test_empty_text_short_circuits() -> None:
    tts, model = _make_tts([0.5, -0.5])

    result = tts.synthesize("   ", "ta")

    assert result.samples.size == 0
    assert result.sample_rate == 22_050
    assert model.calls == []


def test_unloaded_model_raises() -> None:
    tts = SvaraTts(TtsSettings())
    try:
        tts.synthesize("வணக்கம்", "ta")
    except RuntimeError:
        return
    raise AssertionError("synthesize must refuse to run before load()")


def test_sample_rate_raises_before_load() -> None:
    tts = SvaraTts(TtsSettings())
    try:
        _ = tts.sample_rate
    except RuntimeError:
        return
    raise AssertionError("sample_rate must refuse to be read before load()")


def test_model_is_called_with_text_language_and_voice_reference() -> None:
    tts, model = _make_tts([0.0, 0.5])

    tts.synthesize("  Cardiology appointment  ", "ta")

    call = model.calls[0]
    assert call["text"] == "Cardiology appointment"
    assert call["language"] == "ta"
    assert call["voice_reference_path"] == "voices/agent.wav"


def test_waveform_is_scaled_and_converted_to_int16() -> None:
    tts, _ = _make_tts([0.0, 1.0, -1.0, 0.5])

    result = tts.synthesize("hello", "ta")

    assert result.samples.dtype == np.int16
    assert list(result.samples) == [0, 32767, -32767, 16383]
    assert result.sample_rate == 22_050


def test_out_of_range_waveform_is_clipped_before_scaling() -> None:
    tts, _ = _make_tts([2.0, -2.0])

    result = tts.synthesize("hello", "ta")

    assert list(result.samples) == [32767, -32767]


if __name__ == "__main__":
    test_empty_text_short_circuits()
    test_unloaded_model_raises()
    test_sample_rate_raises_before_load()
    test_model_is_called_with_text_language_and_voice_reference()
    test_waveform_is_scaled_and_converted_to_int16()
    test_out_of_range_waveform_is_clipped_before_scaling()
    print("ok")
