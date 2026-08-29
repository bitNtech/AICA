# AICA — Local Setup Guide

This covers running the **AICA frontend** (this repo) against a real **AICA-backend**
locally, so you can test the voice agent end-to-end via *Simulation & Testing → Run
simulation*. It assumes `AICA/` and `AICA-backend/` are checked out as sibling
directories (the layout this guide and `setup.sh` both assume).

## Architecture, in one line

```
Browser mic/keyboard --WebSocket--> FastAPI /ws/audio --> TEN VAD --> IndicConformer ASR (Tamil)
      --> Conversation Manager --> LLM (OpenAI-compatible, e.g. Ollama) --> [TTS: not built yet]
      --> agent reply text streams back to the browser transcript
```

Everything up through the LLM reply is real and wired up. TTS is a documented
placeholder in this backend build (see the TTS section under Component
recommendations below) — voice replies don't exist yet regardless of what you install.

## Fastest path: one script, start to finish

```bash
cd AICA
./setup.sh
```

On any machine with `AICA` and `AICA-backend` checked out side by side, this detects
your OS and GPU, sizes a local LLM to fit it, installs everything it safely can
(frontend deps, backend venv + Python deps, the AI4Bharat NeMo fork, Ollama itself if
missing), pulls the sized model, and **launches both services** — it ends with the
frontend and backend already running and a URL to open. Ctrl+C stops both.

