# AICA Backend — Completion & Rework Plan

**Reviewed:** `AICA-backend-main` (commit snapshot in zip)
**Target flow:**
```
Patient speaks Tamil -> Streaming STT -> LLM (Llama 3.1 8B / Qwen2.5-7B) -> stream tokens
-> svara-TTS (streaming, cloned voice) -> 8kHz PCM -> SIP/WebRTC -> Phone
```
**Reference diagram in repo** (`assets/LLM-Flow.png`): Website -> Mic -> WebSocket -> VAD -> ASR ->
**Conversation Manager** (master prompt + state) -> **LLM** (streaming) -> **TTS** (streaming) -> Browser.

---

## 1. What's actually in the repo today

| Stage in the target flow | Status | Evidence |
|---|---|---|
| Browser mic capture, 16 kHz PCM | Done | `legacy_test_client/audio-stream.js`, `legacy_test_client/index.html` |
| WebSocket transport | Done | `backend/main.py` `/ws/audio` |
| VAD / turn segmentation | Done, well tested | `backend/vad.py` (TEN VAD), `test_vad.py` (6 tests, all state-machine branches covered) |
| Streaming STT | Partial | `backend/asr.py` -> AI4Bharat IndicConformer, but **not streaming**: it waits for `vad_end` (full utterance) then runs one batch `transcribe()` call. This is "utterance-final STT", not "streaming STT" as the flow specifies. |
| **Conversation Manager (master prompt + state/ledger)** | Missing entirely | No code references `golden/main_prompt.txt`. It exists only as a design artifact. |
| **LLM (Llama 3.1 8B / Qwen2.5-7B, streaming)** | Missing entirely | No LLM client, no model server config, nothing downstream of `transcript` event. |
| **Tool calling** (`lookupPatient`, `bookAppointment`, `dispatchAmbulance`, etc. — 22 tools listed in the prompt) | Missing entirely | No tool layer, no mock/real CRM, no DB. |
| **svara-TTS (streaming, cloned voice)** | Missing entirely | No TTS client, no voice asset, no audio-out path at all. |
| **8 kHz PCM resampling for telephony** | Missing entirely | Everything in the repo is 16 kHz, browser-only. |
| **SIP / WebRTC -> real phone line** | Missing entirely | The only transport is a raw browser `WebSocket`. There is no SIP trunk, no PBX/media-server integration, no way for an actual phone call to reach this pipeline. |
| Barge-in (caller interrupts AICA mid-sentence) | Missing entirely | No concept of an active TTS stream to cancel; VAD only feeds ASR, not an interrupt signal to a (non-existent) speaking agent. |
| Golden-flow evaluation harness | Missing entirely | `golden/flows/*.txt` (20 flows) and `golden/main_prompt.txt` are unused reference/eval data — no script consumes them. |
| Observability / call events for a dashboard | Partial | Rich structured WS events exist (`ready`, `vad_start`, `vad_end`, `asr_start`, `transcript`, `asr_error`) but nothing persists them (no DB, no log sink), so there is no call history for the frontend's Call Log / Dashboard to read. |

**Bottom line:** the backend is a solid, well-tested **speech-to-text front half** of the pipeline
(WS -> VAD -> ASR). Everything after "get a Tamil transcript" — which is most of the product —
does not exist yet. It is *not* an "incomplete but broadly-there" backend; it is roughly the
first 25% of the diagram, built to a high standard, with the remaining 75% still to design.

### Code-quality notes on what exists (keep this standard for new code)
- `settings.py` centralizes tunables via env vars with clear comments on *why* each default was chosen — keep this pattern for LLM/TTS config.
- `vad.py` / `asr.py` are cleanly separated, unit-tested with fakes/stubs (no GPU/model needed to test logic) — replicate this for the LLM and TTS adapters (inject a fake client, test orchestration logic without hitting a real model).
- `main.py`'s per-connection state (queues, locks, `asyncio.to_thread` for blocking model calls) is a reasonable pattern to extend, **but** it currently holds one global `asr_lock` — see §3.4, this will not scale to concurrent calls once GPU-bound LLM/TTS calls are added.
- Python is pinned to 3.10/3.11 solely because of the NeMo/AI4Bharat fork. This constraint will ripple into every new dependency choice (see §5).

