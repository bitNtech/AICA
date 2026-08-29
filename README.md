# AICA — backend

The Python/FastAPI backend powering AICA, an AI front-desk attendant that answers inbound calls,
handles minimal front-desk tasks itself (scheduling, hours, simple intake), and redirects anything
past that scope to staff.

```
Browser mic/keyboard --WebSocket--> FastAPI /ws/audio --> TEN VAD --> IndicConformer ASR (Tamil)
      --> Conversation Manager --> LLM (OpenAI-compatible, e.g. Ollama) --> [TTS: not built yet]
      --> agent reply text streams back to the browser transcript
```

The React admin dashboard that talks to this backend's `/ws/audio` contract lives on the separate
[`frontend-aica-ui`](../../tree/frontend-aica-ui) branch — see its README for the UI side. See
[SETUP.md](SETUP.md) for running both together locally.

## Setup

See [SETUP.md](SETUP.md) for the full walkthrough (Python version, the AI4Bharat NeMo fork, HF
token, Ollama). Quick version:

```bash
py -3.11 -m venv .venv && source .venv/bin/activate   # or .venv/Scripts/Activate.ps1 on Windows
pip install -r requirements.txt
git clone --depth 1 https://github.com/AI4Bharat/NeMo.git NeMo_ai4bharat
pip install -e ./NeMo_ai4bharat --no-deps
cp .env.example .env   # add HF_TOKEN, point LLM_BASE_URL/LLM_MODEL at your LLM
uvicorn backend.main:app --reload   # serves ws://localhost:8000/ws/audio
```

`run.sh` starts this backend plus [`legacy_test_client/`](legacy_test_client/), a minimal static
HTML/JS page for exercising `/ws/audio` directly without the React dashboard.

## Testing

**The console — `http://localhost:8000/console`** (start with `uvicorn backend.main:app --reload`)

A self-contained page served by the backend itself, so it shares the app's origin and
opens `/ws/audio` with no CORS and no second dev server. Typed turns use the socket's
`user_text` path, which skips only VAD/ASR and drives the identical
conversation → LLM → tool → TTS chain — so **it works without `HF_TOKEN` or the NeMo
fork**, the pieces most likely missing on a fresh machine. The microphone button enables
itself only when ASR actually loaded. One-click sample turns come from the golden flows.

```bash
pytest
python -m backend.scripts.golden_eval      # tool-calling across the 20 golden flows
python -m backend.scripts.register_eval    # Tamil/English register on UNSEEN scenarios
python -m backend.scripts.transcript_log --tts   # writes a readable .txt of prompts + replies
```

`register_eval` is the one that catches register drift: it scores Tamil/English word
ratio, wrong-script leakage, unspeakable symbols, turn length, questions per turn and
fabricated identifiers on scenarios absent from `golden/`, so a model that merely
memorised the 20 flows scores badly. Both are floors — read the transcripts.

## Known limitations

- **Voice sends text off-device** — `TTS_ENGINE=edge` (default) uses Microsoft's neural
  Tamil voice (`ta-IN-PallaviNeural`, female). Fine for the fictional Aruvi data, **not**
  for real patient speech; swap in self-hosted Indic Parler-TTS behind the same adapter
  interface first. `TTS_ENGINE=svara` is still an unimplemented placeholder.
- **CPU latency** — ~3.6 tok/s for a 4B model, i.e. minutes per turn. Usable for evals,
  not for a live call. GPU offload required.
- **No real phone line** — `backend/telephony.py` is a code-complete, unit-tested adapter for
  Twilio-Media-Streams-shaped input, but has never been wired to an actual SIP trunk/DID; only the
  browser WebSocket (`/ws/audio`) is a live transport today.
- **Single-process concurrency** — one global ASR/TTS semaphore pool; fine for one caller at a
  time, not load-tested for many simultaneous callers.

See [BACKEND_COMPLETION.md](BACKEND_COMPLETION.md) for the fuller design/progress log.
