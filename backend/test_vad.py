"""Self-check for TenVadSegmenter's turn-taking state machine.

Stubs the native ten_vad call so the pre-roll / endpoint-silence / max-duration
branches are exercised deterministically, without depending on real speech
audio or the native library's actual probabilities.
"""

from __future__ import annotations

import numpy as np

from .settings import AudioSettings
from .vad import TenVadSegmenter

HOP = 256


def _frame(value: int = 100) -> np.ndarray:
    return np.full(HOP, value, dtype=np.int16)


def _make_segmenter(flags: list[int], **overrides) -> TenVadSegmenter:
    settings = AudioSettings(**overrides)
    segmenter = TenVadSegmenter(settings)
    it = iter(flags)
    segmenter._vad.process = lambda frame: (1.0, next(it))
    return segmenter


def _run(segmenter: TenVadSegmenter, flags: list[int]):
    update = None
    for _ in flags:
        update = segmenter.process(_frame())
        if update.speech_ended:
            break
    return update


def test_readme_hyperparameters_are_the_defaults() -> None:
    settings = AudioSettings()
    assert (settings.sample_rate, settings.vad_hop_size) == (16_000, 256)
    assert settings.vad_threshold == 0.35
    # 22 x 16 ms = 352 ms. Lowered from 30 (480 ms): this silence is spent
    # in front of every reply, so it is part of the latency budget.
    assert settings.endpoint_silence_frames == 22
    assert settings.pre_roll_frames == 8
    assert (settings.language, settings.decoding) == ("ta", "rnnt")


def test_pre_roll_is_prepended_to_utterance() -> None:
    pre_roll = 3
    silence = AudioSettings().endpoint_silence_frames
    flags = [0, 0, 0, 1] + [0] * silence
    segmenter = _make_segmenter(flags, pre_roll_frames=pre_roll)

    update = _run(segmenter, flags)

    assert update is not None and update.samples is not None
    # pre-roll only fills while silent, so the utterance is
    # pre-roll + the speech frame + the silent tail that ended the turn.
    assert len(update.samples) == (pre_roll + 1 + silence) * HOP


def test_mid_sentence_pause_shorter_than_endpoint_does_not_split() -> None:
    # 10 silent frames (160 ms) is a breath, not a turn end - it must stay
    # comfortably under endpoint_silence_frames or the ASR gets half a
    # sentence, which is the failure that caps how low that can be tuned.
    endpoint = AudioSettings().endpoint_silence_frames
    flags = [1] + [0] * 10 + [1] + [0] * endpoint
    segmenter = _make_segmenter(flags)

    update = _run(segmenter, flags)

    assert update is not None and update.samples is not None
    assert len(update.samples) == (1 + 10 + 1 + endpoint) * HOP


def test_short_blip_is_still_transcribed() -> None:
    # The reference pipeline has no minimum-speech gate: every turn goes to ASR.
    flags = [1, 1] + [0] * AudioSettings().endpoint_silence_frames
    segmenter = _make_segmenter(flags)

    update = _run(segmenter, flags)

    assert update is not None and update.speech_ended and update.samples is not None


def test_max_duration_forces_endpoint() -> None:
    flags = [1] * 10
    segmenter = _make_segmenter(flags, max_utterance_frames=5)

    update = _run(segmenter, flags)

    assert update is not None and update.end_reason == "max_duration"


def test_peek_utterance_is_none_before_speech_starts() -> None:
    segmenter = _make_segmenter([0, 0, 0])
    segmenter.process(_frame())
    assert segmenter.in_speech is False
    assert segmenter.peek_utterance() is None


def test_peek_utterance_returns_speech_so_far_without_consuming_it() -> None:
    segmenter = _make_segmenter([1, 1, 1])
    segmenter.process(_frame())
    segmenter.process(_frame())

    assert segmenter.in_speech is True
    peeked = segmenter.peek_utterance()
    assert peeked is not None and len(peeked) == 2 * HOP

    # A second peek and a further process() must see the same/growing buffer,
    # proving peek_utterance() never mutates or drains state.
    assert segmenter.peek_utterance() is not None and len(segmenter.peek_utterance()) == 2 * HOP
    segmenter.process(_frame())
    assert len(segmenter.peek_utterance()) == 3 * HOP


def test_peek_utterance_is_none_again_once_the_turn_ends() -> None:
    flags = [1, 1] + [0] * AudioSettings().endpoint_silence_frames
    segmenter = _make_segmenter(flags)
    _run(segmenter, flags)

    assert segmenter.in_speech is False
    assert segmenter.peek_utterance() is None


def test_flush_emits_in_progress_utterance_and_resets() -> None:
    segmenter = _make_segmenter([1, 1, 1])
    for _ in range(3):
        segmenter.process(_frame())

    update = segmenter.flush()
    assert update is not None and update.end_reason == "call_ended" and update.samples is not None
    assert segmenter.flush() is None


if __name__ == "__main__":
    test_readme_hyperparameters_are_the_defaults()
    test_pre_roll_is_prepended_to_utterance()
    test_mid_sentence_pause_shorter_than_endpoint_does_not_split()
    test_short_blip_is_still_transcribed()
    test_max_duration_forces_endpoint()
    test_peek_utterance_is_none_before_speech_starts()
    test_peek_utterance_returns_speech_so_far_without_consuming_it()
    test_peek_utterance_is_none_again_once_the_turn_ends()
    test_flush_emits_in_progress_utterance_and_resets()
    print("ok")