---

## 2. Target architecture (fills the gap)

```
Phone (PSTN) --SIP trunk--> SIP/RTP Gateway (new) --8kHz PCM--> Session Orchestrator
                                                                          |
Browser mic --WebSocket--> (existing) /ws/audio, 16kHz PCM --------------+
                                                                          v
                                                                 +-----------------+
                                                                 | VAD  (existing) |
                                                                 +--------+--------+
                                                                          v
                                                        +-------------------------------+
                                                        | Streaming ASR (rework to       |
                                                        | chunked/partial decoding)      |
                                                        +---------------+---------------+
                                                                        v
                                                        +-------------------------------+
                                                        | Conversation Manager (NEW)     |
                                                        | - loads golden/main_prompt.txt |
                                                        | - per-call ledger/state (Redis)|
                                                        | - flow router (20 intents)     |
                                                        | - tool-call executor           |
                                                        +---------------+---------------+
                                                                        v
                                                        +-------------------------------+
                                                        | LLM client (NEW)               |
                                                        | Llama 3.1 8B / Qwen2.5-7B       |
                                                        | served via vLLM/TGI, streamed   |
                                                        +---------------+---------------+
                                                                        v token stream
                                                        +-------------------------------+
                                                        | TTS client (NEW)               |
                                                        | svara-TTS streaming, cloned voice|
                                                        | sentence-chunked synthesis      |
                                                        +---------------+---------------+
                                                                        v 8kHz PCM / u-law
                                                        +-------------------------------+
                                                        | Back out over SIP/RTP (phone)  |
                                                        | or WS (browser) - same session |
                                                        +-------------------------------+
```

Key design decision: **the Conversation Manager is the new center of gravity**. Today `main.py`
routes `transcript` straight into a WS event to the browser. It should instead route into an
orchestrator that (a) holds the ledger, (b) calls the LLM, (c) executes tools, (d) streams TTS
audio back out, and (e) can be interrupted by a new `vad_start` (barge-in).

---

## 3. Work items, in priority order

