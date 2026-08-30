# AICA-aruvi — handoff for the next session

Branch `backend`. All work is **UNCOMMITTED**. `pytest -q` is green at
**190 passed** in ~5s (was 185; +5 this session, 0 broken).

---

## 0. HOW TO WORK ON THIS REPO (read first)

This project has burned entire sessions on confident wrong fixes. The rules
below are not style preferences, each one is a scar.

1. **Measure before you change anything.** Every claim in this file has a
   number behind it. If you are about to "fix" something you have not
   measured, you are guessing. **This session deleted three numbers the last
   handoff stated confidently** (§2) — including the one it nominated as the
   top priority. Check inherited numbers before building on them.
2. **`LLM_TEST_RESULTS.txt` is the lab notebook.** PART 7 = tool-calling and
   safety. PART 8 = the TTS latency work. Read the part relevant to your task
   IN FULL before touching code. It records what was tried AND what failed,
   which is the expensive half.
3. **Exemplars are the specification, prose is commentary.** A rule written
   directly at a behaviour has made things worse every time it has been tried
   on this 4B model. A rule DEMONSTRATED in `golden/flow_exemplars.json` has
   held every time. (PART 7.2) — and see §5, where a rule stated three times
   in emphatic prose is still the single biggest quality failure.
4. **Run evals at `LLM_TEMPERATURE=0`.** At the 0.3 default the same prompt
   scored 9/14, 13/14, 9/14 in one session — noise wider than any change being
   measured. 0.3 stays the product default; 0 is the measurement setting.
5. **A test that cannot fail is worth nothing.** Both guards added this session
   were verified by reintroducing the bug and confirming the test caught it.
   Do this for any non-trivial guard you add.
6. **Don't ship what you cannot verify.** This session built per-flow tool
   selection, measured that its derivation was wrong, and reverted it (§6)
   rather than ship a plausible-looking regression into the one area with no
   trustworthy eval.
7. Don't re-derive the machine setup in §7. It is settled.

---

## 1. WHAT THE GOAL IS

A real-time Tamil/English hospital phone agent that actually **books, cancels,
dispatches and completes what it tells the caller it did**, at usable latency.
Not a demo that talks convincingly and does nothing.

**The user's current priority:** an MVP where the *prominently visible* things
are realistic and perfected — speech, transcript and response in real time,
"quality response in minimal time with zero flaws". Tool-calling correctness
was explicitly deprioritised; do not restart that work unless asked. §6
preserves its state.

---

## 2. THREE INHERITED NUMBERS THAT WERE WRONG — check before reusing

The previous handoff stated these confidently. All three were measured this
session and are false. They are recorded here so nobody re-derives them.

| Claim | Measured reality |
|---|---|
| "The greeting takes ~11s before the caller can speak" — listed as priority item C | **False. 0.98s.** The greeting leaves the server complete in ~1s. It is **7.85s of speech**. The 11.31s in the old probe was playback time, not latency. `turn_probe.py` starts its clock at `call_started` and stops at `agent_speaking_end`, which fires when the audio is *sent*. There is no bug here. |
| "prefix mutated by one word = 28,895ms" — the basis for priority item A | **Stale by orders of magnitude.** Measured now: 3546-token prompt evaluates cold in **1.32s** (2683 tok/s); an identical prefix re-evaluates in **0.08s**. Prompt evaluation is no longer a significant cost. |
| "16.6 → 24–27 tok/s after the Ollama env tuning" | **13.3 tok/s** at the shipped `num_ctx 8192`, with the model at 33% CPU / 67% GPU. Generation, not prompt evaluation, is now the dominant LLM cost. |

