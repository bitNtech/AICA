"""Low-latency browser audio WebSocket: PCM -> TEN VAD -> IndicConformer ASR."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager, suppress
import json
import logging
from uuid import uuid4

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .asr import IndicConformerAsr
from .barge_in import ActiveSpeech
from .clause_chunker import ClauseChunker
from .conversation import ConversationManager
from .llm import LlmClient
from .persistence import CallEventStore
from .settings import (
    AudioSettings,
    ConversationSettings,
    LlmSettings,
    PersistenceSettings,
    SecuritySettings,
    SUPPORTED_LANGUAGES,
    TtsSettings,
)
from .telephony import router as telephony_router
from .tts import SvaraTts
from .vad import TenVadSegmenter, VadUpdate

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aica.audio")

# BACKEND_COMPLETION.md Sec3.4: how often (in VAD hops) to run an interim CTC
# decode while an utterance is still in progress. 30 hops * 16ms/hop = ~480ms
# between partial_transcript updates - frequent enough to feel responsive,
# far below a rate that would make repeated CTC decodes a latency problem.
PARTIAL_TRANSCRIPT_INTERVAL_FRAMES = 30


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = AudioSettings()
    tts_settings = TtsSettings()
    asr = IndicConformerAsr(settings)
    conversation = ConversationManager(ConversationSettings())
    llm = LlmClient(LlmSettings())
    tts = SvaraTts(tts_settings)
    call_store = CallEventStore(PersistenceSettings())

    try:
        # Preload once so model startup never delays a live call.
        await asyncio.to_thread(asr.load)
    except Exception:
        logger.exception("ASR model failed to load")

    try:
        conversation.load()
    except Exception:
        logger.exception("Conversation Manager failed to load master prompt")

    try:
        llm.load()
    except Exception:
        logger.exception("LLM client failed to configure")

    try:
        # Placeholder until backend/tts.py's load() has a real svara-TTS
        # model to load - see BACKEND_COMPLETION.md Sec3.2 progress log.
        await asyncio.to_thread(tts.load)
    except Exception:
        logger.exception("TTS model failed to load")

    try:
        call_store.load()
    except Exception:
        logger.exception("Call-event store failed to initialize")

    app.state.settings = settings
    app.state.asr = asr
    # BACKEND_COMPLETION.md Sec3.5: bounded worker slots, not one global mutex
    # serializing every concurrent call's ASR/TTS work - see settings.py's
    # ASR_MAX_CONCURRENCY / TTS_MAX_CONCURRENCY.
    app.state.asr_semaphore = asyncio.Semaphore(settings.asr_max_concurrency)
    app.state.conversation = conversation
    app.state.llm = llm
    app.state.tts = tts
    app.state.tts_semaphore = asyncio.Semaphore(tts_settings.max_concurrency)
    app.state.call_store = call_store
    app.state.security = SecuritySettings()
    yield


app = FastAPI(title="AICA Audio Pipeline", lifespan=lifespan)
# BACKEND_COMPLETION.md Sec3.3: telephony ingress is a separate router (its
# own file, its own tests) sharing this app's lifespan-loaded app.state.* -
# see backend/telephony.py's module docstring.
app.include_router(telephony_router)


def _validate_start_event(payload: dict[str, object], settings: AudioSettings) -> str:
    if payload.get("audio_format") != "pcm_s16le":
        raise ValueError("audio_format must be pcm_s16le")
    if payload.get("sample_rate") != settings.sample_rate:
        raise ValueError(f"sample_rate must be {settings.sample_rate}")
    if payload.get("channels") != 1:
        raise ValueError("channels must be 1")

    language = str(payload.get("language", settings.language))
    if language not in SUPPORTED_LANGUAGES:
        raise ValueError(f"unsupported language: {language}")
    return language


def _split_reply_into_clauses(text: str) -> list[str]:
    """One-shot helper: feed a whole LLM reply through ClauseChunker at once.

    v1 does full-reply-then-chunk (BACKEND_COMPLETION.md Sec6 item 2), not
    token-level streaming, so feed()+flush() together - rather than feed()
    alone - is the right call here: the chunker never closes a clause on
    buffer-end (see clause_chunker.py), so flush() is what releases the final
    clause of any complete text, one-shot or not.
    """
    chunker = ClauseChunker()
    clauses = chunker.feed(text)
    remainder = chunker.flush()
    if remainder:
        clauses.append(remainder)
    return clauses


@app.websocket("/ws/audio")
async def capture_browser_audio(websocket: WebSocket) -> None:
    """Process one browser call's raw 16 kHz PCM stream."""
    security: SecuritySettings = websocket.app.state.security
    if security.ws_auth_token:
        # Checked before accept(): a WS client (browser or otherwise) has no
        # way to set a custom header on the handshake, so the token travels
        # as a query param instead - see BACKEND_COMPLETION.md Sec4. Reject
        # before accept() rather than accept-then-close, so an unauthorized
        # caller never gets a "connected" event at all.
        token = websocket.query_params.get("token")
        if token != security.ws_auth_token:
            await websocket.close(code=4401)
            return

    await websocket.accept()
    connection_id = str(uuid4())
    settings: AudioSettings = websocket.app.state.settings
    asr: IndicConformerAsr = websocket.app.state.asr
    conversation: ConversationManager = websocket.app.state.conversation
    llm: LlmClient = websocket.app.state.llm
    tts: SvaraTts = websocket.app.state.tts
    call_store: CallEventStore = websocket.app.state.call_store
    send_lock = asyncio.Lock()
    language = settings.language
    started = False
    chunks_received = 0
    bytes_received = 0
    pcm_buffer = bytearray()
    partial_frame_count = 0

    call_store.start_call(connection_id)

    async def send_event(payload: dict[str, object]) -> None:
        async with send_lock:
            await websocket.send_json(payload)
        await asyncio.to_thread(call_store.record, connection_id, payload)

    try:
        segmenter = TenVadSegmenter(settings)
    except Exception as error:
        logger.exception("TEN VAD failed to initialize")
        await send_event({"type": "pipeline_error", "stage": "vad", "message": str(error)})
        await websocket.close(code=1011)
        return

    transcription_queue: asyncio.Queue[tuple[np.ndarray, str, str] | None] = asyncio.Queue()
    # ("greeting" | "utterance", text) - both go through one queue/worker so a
    # fast caller turn can never overtake the call's opening greeting; see
    # handle_conversation_turns().
    conversation_queue: asyncio.Queue[tuple[str, str] | None] = asyncio.Queue()
    # Tracks whichever speak() task is currently synthesizing/sending audio, so
    # queue_segment() can cancel it the moment the caller barges in - see
    # BACKEND_COMPLETION.md Sec3.2 and backend/barge_in.py.
    active_speech = ActiveSpeech()

    async def speak(text: str) -> None:
        """Chunk one agent reply into clauses and synthesize+send each in turn.

        Full-reply-then-chunk for v1, not token-level streaming (see
        BACKEND_COMPLETION.md Sec6 item 2 / _split_reply_into_clauses) - so
        this waits for the complete text before the first clause goes out.

        Cancellable mid-clause for barge-in: a caller speaking over the agent
        cancels the task running this coroutine (see queue_segment()). There
        is no separate outbound audio queue to flush - the for loop below is
        what's in flight, so cancelling it is what stops any further clause
        from ever being synthesized or sent.
        """
        clauses = _split_reply_into_clauses(text)
        if not clauses:
            return

        await send_event({"type": "agent_speaking_start", "sample_rate": tts.sample_rate if tts.ready else None})
        if not tts.ready:
            await send_event(
                {
                    "type": "agent_error",
                    "message": (
                        "TTS model is unavailable. backend/tts.py's load() is a "
                        "placeholder until a real svara-TTS reference is wired in."
                    ),
                }
            )

        try:
            for clause in clauses:
                await send_event({"type": "agent_clause", "text": clause})
                if not tts.ready:
                    continue
                async with websocket.app.state.tts_semaphore:
                    result = await asyncio.to_thread(tts.synthesize, clause, language)
                if result.samples.size:
                    async with send_lock:
                        await websocket.send_bytes(result.samples.tobytes())
        except asyncio.CancelledError:
            logger.info("agent speech interrupted by barge-in: %s", connection_id)
            with suppress(WebSocketDisconnect, RuntimeError):
                await send_event({"type": "agent_interrupted"})
            return

        await send_event({"type": "agent_speaking_end"})

    async def handle_conversation_turns() -> None:
        while True:
            item = await conversation_queue.get()
            try:
                if item is None:
                    return
                kind, payload = item
                reply_text = payload if kind == "greeting" else await conversation.handle_utterance(connection_id, llm, payload)
                speak_task = asyncio.create_task(speak(reply_text))
                active_speech.set(speak_task)
                try:
                    await speak_task
                finally:
                    active_speech.clear(speak_task)
            except Exception as error:
                logger.exception("agent turn failed for %s", connection_id)
                with suppress(WebSocketDisconnect, RuntimeError):
                    await send_event({"type": "agent_error", "message": str(error)})
            finally:
                conversation_queue.task_done()

    async def queue_segment(update: VadUpdate) -> None:
        nonlocal partial_frame_count
        if update.speech_started:
            await send_event({"type": "vad_start", "probability": round(update.probability, 4)})
            logger.info("speech started: %s", connection_id)
            if active_speech.interrupt():
                logger.info("barge-in: cancelling in-flight agent speech for %s", connection_id)

        if not update.speech_ended:
            if segmenter.in_speech and asr.ready:
                # BACKEND_COMPLETION.md Sec3.4: interim transcripts while the
                # caller is still mid-utterance, via the fast CTC branch -
                # throttled (not every 16ms VAD hop) since a rolling-buffer
                # decode isn't free, and interim results don't need to update
                # faster than a caller can perceive anyway.
                partial_frame_count += 1
                if partial_frame_count % PARTIAL_TRANSCRIPT_INTERVAL_FRAMES == 0:
                    buffer = segmenter.peek_utterance()
                    if buffer is not None:
                        partial_text = await asyncio.to_thread(asr.transcribe_partial, buffer, language)
                        if partial_text:
                            await send_event({"type": "partial_transcript", "text": partial_text})
            return
        partial_frame_count = 0

        await send_event(
            {
                "type": "vad_end",
                "probability": round(update.probability, 4),
                "reason": update.end_reason,
            }
        )
        if update.samples is not None:
            await transcription_queue.put((update.samples, language, update.end_reason or "silence"))
        logger.info("speech ended: %s (%s)", connection_id, update.end_reason)

    async def transcribe_segments() -> None:
        while True:
            item = await transcription_queue.get()
            try:
                if item is None:
                    return
                samples, segment_language, reason = item
                duration_ms = round(len(samples) / settings.sample_rate * 1000)
                if not asr.ready:
                    await send_event(
                        {
                            "type": "asr_error",
                            "message": "ASR model is unavailable. Accept the model terms and set HF_TOKEN, then restart the server.",
                        }
                    )
                    continue

                await send_event({"type": "asr_start", "duration_ms": duration_ms, "language": segment_language})
                async with websocket.app.state.asr_semaphore:
                    transcript = await asyncio.to_thread(asr.transcribe, samples, segment_language)
                transcript = transcript.strip()
                await send_event(
                    {
                        "type": "transcript",
                        "text": transcript,
                        "language": segment_language,
                        "duration_ms": duration_ms,
                        "endpoint_reason": reason,
                    }
                )
                if transcript:
                    await conversation_queue.put(("utterance", transcript))
                logger.info("transcribed %s ms as %s for %s", duration_ms, segment_language, connection_id)
            except Exception as error:
                logger.exception("ASR failed for %s", connection_id)
                with suppress(WebSocketDisconnect, RuntimeError):
                    await send_event({"type": "asr_error", "message": str(error)})
            finally:
                transcription_queue.task_done()

    worker = asyncio.create_task(transcribe_segments())
    conversation_worker = asyncio.create_task(handle_conversation_turns())
    logger.info("audio pipeline connected: %s", connection_id)
    await send_event(
        {
            "type": "ready",
            "connection_id": connection_id,
            "audio_format": "pcm_s16le",
            "sample_rate": settings.sample_rate,
            "vad_hop_size": settings.vad_hop_size,
            "asr_ready": asr.ready,
            "asr_language": language,
            "asr_decoding": settings.decoding,
            "conversation_ready": conversation.ready,
            "tts_ready": tts.ready,
        }
    )

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break

            text_message = message.get("text")
            if text_message is not None:
                try:
                    payload = json.loads(text_message)
                    event_type = payload.get("type")
                    if event_type == "call_started":
                        language = _validate_start_event(payload, settings)
                        started = True
                        await send_event({"type": "pipeline_configured", "language": language})
                        if conversation.ready:
                            greeting = conversation.start_call(connection_id, agent_name=conversation.settings.agent_name)
                            await conversation_queue.put(("greeting", greeting))
                        else:
                            await send_event(
                                {
                                    "type": "agent_error",
                                    "message": "Conversation Manager is unavailable (master prompt failed to load).",
                                }
                            )
                        logger.info("audio capture started: %s (%s)", connection_id, language)
                    elif event_type == "call_ended":
                        final_update = segmenter.flush()
                        if final_update:
                            await queue_segment(final_update)
                        logger.info("audio capture ended: %s", connection_id)
                    elif event_type == "user_text":
                        # Typed-caller input for manual testing (frontend's
                        # DirectTestingPanel) - bypasses VAD/ASR entirely and
                        # feeds the same conversation_queue a real transcript
                        # would, so it drives the identical LLM/tool/TTS path
                        # as a spoken turn.
                        if not started:
                            await send_event(
                                {"type": "protocol_error", "message": "send call_started before user_text"}
                            )
                        else:
                            text = str(payload.get("text", "")).strip()
                            if text:
                                await conversation_queue.put(("utterance", text))
                    else:
                        logger.info("audio event %s: %s", connection_id, event_type)
                except (TypeError, ValueError, json.JSONDecodeError) as error:
                    await send_event({"type": "protocol_error", "message": str(error)})
                continue

            audio_chunk = message.get("bytes")
            if audio_chunk is None:
                continue
            if not started:
                await send_event({"type": "protocol_error", "message": "send call_started before audio"})
                continue

            chunks_received += 1
            bytes_received += len(audio_chunk)
            pcm_buffer.extend(audio_chunk)
            frame_bytes = settings.vad_hop_size * np.dtype("<i2").itemsize
            while len(pcm_buffer) >= frame_bytes:
                frame = np.frombuffer(pcm_buffer[:frame_bytes], dtype="<i2").copy()
                del pcm_buffer[:frame_bytes]
                await queue_segment(segmenter.process(frame))

            if chunks_received % 100 == 0:
                logger.info(
                    "audio capture %s: %d chunks, %d bytes received",
                    connection_id,
                    chunks_received,
                    bytes_received,
                )
    except WebSocketDisconnect:
        pass
    finally:
        final_update = segmenter.flush()
        if final_update:
            with suppress(WebSocketDisconnect, RuntimeError):
                await queue_segment(final_update)
        await transcription_queue.put(None)
        await conversation_queue.put(None)
        worker.cancel()
        conversation_worker.cancel()
        with suppress(asyncio.CancelledError):
            await worker
        with suppress(asyncio.CancelledError):
            await conversation_worker
        conversation.end_call(connection_id)
        call_store.end_call(connection_id)
        logger.info(
            "audio pipeline disconnected: %s (%d chunks, %d bytes)",
            connection_id,
            chunks_received,
            bytes_received,
        )