### 3.1 Conversation Manager + LLM integration (P0 — this is the missing core)
- New module `backend/conversation.py`:
  - Load `golden/main_prompt.txt` once at startup (it's a ~9k-word system prompt — treat it as a template with `{{agent_name}}`, `{{caller_mobile}}`, `{{mrn}}`, `{{campaign}}` etc. substituted per call from caller metadata / CRM lookup).
  - Maintain the **ledger** described in the prompt (§4 of the prompt) as actual server-side state per `connection_id`, not just an LLM-context convention — store it in Redis (or in-process dict for a v1) keyed by `connection_id`, so a disconnect/reconnect (e.g. SIP re-INVITE) doesn't lose call context.
  - Implement the tool interface the prompt already assumes: `lookupPatient`, `verifyIdentity`, `searchSlots`, `bookAppointment`, `rescheduleAppointment`, `cancelAppointment`, `confirmAppointment`, `raiseRefill`, `bookLabOrder`, `getReportStatus`, `resendReport`, `getReferralStatus`, `getPolicyDetails`, `createPreAuth`, `getBill`, `createTicket`, `logRecordsRequest`, `registerPatient`, `dispatchAmbulance`, `escalate`, `transferCall`, `hangUp`. For v1, back these with a mock/fixture data layer (a JSON "hospital DB" is enough to run all 20 golden flows end to end); design the interface so a real HMS/EHR integration can be swapped in later without touching the LLM plumbing.
- New module `backend/llm.py`:
  - Wrap an OpenAI-compatible streaming client (works for both vLLM and TGI) rather than hand-rolling a transport — this keeps the model swappable (Llama 3.1 8B -> Qwen2.5-7B -> a future model) via one base-URL/model-name env var.
  - Use function/tool calling (both candidate models support OpenAI-style tool calling through vLLM's `--enable-auto-tool-choice`) so the tools above are real structured calls, not regex-parsed text.
  - Stream tokens; hand sentence-boundary chunks (not raw tokens) to TTS — see 3.2.
- Add `type: "agent_speaking_start" / "agent_token" / "agent_speaking_end"` WS events (mirroring the existing `vad_start`/`asr_start` naming convention already in `main.py`) so any client (browser or dashboard) can show partial agent text if desired.

### 3.2 Streaming TTS (svara-TTS) (P0)
- New module `backend/tts.py`.
- **Chunk at sentence/clause boundaries, not full LLM completions.** The Tamil prompt is written for short turns (<=40 words, "one question per turn" — §3 of `main_prompt.txt`), which is good: it keeps LLM-completion-to-first-audio latency low, but you still don't want to wait for the *whole* completion before synthesizing. Feed the LLM stream into a sentence splitter (Tamil/English code-mixed — do not use a naive `.` splitter, since English abbreviations like "Dr." and Tamil numerals are common in this script) and start TTS on the first complete clause.
- Voice cloning: cache the cloned-voice reference/embedding once at startup (same pattern as `IndicConformerAsr.load()` pre-loading the ASR model in the `lifespan` handler) — do not re-run voice cloning per call.
- Output at whatever native rate svara-TTS produces, then resample once, centrally, in the output-transport layer (see 3.3) rather than inside `tts.py` — keeps the TTS adapter transport-agnostic (same code path serves both the 16kHz browser socket and the 8kHz SIP leg).
- **Barge-in**: the moment VAD emits a fresh `speech_started` while the agent is speaking, the orchestrator must cancel the in-flight TTS generation and stop sending further audio frames immediately (flush the outbound queue). This is a hard product requirement for a phone-call agent — nothing in the current code models "the agent is currently talking," so this is new state, not a small addition.

### 3.3 SIP / WebRTC telephony gateway (P0 — currently 0% built)
The current transport is a browser `WebSocket` only. There is no way for a real phone call to
reach this system. Two realistic paths, pick one for v1:

- **Option A — managed media streams (fastest to ship):** Use a SIP trunk provider whose product
  can bridge PSTN calls to a WebSocket you control (e.g. Twilio Media Streams, Plivo Audio
  Streams, Exotel Voice Streaming — several Indian telephony providers now offer this and matter
  for Tamil/India call routing and DID numbers specifically). You get PCM/u-law frames over a
  WebSocket with a similar shape to what `main.py` already parses — the `/ws/audio` handler is a
  good starting point to adapt, not throw away.
- **Option B — self-hosted SIP (more control, more work):** A SIP/RTP endpoint via
  `drachtio` + `rtpengine`, or FreeSWITCH/Asterisk with a custom media application, terminating
  SIP from a carrier trunk and handing raw RTP audio to this same Python service over a local
  socket. This avoids per-minute vendor media-stream fees at scale but is materially more
  infrastructure to operate and secure (SBC, NAT traversal, RTP codecs — G.711 u-law is the
  standard 8kHz telephony codec you'll be transcoding to/from).
- Either way: **the 8kHz requirement in your target flow is a telephony-codec constraint** (G.711
  is 8kHz), while VAD/ASR here are hard-pinned to 16kHz (`settings.py` comments say so explicitly
  for both). That means a resampling step is mandatory on both legs — inbound SIP audio (8kHz) —
  upsample to 16kHz before VAD/ASR, and outbound TTS audio — downsample to 8kHz before it goes
  back over SIP/RTP. Keep this resampling in one shared module (`backend/audio_transcode.py`) so
  both directions and both transports (browser 16kHz passthrough, SIP 8kHz) reuse it instead of
  duplicating resampling logic per transport.
- Add a new route/handler analogous to `capture_browser_audio` for the SIP/media-stream leg —
  it should share the VAD/ASR/orchestrator pipeline, differing only in the transport-specific
  framing (SIP media stream payload vs raw WS bytes) and the resampling step above.

### 3.4 Streaming ASR (upgrade from utterance-final)
Currently ASR only runs *after* `vad_end` closes a turn (`main.py` lines ~91-99). For a natural
phone conversation you generally want at least **partial/interim transcripts** so the
Conversation Manager can start reasoning before the caller finishes a long sentence, especially
given the golden prompt allows longish turns from callers. This is a real rework, not a small
patch, because NeMo's `transcribe()` as used today is a single batched call. Two pragmatic
options:
1. Keep final-only transcription (simplest, matches current well-tested code) for v1, and rely on
   the VAD's `endpoint_silence_frames` (currently 480ms) tuning to keep perceived latency low —
   this is a legitimate v1 scope cut, just document it as one rather than silently shipping it.
2. If true partial transcripts are required, IndicConformer's CTC branch (already available via
   `ASR_DECODING=ctc`, see `settings.py`) is fast enough to run incrementally on a rolling buffer
   for interim results, while the more accurate RNNT decode still runs once at `vad_end` for the
   final transcript sent to the LLM. This is meaningfully more complex — recommend deferring
   until v1 latency is measured and found wanting.

### 3.5 Concurrency: the ASR lock will bottleneck the whole call center
`main.py` uses one `app.state.asr_lock` shared across **all** concurrent WebSocket connections
(line 35, 120). That means two simultaneous calls' ASR work is serialized on the same lock today
— already a scaling limit even before LLM/TTS exist. Once GPU-bound LLM inference and TTS
synthesis are added, per-call serialization on a single global lock will not survive more than a
handful of concurrent calls. Plan for:
- A small pool of ASR/LLM/TTS worker slots (bounded by GPU memory), with calls queued fairly
  rather than one global mutex.
- Or move ASR/LLM/TTS behind dedicated inference servers (vLLM for the LLM, a Triton/BentoML-style
  server for ASR+TTS) so `main.py` becomes a thin orchestration/transport layer that issues async
  network calls instead of holding blocking model calls itself. This is the more scalable choice
  and also decouples the Python 3.10/3.11 NeMo constraint from whatever the LLM/TTS servers need.

### 3.6 Persistence & the golden-flow eval harness
- `golden/flows/flow_*.txt` (20 files) + `golden/main_prompt.txt` are currently inert reference
  data. Build a small offline eval script that replays each flow's caller turns against the
  live Conversation Manager + LLM and diffs the agent's behavior against the flow's documented
  `OUTCOME`/entities — this is exactly what the golden set is for, and it's the natural
  regression test for prompt/model changes going forward. `golden/tamil_english_call_flows.pdf`
  is presumably the source-of-truth narrative version of the same 20 flows — worth confirming it
  and the `.txt` files agree.
- Persist call events (the `vad_*`/`transcript`/tool-call/agent-turn events) to a database, not
  just over the WebSocket. Right now nothing survives a disconnect — there is no call history at
  all. This is also the missing link to the frontend: its entire Call Log / Dashboard / Simulation
  UI (see the companion frontend report) expects exactly this kind of persisted call record and
  currently has nothing to read.

### 3.7 Testing gaps introduced by the new work
The existing `test_vad.py`/`test_asr.py` pattern (stub the model, test orchestration logic) is
good — continue it:
- `test_conversation.py`: fake LLM client returning scripted tool calls, assert ledger updates,
  no-re-ask behavior, and flow-switch handling.
- `test_tts.py`: fake TTS client, assert sentence-chunking boundaries and barge-in cancellation.
- Golden-flow replay harness doubles as an integration test suite.

---

## 4. Security / compliance (not yet addressed anywhere in the repo)
This is a hospital call agent handling patient identity, DOB, medical records, and billing —
real PII/PHI-adjacent data. None of the following exists yet and all of it should land before any
real phone number is connected:
- No auth on `/ws/audio` at all today — anyone who can reach the port can open a session.
- No encryption-at-rest story for the ledger/call-recording data once persistence (3.6) lands.
- No mention of consent/recording-disclosure for calls, relevant given `main_prompt.txt`'s
  emergency and clinical flows.
- `.env`-based `HF_TOKEN` handling is fine for local dev; production secrets (LLM API keys, TTS
  keys, SIP trunk credentials, DB creds) need a real secrets manager, not `.env` files, once this
  moves off a laptop.

## 5. Dependency/runtime constraint to carry forward
`run.sh` and `README.md` are explicit that AI4Bharat's NeMo fork hard-pins Python to 3.10/3.11.
Whatever you choose for the LLM serving stack (vLLM, TGI) and SIP stack (drachtio, FreeSWITCH
bindings) should be evaluated against this constraint *or* isolated into a separate service/
container so ASR isn't blocking your choice of LLM/TTS/SIP tooling versions. Running ASR in its
own container and everything else in a modern Python (3.12+) container is probably the pragmatic
answer rather than fighting the NeMo pin project-wide.

## 6. Suggested delivery order
1. Conversation Manager + LLM (mock tools first, in-process ledger) — get a **text-only** chat
   loop working end-to-end against the golden flows before touching audio.
2. Streaming TTS wired to the browser WS output (still browser-only, no SIP yet) — now you have
   the full voice-in/voice-out loop the reference diagram shows, in the browser.
3. Barge-in handling.
4. Persistence + golden-flow eval harness (lock in quality before scaling out).
5. SIP/WebRTC telephony gateway + 8kHz resampling — this is the step that turns it from a browser
   demo into an actual phone-answering system.
6. Concurrency/scaling rework (worker pools, move off the global `asr_lock`).
7. Security hardening pass before any production phone number is live.

---

## Progress log

- **Item 1 (Conversation Manager + LLM, text-only, mock tools) — done, commit `0875dfa`.**
  `backend/llm.py` (streaming OpenAI-compatible client), `backend/tools.py` (all 22 tools from
  `golden/main_prompt.txt` Sec10, mock hospital DB), `backend/conversation.py` (prompt templating,
  per-connection ledger, LLM<->tool-call loop). Deliberately not wired into `main.py` yet, per
  the Sec6 delivery order - that lands with item 2.

- **Item 2 (streaming TTS wired to the browser WS output) — done, commits `b36c64c`, `e227a13`,
  `edbdeb1`.** `backend/tts.py` (`SvaraTts` adapter - `load()` is a placeholder, real model load
  deliberately deferred, see Sec3.2), `backend/clause_chunker.py` (sentence/clause-boundary
  splitting, Tamil/English abbreviation-aware), and `main.py` wiring: `capture_browser_audio` now
  routes each transcript through `ConversationManager.handle_utterance()` then `speak()`, which
  chunks the reply into clauses and synthesizes+sends each over the same WS as new
  `agent_speaking_start` / `agent_clause` / `agent_speaking_end` events. Full-reply-then-chunk for
  v1, not token-level LLM streaming into TTS - a legitimate scope cut per Sec3.2, not silently
  shipped. TTS/ASR each still gated behind one global `app.state.tts_lock` / `asr_lock` - the
  Sec3.5 concurrency rework (item 6) is what removes that.

- **Item 3 (barge-in handling) — done.** `backend/barge_in.py`'s `ActiveSpeech` tracks whichever
  `speak()` task is currently synthesizing/sending audio; `main.py`'s `queue_segment()` cancels it
  the instant a fresh `vad_start` fires mid-speech, and `speak()` catches the resulting
  `CancelledError` around its per-clause loop, sends a new `agent_interrupted` event instead of
  `agent_speaking_end`, and returns - no further clause is ever synthesized or sent once cancelled.
  Scoped to TTS/audio-out only, per Sec3.2: barging in while the LLM is still generating the
  *previous* reply (agent hasn't started speaking yet) is unaffected, and an interrupted turn's
  full reply text still lands in `session.messages` as if said in full (not truncated to "only
  what was audibly played") - both are deliberate v1 simplifications, not oversights.
  `ActiveSpeech` has full unit coverage (`test_barge_in.py`); the `main.py` wiring itself has no
  direct test, consistent with `main.py` having no unit tests at all today - **known gap:** a
  dedicated `test_main.py` integration-test pass (FastAPI `TestClient` + stubbed
  asr/llm/tts/conversation) is planned as its own item once items 3-7 are all done, not before.