The only thing it can't fully automate is the Hugging Face token for the gated ASR
model (it's tied to your personal HF account) — it'll pause and ask you to paste one
in in the moment, with the exact link to get it.

Run `./setup.sh --help` for every environment-variable override (custom ports, a
different backend checkout path, pinning a specific LLM tag instead of auto-sizing,
`SETUP_SKIP_RUN=1` to install without launching).

If you'd rather do it by hand, or want to understand what the script does, read on.

---

## 1. What the script automates, and the one thing it can't

`setup.sh` treats every install as best-effort: if a package manager it tries isn't
present, it prints what to do manually and keeps going rather than aborting.

- **OS + GPU detection** — NVIDIA VRAM via `nvidia-smi` (Apple Silicon is detected
  separately; torch's MPS backend picks it up with no extra driver step). This decides
  which LLM size it pulls — see the sizing table in §3 (Component recommendations)
  below.
- **Frontend** — `npm install`, creates `AICA/.env` from `.env.example` if missing.
- **Python 3.10/3.11** — required because the AI4Bharat NeMo build has no wheels above
  3.11. Tries `winget` (Windows), `apt-get`/`dnf`/`pacman` (Linux), or `brew` (macOS)
  if no supported interpreter is already on `PATH`.
- **Backend environment** — creates `AICA-backend/.venv`, installs
  `requirements.txt`, clones and installs the AI4Bharat NeMo fork
  (`git clone --depth 1 https://github.com/AI4Bharat/NeMo.git NeMo_ai4bharat` +
  `pip install -e ./NeMo_ai4bharat --no-deps` — stock `nemo-toolkit` can't load
  IndicConformer's multilingual tokenizer). Reports whether `torch.cuda.is_available()`
  came back true afterward.
- **Ollama** — installs it if missing (official install script on Linux, `brew` on
  macOS, `winget` on Windows), starts `ollama serve` if it isn't already listening on
  `:11434`, then pulls the GPU-sized model tag and writes it into
  `AICA-backend/.env`'s `LLM_MODEL`.
- **Launch** — starts the backend (`uvicorn backend.main:app`) and frontend
  (`vite --host`), logs to `AICA-backend/backend.log` / `AICA/frontend.log`, and waits.

**What genuinely can't be scripted:** a Hugging Face token for the gated ASR model
(`ai4bharat/indicconformer_stt_ta_hybrid_ctc_rnnt_large`). It's tied to your personal
HF account and a license you have to accept yourself, so the script pauses and prompts
for it interactively — paste it in when asked, or press Enter to skip and add
`HF_TOKEN=hf_your_token_here` to `AICA-backend/.env` yourself later:
1. Visit the [model page](https://huggingface.co/ai4bharat/indicconformer_stt_ta_hybrid_ctc_rnnt_large)
   and accept its license.
2. Create a **read** token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).

## 2. Manual path (if you'd rather not run the script)

```bash
cd AICA && npm install && cp .env.example .env
cd ../AICA-backend
py -3.11 -m venv .venv && .venv/Scripts/Activate.ps1   # or py -3.10; source .venv/bin/activate on Linux/macOS
pip install -r requirements.txt
git clone --depth 1 https://github.com/AI4Bharat/NeMo.git NeMo_ai4bharat
pip install -e ./NeMo_ai4bharat --no-deps
# add HF_TOKEN=hf_... to .env (see step above)
# install Ollama, then: ollama pull qwen2.5:7b   (or 3b/14b/32b — see sizing table below)
bash run.sh                          # starts the backend on :8000
```

```bash
cd AICA && npm run dev               # starts the frontend on :5173
```

Open the frontend URL, go to **Simulation & Testing → Run simulation**.

---

## 3. Component recommendations

### LLM — Qwen2.5-Instruct, not Llama 3.1

`backend/settings.py`/`BACKEND_COMPLETION.md` name Llama-3.1-8B-Instruct and
Qwen2.5-7B-Instruct as the two candidates the backend was designed around (it talks to
either through one OpenAI-compatible client — swappable via `LLM_BASE_URL`/`LLM_MODEL`
alone, no code changes). Between those two, **Qwen2.5-Instruct is the better fit here**:

- This is a Tamil/English code-mixed hospital call agent — Qwen2.5's tokenizer and
  training mix cover non-Latin scripts noticeably more broadly than Llama 3.1's, whose
  officially supported languages don't include Tamil at all.
- `backend/llm.py` requires real OpenAI-style streaming tool-call deltas
  (`tool_choice="auto"`, 22 tools from `golden/main_prompt.txt`) — Qwen2.5 has solid,
  widely-used tool-calling support. Check a model's tag on
  [ollama.com/library](https://ollama.com/library) for the "Tools" badge before relying
  on it here.

**Pick a size by hardware** (rule of thumb — VRAM needs scale roughly with parameter
count at a given quantization, and IndicConformer/TEN VAD also share whatever GPU you
have):

| Hardware | Model tag | Notes |
|---|---|---|
| CPU-only / <6GB VRAM | `qwen2.5:3b` | Already `AICA-backend/.env`'s default. Fast, but weaker Tamil fluency and less reliable tool-calling discipline across the 22 tools — expect more failed golden flows. |
| 6–8GB VRAM | **`qwen2.5:7b`** (recommended default) | Best balance for this domain at MVP scale — `setup.sh` pulls this by default. |
| 12GB+ VRAM | `qwen2.5:14b` | Noticeably better instruction-following on the harder flows (emergency escalation, multi-step booking); higher per-turn latency. |
| 24GB+ VRAM / cloud | `qwen2.5:32b`, or move to vLLM/TGI for a served 7B–14B | Only worth it once you have concurrent calls to serve — `BACKEND_COMPLETION.md` §3.5 already flags Ollama/single-process as a later scaling limit, not an MVP one. |

**Don't just trust this table — validate it against your own prompt and flows:**

```bash
cd AICA-backend
python -m backend.scripts.golden_eval
```

This replays all 20 `golden/flows/flow_*.txt` scenarios against whatever
`LLM_BASE_URL`/`LLM_MODEL` you have configured and reports which ones fired the
correct tool. Re-run it any time you switch models — it's the real signal for *this*
prompt and tool set, not a generic multilingual benchmark.

### TTS — nothing to install yet

`backend/tts.py`'s `load()` is a literal `raise NotImplementedError` placeholder — there
is no real TTS integration in this backend at all today. No voice output will ever come
back, no matter what you install; the agent's replies stream back as text
(`agent_clause` events) instead, which the frontend already renders. When you're ready
to build the real thing:

- **[AI4Bharat Indic Parler-TTS](https://huggingface.co/ai4bharat/indic-parler-tts)**
  (recommended first try) — open-source, self-hosted, same organization as your ASR
  model so it already targets Tamil script well, and keeps caller audio on your own
  infrastructure. That last point matters: this is a hospital agent handling
  PHI-adjacent data, and routing audio through a third-party cloud TTS reopens the
  exact compliance gap `BACKEND_COMPLETION.md` §4 already flags for the project.
- **Coqui XTTS-v2** — genuine few-shot voice cloning from a short reference clip and
  strong tooling, but Tamil isn't in its officially supported language list. Worth an
  empirical try, no guarantee of quality.
- A cloud API (e.g. ElevenLabs) is the fastest to bolt on and has real Tamil + cloning
  support, but sends caller audio off-device — fine for throwaway local experiments,
  not for anything closer to production given the PHI concern above.

### ASR / VAD — already the right choice, no action needed

IndicConformer (ASR) and TEN VAD are already well-suited, tested, and hard-wired for
this exact use case (Tamil conversational turn-taking) — there's nothing to swap here
for the MVP.

---

## 4. Known limitations right now

- **No voice output** — TTS is a placeholder (see above).
- **No real phone line** — `backend/telephony.py` is a code-complete, unit-tested
  adapter for Twilio-Media-Streams-shaped input, but has never been wired to an actual
  SIP trunk/DID; only the browser WebSocket (`/ws/audio`) is a live transport today.
- **Single-process concurrency** — one global ASR/TTS semaphore pool per
  `AudioSettings`/`TtsSettings`; fine for one person testing, not load-tested for many
  simultaneous callers.

## 5. Troubleshooting

- **"Voice not ready" stays greyed out** → `asr_ready` is false in the backend's
  `ready` event → check `HF_TOKEN`, that the NeMo fork installed cleanly, and the
  backend's startup logs for an ASR load error.
- **Nothing replies to voice or typed text** → `conversation_ready`/LLM unreachable →
  confirm Ollama is running (`ollama list`) and that `AICA-backend/.env`'s
  `LLM_BASE_URL`/`LLM_MODEL` match what you actually pulled.
- **Panel stuck on "Disconnected — Retry"** → the backend isn't running on the port
  `AICA/.env`'s `VITE_BACKEND_WS_URL` points at (default `ws://localhost:8000`).
