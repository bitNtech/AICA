#!/usr/bin/env bash
#
# Start AICA. One command, from anywhere:
#
#     ./run.sh
#
# It finds a supported Python, builds .venv if missing, installs requirements
# only when they are actually missing, makes sure Ollama has the model, starts
# the API, waits until every component reports ready, and prints the console
# URL. Ctrl+C stops it cleanly.
#
#   BACKEND_PORT=9000 ./run.sh     serve on another port
#   REINSTALL=1 ./run.sh           force a dependency reinstall
#   RELOAD=1 ./run.sh              uvicorn --reload (development)
#
set -Eeuo pipefail

# Works no matter where it is invoked from, including through a symlink.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

VENV_DIR="$ROOT_DIR/.venv"
LOG_DIR="$ROOT_DIR/logs"
LOG_FILE="$LOG_DIR/server.log"
BACKEND_PORT="${BACKEND_PORT:-8000}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
MODEL_NAME="${LLM_MODEL:-aruvi-base}"

say()  { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33m !\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m x\033[0m %s\n' "$*" >&2; exit 1; }

# --------------------------------------------------------------- python ----
# IndicConformer's NeMo build has no wheels above 3.11 - numba and editdistance
# try to compile from source and fail - so the range is pinned rather than
# "3.10 or newer".
SUPPORTED='import sys; raise SystemExit(not ((3,10) <= sys.version_info[:2] <= (3,11)))'
PYTHON_CMD=()

find_python() {
  local candidate version
  for candidate in python3.11 python3.10 python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c "$SUPPORTED" >/dev/null 2>&1; then
      PYTHON_CMD=("$candidate"); return
    fi
  done
  for version in 3.11 3.10; do
    if command -v py >/dev/null 2>&1 && py "-$version" -c "$SUPPORTED" >/dev/null 2>&1; then
      PYTHON_CMD=(py "-$version"); return
    fi
  done
  die "Python 3.10 or 3.11 is required (NeMo does not support 3.12+).
     Install from https://www.python.org/downloads/ with 'Add Python to PATH'."
}

if [[ ! -d "$VENV_DIR" ]]; then
  find_python
  say "Creating .venv with ${PYTHON_CMD[*]}"
  "${PYTHON_CMD[@]}" -m venv "$VENV_DIR"
fi

# Windows venvs put the interpreter in Scripts/, which is what Git Bash sees.
if   [[ -x "$VENV_DIR/bin/python"        ]]; then PY="$VENV_DIR/bin/python"
elif [[ -x "$VENV_DIR/Scripts/python.exe" ]]; then PY="$VENV_DIR/Scripts/python.exe"
else die ".venv is incomplete. Delete it and run again."
fi

"$PY" -c "$SUPPORTED" >/dev/null 2>&1 \
  || die ".venv was built with an unsupported Python (NeMo needs 3.10 or 3.11).
     Delete .venv and run again."

# ----------------------------------------------------------- dependencies ----
# Checked by import, not reinstalled every run: a full pip pass over this
# requirements file takes minutes and the point of this script is that it can
# be run casually.
deps_present() {
  "$PY" - <<'EOF' >/dev/null 2>&1
import importlib.util as u
raise SystemExit(any(u.find_spec(m) is None for m in ("fastapi", "uvicorn", "openai", "edge_tts", "soundfile", "ten_vad")))
EOF
}

if [[ -n "${REINSTALL:-}" ]] || ! deps_present; then
  say "Installing requirements (first run takes a while)"
  "$PY" -m pip install --upgrade pip --quiet
  "$PY" -m pip install -r "$ROOT_DIR/requirements.txt"
else
  say "Dependencies present"
fi

# IndicConformer needs the AI4Bharat NeMo fork; stock nemo-toolkit cannot load
# its multilingual tokenizer. --no-deps skips Windows-incompatible extras.
if ! "$PY" -c "import nemo.collections.asr" >/dev/null 2>&1; then
  if [[ -d "$ROOT_DIR/NeMo_ai4bharat" ]]; then
    say "Installing the AI4Bharat NeMo fork"
    "$PY" -m pip install -e "$ROOT_DIR/NeMo_ai4bharat" --no-deps
  else
    warn "NeMo_ai4bharat/ is missing - the microphone will be unavailable."
    warn "  git clone --depth 1 https://github.com/AI4Bharat/NeMo.git NeMo_ai4bharat"
    warn "  Typed turns in the console still exercise the full LLM -> TTS chain."
  fi
fi

# ---------------------------------------------------------------- ollama ----
# The agent is useless without the LLM, so this is checked before the server
# starts rather than surfacing later as a failed turn.
if curl -fsS -m 5 "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  if curl -fsS -m 5 "$OLLAMA_URL/api/tags" | grep -q "\"$MODEL_NAME"; then
    say "Ollama has $MODEL_NAME"
  elif command -v ollama >/dev/null 2>&1; then
    say "Building $MODEL_NAME from Modelfile (one time)"
    ollama create "$MODEL_NAME" -f "$ROOT_DIR/Modelfile"
  else
    warn "$MODEL_NAME is not in Ollama and the 'ollama' CLI is not on PATH."
    warn "  ollama create $MODEL_NAME -f Modelfile"
  fi

  # These are why the model gets a 67% GPU share instead of 42% on a 4GB card,
  # and why it stops unloading after five minutes idle (a reload cost a
  # measured 14.9s on the next turn). Ollama reads them from the environment of
  # its OWN server process, so setting them here only helps if Ollama is
  # started afterwards - hence a warning rather than an export.
  for var in OLLAMA_FLASH_ATTENTION OLLAMA_KV_CACHE_TYPE OLLAMA_KEEP_ALIVE; do
    if [[ -z "${!var:-}" ]]; then
      warn "$var is not set for the Ollama server - see HANDOFF.md §3."
    fi
  done
else
  warn "Ollama is not answering at $OLLAMA_URL - the agent cannot reply."
  warn "  Start Ollama, then reload the console."
fi

# ----------------------------------------------------------------- serve ----
mkdir -p "$LOG_DIR"

# stdout AND stderr to a file: several real bugs in this project were only ever
# visible in the server log, and a backgrounded process has no console.
RELOAD_FLAG=()
[[ -n "${RELOAD:-}" ]] && RELOAD_FLAG=(--reload)

say "Starting API on port $BACKEND_PORT (log: logs/server.log)"
"$PY" -m uvicorn backend.main:app --host 127.0.0.1 --port "$BACKEND_PORT" "${RELOAD_FLAG[@]}" \
  > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  printf '\n'
  say "Stopping AICA"
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Model loading (ASR especially) takes a while on a cold start; poll rather
# than guess, and fail loudly if the process dies during it.
say "Loading models..."
for _ in $(seq 1 60); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    warn "The server exited during startup. Last lines of the log:"
    tail -20 "$LOG_FILE" >&2
    exit 1
  fi
  HEALTH="$(curl -fsS -m 3 "http://127.0.0.1:$BACKEND_PORT/api/health" 2>/dev/null || true)"
  [[ -n "$HEALTH" ]] && break
  sleep 2
done

if [[ -z "${HEALTH:-}" ]]; then
  warn "The server did not become healthy in time. Last lines of the log:"
  tail -20 "$LOG_FILE" >&2
  exit 1
fi

# A server that answers requests is not evidence that ASR, the LLM or TTS
# loaded - say which of the four actually did.
printf '\n'
"$PY" - "$HEALTH" <<'EOF'
import json, sys
h = json.loads(sys.argv[1])
labels = [("asr_ready", "speech-to-text"), ("conversation_ready", "conversation"),
          ("llm_ready", "LLM"), ("tts_ready", "voice")]
for key, label in labels:
    ok = bool(h.get(key))
    print(f"    {'OK  ' if ok else 'DOWN'}  {label}" + ("" if ok else "   (see logs/server.log)"))
print(f"\n    model: {h.get('llm_model')} at {h.get('llm_base_url')}")
EOF

cat <<EOF

    Console:  http://localhost:$BACKEND_PORT/console

    Ctrl+C to stop.

EOF

wait "$SERVER_PID"
