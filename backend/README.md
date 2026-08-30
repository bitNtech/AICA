# AICA Backend

Low-latency browser-to-backend audio processing for the AICA call-agent prototype.

This is the `backend/` package inside the AICA repo. `requirements.txt`, `pytest.ini`,
`run.sh`, `golden/`, and `assets/` live one level up, at the repo root — see the root
[README.md](../README.md) and [SETUP.md](../SETUP.md) for how this fits together with
the React frontend.

## Project structure

```text
backend/            FastAPI WebSocket application (this directory)
  main.py           PCM WebSocket, VAD events, and ASR worker
  vad.py            TEN VAD speech segmentation
  asr.py            AI4Bharat IndicConformer transcription adapter (NeMo)
../legacy_test_client/  Static call-agent interface (predates the React frontend)
  index.html        Call interface and microphone permission flow
  audio-stream.js   16 kHz signed-16-bit PCM WebSocket client
../assets/           Project reference assets
  LLM-Flow.png      Call-processing flow diagram
../requirements.txt  Python dependencies
```

## Run the backend

**Python 3.10 or 3.11 only.** The AI4Bharat NeMo build has no wheels above 3.11 - `numba` and
`editdistance` try to compile from source and fail. `run.sh` picks a supported interpreter and
refuses an existing `.venv` built with anything else.

### One-time model access

ASR runs the hybrid CTC/RNNT IndicConformer checkpoint
[ai4bharat/indicconformer_stt_ta_hybrid_ctc_rnnt_large](https://huggingface.co/ai4bharat/indicconformer_stt_ta_hybrid_ctc_rnnt_large),
downloaded automatically on first run. It is loaded through the AI4Bharat NeMo fork, which must be
cloned next to the backend - stock `nemo-toolkit` cannot load IndicConformer's multilingual tokenizer:

```bash
git clone --depth 1 https://github.com/AI4Bharat/NeMo.git NeMo_ai4bharat
```

`run.sh` installs it (`pip install -e ./NeMo_ai4bharat --no-deps`) once the checkout is present;
the directory is gitignored.

If the download needs a Hugging Face token, put it in the `.env` file at the repo root
(`AICA/.env`, shared with the frontend) - [settings.py](settings.py) loads it however the
app is started:

```dotenv
HF_TOKEN=hf_your_read_token
```

The quickest way to start the backend plus the legacy static test client is, from the repo root:

```bash
bash run.sh
```

It creates `.venv` if needed, installs `requirements.txt` and the NeMo fork, then starts the FastAPI API and the legacy static client. Use `Ctrl+C` to stop both. You can set custom ports with `BACKEND_PORT=8001 FRONTEND_PORT=5501 bash run.sh`; open the URL printed by the script so it uses the matching backend port.

For the real product frontend (this repo's React app) plus the backend together, use `./setup.sh` at the repo root instead - see the root [SETUP.md](../SETUP.md).

To run the backend manually (from the repo root):

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -e ./NeMo_ai4bharat --no-deps
uvicorn backend.main:app --reload
```

The audio WebSocket is available at `ws://localhost:8000/ws/audio`.

## Open the legacy static test client

This is a minimal pre-React test page, superseded by the real frontend's
**Simulation & Testing → Run simulation** panel - useful only for testing the backend's
`/ws/audio` contract in isolation. Serve the `legacy_test_client` directory (from the
repo root) over localhost or HTTPS, then open its URL in a browser. This is required for
reliable microphone access.

```powershell
cd legacy_test_client
py -m http.server 5500
```

Open `http://localhost:5500`, enable the microphone, and choose **Answer with AICA** to begin streaming browser audio to the FastAPI endpoint.

## Audio pipeline

The browser resamples microphone input to mono 16 kHz `pcm_s16le`. 16 kHz is fixed: both TEN VAD and IndicConformer are trained on it.

TEN VAD and the turn-taking state machine use the hyperparameters the live-mic pipeline was tuned on:

| Parameter | Env var | Default | What it does |
|---|---|---|---|
| hop size | - | `256` (16 ms) | VAD frame size; TEN VAD is tuned around 16 ms frames. |
| threshold | `VAD_THRESHOLD` | `0.35` | Speech-probability cutoff. Lower catches softer onsets but false-triggers on noise. |
| pre-roll | `VAD_PRE_ROLL_FRAMES` | `8` (128 ms) | Silence buffered *before* VAD fires, prepended to the utterance so VAD onset lag does not clip the first syllable. |
| endpoint silence | `VAD_ENDPOINT_SILENCE_FRAMES` | `22` (352 ms) | Consecutive silent frames that end a turn. Longer than a natural mid-sentence pause, so sentences are not cut in half. |
| barge-in gate | `VAD_BARGE_IN_FRAMES` | `15` (240 ms) | Continuous speech required before the caller cuts the agent off. One flagged frame is a cough, not an interruption; capture and ASR are unaffected. |
| max utterance | `ASR_MAX_UTTERANCE_FRAMES` | `1875` (30 s) | Safety cap only, far past any real turn - a browser socket must not buffer unbounded audio. |
| language | `ASR_LANGUAGE` (or `?lang=`) | `ta` | `language_id` passed to IndicConformer: `ta`, `hi`, `te`, `ml`, `kn`, `bn`, `mr`, `gu`, `pa`. |
| decoder | `ASR_DECODING` | `rnnt` | `rnnt` is slower than `ctc` but more accurate on this hybrid model - correctness over latency. |

Each completed utterance (pre-roll + speech + the silent tail that ended the turn) is handed to NeMo as an in-memory float32 waveform in one `batch_size=1` call, in the language the connection was configured with. The audio never touches disk - no temp WAV write, decode, or unlink per turn, and the per-call progress bar is off; that is ~60 ms off every transcript on CPU. There is no per-utterance language detection: this checkpoint decodes whatever `language_id` it is given, so the call language is chosen once at `call_started`.

Transcripts are sent to the browser in the language's own script - Tamil speech arrives as Tamil text. There is no romanization ("Tanglish"/"Hinglish") step: it cost a dependency and a per-utterance conversion to make the output *less* faithful than what the model already produces.

Server defaults come from the table above; all of them are read from the environment in [backend/settings.py](backend/settings.py).