**Priority item A from the old handoff ("move the flow PLAYBOOK out of the
cached prefix") is dead — do not do it.** The reasoning it rested on does not
survive contact with how the prefix cache actually works here. The shared
prefix between what `prewarm()` evaluates and what turn 1 sends is the core
prompt *either way*, because the playbook and the exemplars **both** change
when the flow is detected. Reordering them changes which 1k tokens get
re-evaluated, not how many. Verified by dumping both prompts and diffing:
82% shared prefix before the change, and reordering cannot raise that.

---

## 3. DONE THIS SESSION — four fixes, all measured

### A. `localhost` cost 2.05 seconds on every single LLM call ⭐

The largest win available, and it was a hostname.

```
POST /api/chat via http://localhost:11434   wall 2.10s   (ollama's own total_duration: 0.06s)
POST /api/chat via http://127.0.0.1:11434   wall 0.05s   (ollama's own total_duration: 0.05s)
```

Name resolution tries an address the server is not listening on and waits out
a timeout first. Ollama never sees it, so it is invisible in every server-side
metric — it only shows up as wall-clock minus `total_duration`, which is how it
was found. A turn with a tool call makes 2–3 LLM requests and paid it each time.

Fixed in `.env`, `.env.example`, `backend/settings.py` (the default),
`backend/scripts/setup_model.py`, `finetune/README.md`. **Never write
`localhost` in this repo.** The comment at `settings.py:100` says why.

### B. Barge-in fired on a single 16 ms VAD frame

Reported symptom: "the agent is getting interrupted by even small voice from
the microphone". `queue_segment()` called `active_speech.interrupt()` on
`speech_started`, i.e. the **first** hop over the 0.35 threshold — so a cough, a
keystroke or a breath cancelled the agent mid-sentence.

Fix is in `ActiveSpeech.note_speech()` (`backend/barge_in.py`): interrupt only
after `VAD_BARGE_IN_FRAMES` **consecutive** speech frames, default 15 (240 ms).
A spoken word is far longer than the gate; noise blips are one or two hops.
Both call sites were fixed — `main.py` and `telephony.py` had the identical bug.

Capture and ASR are untouched: the utterance is still recorded from its first
frame. Only the *interrupt* is gated.

Guarded by `test_a_noise_blip_does_not_interrupt_but_a_spoken_word_does`,
verified to fail with the gate removed.

### C. TTS had no timeout — one clause could hang the whole turn

Found in the server log, not by looking for it: `21.27s synth` on an 8-character
clause. Edge was timing out (~10s), being retried, and timing out again. Because
the sender is ordered, that one clause held **every later clause's audio** behind
it.

Fix in `EdgeTts._stream_mp3`: `asyncio.timeout(TTS_TIMEOUT_SECONDS)`, default
5s, and **a timeout is not retried** — a stalling endpoint stalls the same way
twice. The text has already been sent, so giving up costs the voice for one
clause and keeps the conversation moving. Guarded by
`test_a_stalled_endpoint_gives_up_instead_of_hanging_the_turn`.

### D. A silent tool call left the caller in total silence

Measured on the live model: turn 3 of a booking call returned a `lookupPatient`
call with **no spoken text at all**, so the caller heard nothing for the tool
round-trip *and* nothing for the generation that followed — the two slowest
things in a turn, back to back, with no audio over either.

`conversation.py` now speaks `HOLDING_LINE` before running the tools when the
model has said nothing this turn. The wording is lifted verbatim from
`runtime_core.txt`'s own TOOLS section ("ஒரு நிமிஷம் சார், system-ல check
பண்றேன்..."), so it is the prompt's line rather than a new invention, and it is
honest — the tool call it promises runs immediately after.

Deliberately **not** appended to `session.messages`: history stays faithful to
what the model produced, while `spoken` is what the caller heard, which is what
grounding and the call log need. That distinction already existed in the code;
this follows it. Suppressed for `dispatchAmbulance`, `hangUp` and
`transferCall` (`_NO_HOLDING_LINE`) — an emergency demands speed and a
said-out-loud confirmation, not "one moment, I'll check the system".

Three tests cover it, including the two suppression cases.

---

## 4. WHERE THE LATENCY IS NOW — measured end to end

Measured on the exact production path (`ConversationManager` + real
`LlmClient` + real `TOOL_SCHEMAS` + real `ClauseChunker`, no websocket, no TTS):

| | first token | first clause | full reply |
|---|---|---|---|
| turn 1 (after prewarm) | 3.28s | 4.80s | 7.37s |
| turn 2 (warm prefix) | **0.59s** | **2.29s** | 8.57s |

Add ~1s of Edge synthesis for first audio. Component costs:

- **Prompt evaluation is solved.** 0.08s on a cache hit; 1.3s on turn 1, whose
  prompt genuinely differs (the flow is now known). Do not spend more effort here.
- **Generation is the bottleneck: 13.3 tok/s.** 33% of the model is on CPU
  because the KV cache for `num_ctx 8192` does not fit alongside the weights in
  4GB.
- **First token → first clause is 1.5–1.7s**, i.e. the chunker accumulating
  ~20 tokens at 13 tok/s. `FIRST_CHUNK_MAX_CHARS = 32` in `clause_chunker.py`
  is the knob; lowering it trades naturalness for perceived latency. Untested.

### num_ctx sweep — measured, and deliberately NOT shipped

Real prompt, real KV cache, generation only:

| num_ctx | gen |
|---|---|
| 8192 (shipped) | 13.3 tok/s |
| 6144 | 14.3 tok/s |
| 5120 | 15.3 tok/s |
| 4608 | 16.0 tok/s |

20% for the whole range. **Rejected:** the assembled prompt is already 3546
tokens *before* the 22 tool schemas (~1600 more), so 4608 leaves almost no room
for a call's history, and overflowing it truncates the system prompt — the exact
failure the Modelfile comment warns about. Revisit only after the prompt shrinks
(§5). The Modelfile's claim of a "~1.5-2.5k token assembled prompt" is stale;
it is 3546 without tools.

---

## 5. THE BIGGEST OPEN QUALITY LEVER — measured, not yet acted on

`register_eval` at `LLM_TEMPERATURE=0`:

```
10/14 turns mechanically clean   — with all 22 tool schemas (shipped today)
12/14 turns mechanically clean   — with tool schemas removed entirely
```

**~1600 tokens of tool JSON in front of a 4B model is measurably degrading its
conversation.** (Same run, same scenarios, temperature 0, so this is not noise.)

Every single failure in the shipped run is **the same rule**: two questions in
one turn. `runtime_core.txt:29` states it three times in one line — "Ask exactly
ONE question per turn, and the question is ALWAYS last. Never two questions in
one turn." The model breaks it anyway. Per rule 3, more prose will not fix this;
it needs either exemplars or a deterministic guard.

Two candidate directions, neither started:

1. **Shrink the prompt** so the model has less to hold. The tool schemas are
   the obvious target but see §6 — the safe derivation does not exist yet. The
   schemas themselves are already tight (one-line descriptions, bare string
   params, 294 chars/tool); there is no fat to trim inside them.
2. **A deterministic one-question guard.** Attractive because the rule is hard
   and mechanical, but it is *not* a simple truncation: clauses are streamed to
   TTS as they are produced, so by the time a second question is visible the
   first has already been spoken; and cutting the LLM stream early would also
   cut the tool call that arrives at the end of it. Anyone attempting this must
   read `stream_utterance` first. Do not start it as a "quick fix".

Also visible in the transcript and not yet quantified: when the caller speaks
English throughout, the agent replied 100% Tamil (`runtime_core` Sec2 says shift
to majority English). `register_eval` does not currently score this.

---

## 6. PER-FLOW TOOL SELECTION — built, measured, REVERTED

Worth recording so the next person does not rebuild it.

The idea: send only the tools the detected flow needs, cutting ~1200 tokens per
request and recovering most of the §5 win. The elegant version derives the set
from the playbook body itself — the playbook names the tools it drives, so
there is no second list to drift.

**It does not work.** Measured across all 20 flows, the playbooks name only the
flow's *terminal action* tool. They do not name the shared ones:

```
appointment.book    -> searchSlots, bookAppointment        (no lookupPatient!)
billing.query       -> createTicket                        (no getBill)
referral.status     -> (nothing)                            (no getReferralStatus)
emergency.escalate  -> (nothing)
```

`appointment.book` losing `lookupPatient` is a guaranteed functional break —
the live model calls it in that flow, and the core prompt requires identifying
the caller. Shipping this would have been a confident wrong fix in the one area
with no trustworthy eval to catch it.

**To do it properly** you need a hand-written intent→tools map (there is a
partial precedent: `INTENT_EXPECTED_TOOL` in `backend/scripts/golden_eval.py`,
manually verified against `tools.py`, but it only records the *terminal* tool),
plus a drift test, plus a trustworthy `golden_eval` before and after. That is
the gate. Do not ship it on a hunch.

---

## 7. MACHINE — do NOT re-derive

- RTX 2050, 4GB VRAM. Ollama has always used it; any "CPU only" note is stale.
- `OLLAMA_FLASH_ATTENTION=1` + `OLLAMA_KV_CACHE_TYPE=q8_0` are persisted user
  env vars for the Ollama **server** process. The tray app must be restarted
  after `setx` to inherit them. Verify with `ollama ps` (~3.6GB, `33%/67%
  CPU/GPU`).
- **NEVER add `PARAMETER num_gpu 99`.** 2× faster on a 13-token prompt, **114
  seconds** on the real 2.7k-token one. Benchmark only with real PromptBuilder
  output.
- Start the server:
  `.venv/Scripts/python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`
  then check `GET /api/health` (all four true). Console at
  `http://localhost:8000/console`.
  **Redirect stdout/stderr to a file when you start it.** Three of this
  session's four fixes were found in the server log, and a hidden window has
  no log.
- **The server caches prompts AND code at startup.** Restart it after editing
  `golden/runtime_core.txt`, `golden/flow_exemplars.json`, or any
  `backend/*.py`.
  Kill with:
  `Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like '*uvicorn*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`
- Full `pytest -q` ≈ 5s (190 tests). Redirected output is block-buffered — it
  can look hung when it is not.
- **Do not run heavy GPU work while the user is testing the console.**
  `golden_eval` alongside `pytest` caused an Ollama CUDA host-buffer OOM.
- **Outbound HTTPS on this box was badly degraded for most of this session**:
  connections established in ~40ms but response *bodies* stalled until timeout,
  on every host tested (Google, HuggingFace, Microsoft's speech endpoint). Edge
  TTS was unusable-to-flaky throughout. If clause synthesis is timing out, test
  the network before suspecting the code — §3C bounds the damage but cannot
  create audio out of a dead link.

### Probes

- `backend/scripts/turn_probe.py` — one real turn over the websocket, when each
  clause's TEXT and AUDIO arrive, with gaps. **Caveat: it sends the caller turn
  ~1s after `call_started`, while `prewarm()` is still running and while a real
  caller would still be listening to 7.85s of greeting.** Its turn-1 numbers are
  therefore pessimistic and its contention is an artefact. Making it wait out
  the greeting's audio duration was drafted and not applied.
- `backend/scripts/edge_probe.py` — sequential vs concurrent Edge synthesis.
- Scratchpad probes worth recreating (`…/scratchpad/`, session-scoped):
  `llm_bench.py` (Ollama `/api/chat` direct — the only way to see
  `prompt_eval_duration` and the wall-clock gap that exposed §3A),
  `turn_bench.py` (production path, no websocket/TTS — the cleanest
  time-to-first-clause instrument), `ctx_sweep.py`, `convo_probe.py`
  (scripted multi-turn call over the websocket).

Both need `sys.stdout.reconfigure(encoding="utf-8")` on this box or they die on
Tamil output with a cp1252 error.

---

## 8. NEXT, IN PRIORITY ORDER

**A. Get a trustworthy `golden_eval`.** Still nobody's seen one. Started this
session at `LLM_TEMPERATURE=0`, killed at flow 6/20 to free the GPU — and
`golden_eval` prints verdicts only at the end, so the partial run scores
nothing. Budget ~2h, alone, nothing else on the GPU. This is the gate on §6 and
on any further prompt surgery.

**B. The two-questions-per-turn failure (§5).** The one quality flaw with
repeated evidence behind it. Read §5's two directions before choosing one.

**C. Verify §3B and §3D on a live call.** Both are unit-tested and neither has
been heard. Specifically: does 240 ms feel right for barge-in on a real mic
(`VAD_BARGE_IN_FRAMES` is the knob), and does the holding line land naturally
or sound canned when the model was about to speak anyway.

**D. TTS off the network.** Now a *reliability* problem as well as the PHI one:
§7 shows the product goes mute when the link degrades. Nothing local is
installed — no Tamil SAPI voice on this box, nothing in the HF cache. The
obvious candidate is `facebook/mms-tts-tam` (VITS via `transformers`, ~145MB,
CPU-capable, `torch` already installed), but it needs a download that the
degraded link could not complete, and a human has to judge the Tamil voice.
Not a solo decision.

**E. `lookup_patient` returning `appointment_id`** (`tools.py`, landed last
session) is still unverified against a live model.

---

## 9. INVARIANTS — each has already cost a session

- `_LANGUAGE_REMINDER` in `conversation.py` **must name "call a tool" BEFORE
  its speaking rules.** A trailing speech-only instruction suppresses tool
  calling entirely. No unit test catches this — they all use a scripted LLM.
- The model keeps the **LAST** sentence of the exemplar turn it copies. Put
  what must survive at the END.
- Exemplar facts must stay disjoint from **both** `tools.py`'s `MockHospitalDb`
  **and** `golden/flows/*.txt`. Two separate invariant tests guard two different
  failure modes (silent memorisation vs. a fake PASS) — do not merge them.
- Grounding deliberately does **not** count the system prompt as a source. The
  exemplars live there, and treating them as provenance is exactly how a
  parroted MRN passes for a real lookup.
- TTS clause audio must be sent by a consumer **independent of clause arrival**
  (PART 8). Draining inline reintroduces the stall.
- Barge-in must be gated on **sustained** speech, never on `speech_started`
  (§3B). One frame is a cough.
- `HOLDING_LINE` goes into `spoken`, never into `session.messages` (§3D).
- Never `localhost` (§3A).
- **OUT OF SCOPE:** telephony / live SIP. `backend/telephony.py` gets fixes that
  are one-line-identical to `main.py`'s (both barge-in call sites were fixed
  together) but is not otherwise being developed. Testing is manual via
  `http://localhost:8000/console`.
