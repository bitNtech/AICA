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


# --- engine selection + EdgeTts -------------------------------------------
# EdgeTts is exercised against a stubbed MP3 stream rather than the network:
# the decode/mix/scale path is ours and worth testing, the Microsoft endpoint
# is not, and a unit test must not depend on it being reachable.

import asyncio
import io

import pytest

from .tts import EdgeTts, create_tts


def test_create_tts_selects_the_engine_named_by_settings() -> None:
    assert isinstance(create_tts(TtsSettings(engine="edge")), EdgeTts)
    assert isinstance(create_tts(TtsSettings(engine="svara")), SvaraTts)


def test_unknown_engine_is_rejected_at_construction() -> None:
    with pytest.raises(ValueError):
        TtsSettings(engine="festival")


def test_edge_defaults_to_the_female_voice_for_the_configured_language() -> None:
    tts = EdgeTts(TtsSettings(engine="edge", language="ta"))
    tts.load()

    assert tts._voice == "ta-IN-PallaviNeural"
    assert tts.ready


def test_edge_voice_override_wins_over_the_language_default() -> None:
    tts = EdgeTts(TtsSettings(engine="edge", language="ta", voice="ta-IN-ValluvarNeural"))
    tts.load()

    assert tts._voice == "ta-IN-ValluvarNeural"


def _stub_mp3(monkeypatch, tts: EdgeTts, waveform, sample_rate: int) -> None:
    import soundfile

    buffer = io.BytesIO()
    soundfile.write(buffer, waveform, sample_rate, format="WAV", subtype="PCM_16")
    monkeypatch.setattr(tts, "_stream_mp3", lambda text: _immediate(buffer.getvalue()))


async def _immediate(value):
    return value


def test_synthesize_returns_int16_pcm_at_the_decoded_rate(monkeypatch) -> None:
    tts = EdgeTts(TtsSettings(engine="edge", language="ta"))
    tts.load()
    _stub_mp3(monkeypatch, tts, np.array([0.0, 0.5, -0.5, 1.0], dtype=np.float32), 24_000)

    result = tts.synthesize("வணக்கம்", "ta")

    assert result.samples.dtype == np.int16
    assert result.sample_rate == 24_000
    assert tts.sample_rate == 24_000


def test_synthesize_downmixes_stereo_to_mono(monkeypatch) -> None:
    tts = EdgeTts(TtsSettings(engine="edge", language="ta"))
    tts.load()
    stereo = np.array([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32)
    _stub_mp3(monkeypatch, tts, stereo, 24_000)

    result = tts.synthesize("வணக்கம்", "ta")

    assert result.samples.ndim == 1
    assert result.samples.shape == (2,)


def test_blank_text_never_reaches_the_network(monkeypatch) -> None:
    tts = EdgeTts(TtsSettings(engine="edge", language="ta"))
    tts.load()

    def _explode(text):
        raise AssertionError("blank clause must not be synthesized")

    monkeypatch.setattr(tts, "_stream_mp3", _explode)

    assert tts.synthesize("   ", "ta").samples.size == 0


def test_synthesize_before_load_raises() -> None:
    with pytest.raises(RuntimeError):
        EdgeTts(TtsSettings(engine="edge")).synthesize("வணக்கம்", "ta")


def test_synthesize_works_from_inside_a_running_event_loop(monkeypatch) -> None:
    # synthesize() is sync with an async engine underneath. main.py reaches it
    # via asyncio.to_thread (no loop in that thread), but an async caller -
    # scripts/transcript_log.py, a notebook - calls it directly, where a naive
    # asyncio.run() raises "cannot be called from a running event loop".
    tts = EdgeTts(TtsSettings(engine="edge", language="ta"))
    tts.load()
    _stub_mp3(monkeypatch, tts, np.array([0.25, -0.25], dtype=np.float32), 24_000)

    async def call_from_loop():
        return tts.synthesize("வணக்கம்", "ta")

    result = asyncio.run(call_from_loop())

    assert result.samples.dtype == np.int16
    assert result.samples.size == 2


def test_a_stalled_endpoint_gives_up_instead_of_hanging_the_turn(monkeypatch) -> None:
    """Measured failure: an unreachable endpoint cost 21s on ONE clause, and the
    sender holds every later clause's audio behind it."""
    import sys
    import time
    import types

    class _Stalling:
        def __init__(self, text, voice) -> None:
            pass

        async def stream(self):
            await asyncio.sleep(5)  # a regression fails here in 5s, not forever
            yield {"type": "audio", "data": b""}

    monkeypatch.setitem(sys.modules, "edge_tts", types.SimpleNamespace(Communicate=_Stalling))
    tts = EdgeTts(TtsSettings(timeout_seconds=0.2))
    tts._voice = "ta-IN-PallaviNeural"

    started = time.perf_counter()
    try:
        tts.synthesize("வணக்கம்", "ta")
        raise AssertionError("a stalled endpoint must not return audio")
    except RuntimeError as error:
        assert "timed out" in str(error)
    elapsed = time.perf_counter() - started
    # One timeout, not two: retrying a stall just stalls again.
    assert elapsed < 1.0, f"gave up after {elapsed:.2f}s, timeout was 0.2s"
