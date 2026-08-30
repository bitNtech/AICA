"""Self-check for ActiveSpeech's cancellation bookkeeping.

Uses plain asyncio.Task fakes (asyncio.sleep) - no websocket, VAD, or TTS
model needed, matching the fakes-over-real-models style of test_asr.py /
test_llm.py / test_tts.py.
"""

from __future__ import annotations

import asyncio
import contextlib

from .barge_in import ActiveSpeech


async def test_interrupt_with_no_active_task_is_a_no_op() -> None:
    active_speech = ActiveSpeech()

    assert active_speech.interrupt() is False


async def test_interrupt_cancels_the_active_task() -> None:
    active_speech = ActiveSpeech()
    task = asyncio.create_task(asyncio.sleep(10))
    active_speech.set(task)

    cancelled = active_speech.interrupt()

    assert cancelled is True
    with contextlib.suppress(asyncio.CancelledError):
        await task
    assert task.cancelled()


async def test_interrupt_on_an_already_done_task_is_a_no_op() -> None:
    active_speech = ActiveSpeech()
    task = asyncio.create_task(_immediate())
    await task
    active_speech.set(task)

    assert active_speech.interrupt() is False


async def test_double_interrupt_is_safe() -> None:
    active_speech = ActiveSpeech()
    task = asyncio.create_task(asyncio.sleep(10))
    active_speech.set(task)

    first = active_speech.interrupt()
    # A task only becomes done() once the loop actually delivers the
    # cancellation, so let that happen before checking that a second
    # interrupt() (e.g. from a rapid double barge-in) is a no-op rather than
    # an error.
    with contextlib.suppress(asyncio.CancelledError):
        await task
    second = active_speech.interrupt()

    assert first is True
    assert second is False


async def test_clear_only_clears_the_matching_task() -> None:
    active_speech = ActiveSpeech()
    stale_task = asyncio.create_task(asyncio.sleep(10))
    current_task = asyncio.create_task(asyncio.sleep(10))
    active_speech.set(current_task)

    active_speech.clear(stale_task)  # a superseded task's own cleanup

    assert active_speech.interrupt() is True  # current_task is still tracked
    stale_task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await stale_task
    with contextlib.suppress(asyncio.CancelledError):
        await current_task


async def test_clear_removes_the_tracked_task() -> None:
    active_speech = ActiveSpeech()
    task = asyncio.create_task(asyncio.sleep(10))
    active_speech.set(task)

    active_speech.clear(task)

    assert active_speech.interrupt() is False
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


async def _immediate() -> None:
    return None


if __name__ == "__main__":

    async def _main() -> None:
        await test_interrupt_with_no_active_task_is_a_no_op()
        await test_interrupt_cancels_the_active_task()
        await test_interrupt_on_an_already_done_task_is_a_no_op()
        await test_double_interrupt_is_safe()
        await test_clear_only_clears_the_matching_task()
        await test_clear_removes_the_tracked_task()
        print("ok")

    asyncio.run(_main())


def test_a_noise_blip_does_not_interrupt_but_a_spoken_word_does() -> None:
    """The reported failure: any small sound near the mic stopped the agent."""
    loop = asyncio.new_event_loop()
    try:
        speech = ActiveSpeech(sustained_frames=15)
        task = loop.create_task(asyncio.sleep(60))
        speech.set(task)

        # A cough: two flagged 16 ms hops, then silence. Must not cancel.
        assert speech.note_speech(True, speech_started=True) is False
        assert speech.note_speech(True) is False
        for _ in range(30):
            assert speech.note_speech(False) is False
        assert not task.cancelled() and not task.done()

        # A real interjection: 15 continuous hops (240 ms) of speech.
        results = [speech.note_speech(True, speech_started=i == 0) for i in range(15)]
        assert results[-1] is True, "sustained speech must barge in"
        assert results[:-1] == [False] * 14, "should fire exactly once"
        loop.run_until_complete(asyncio.sleep(0))
        assert task.cancelled()
    finally:
        loop.close()
