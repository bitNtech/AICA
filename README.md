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

```bash
pytest
python -m backend.scripts.golden_eval   # replays golden/flows/*.txt against your configured LLM
```

## Known limitations

- **No voice output** — `backend/tts.py`'s `load()` is a placeholder; TTS is not built yet.
- **No real phone line** — `backend/telephony.py` is a code-complete, unit-tested adapter for
  Twilio-Media-Streams-shaped input, but has never been wired to an actual SIP trunk/DID; only the
  browser WebSocket (`/ws/audio`) is a live transport today.
- **Single-process concurrency** — one global ASR/TTS semaphore pool; fine for one caller at a
  time, not load-tested for many simultaneous callers.

See [BACKEND_COMPLETION.md](BACKEND_COMPLETION.md) for the fuller design/progress log.
