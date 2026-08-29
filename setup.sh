#!/usr/bin/env bash
#
# AICA one-shot local setup + run. Point this at a machine with AICA and
# AICA-backend checked out as sibling directories, run it, and it installs
# everything it safely can, auto-sizes the local LLM to whatever GPU it
# finds, and launches both services. Idempotent — safe to re-run.
#
# What it does:
#   1. Detects OS + GPU (NVIDIA VRAM via nvidia-smi, or Apple Silicon).
#   2. Frontend: npm install, creates AICA/.env from .env.example if missing.
#   3. Backend: finds/best-effort-installs Python 3.10/3.11, creates a venv,
#      installs requirements.txt, clones + installs the AI4Bharat NeMo fork.
#   4. Prompts for a Hugging Face token if AICA-backend/.env doesn't have one
#      (needed for the gated ASR model) — this is the one step that
#      genuinely cannot be automated, since it's tied to your personal HF
#      account and its license acceptance.
#   5. Best-effort installs Ollama if missing, starts it if not running,
#      pulls an LLM sized to the GPU detected in step 1, updates
#      AICA-backend/.env to match.
#   6. Starts the backend (uvicorn) and frontend (vite) and waits — Ctrl+C
#      stops both cleanly. Skip this with SETUP_SKIP_RUN=1.
#
# Every install step here is best-effort: if a package manager isn't present
# or a step fails, this prints what to do manually and moves on rather than
# aborting the whole script — see SETUP.md for the manual path.
#
# Usage:
#   ./setup.sh                                    # detect + install + run
#   AICA_BACKEND_DIR=../my-backend-checkout ./setup.sh
#   LLM_MODEL_TAG=qwen2.5:14b ./setup.sh           # skip GPU-based auto-sizing
#   BACKEND_PORT=8001 FRONTEND_PORT=5174 ./setup.sh
#   SETUP_SKIP_RUN=1 ./setup.sh                    # install only, don't launch

set -Eeuo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  sed -n '2,32p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
fi

FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_REL="${AICA_BACKEND_DIR:-../AICA-backend}"
BACKEND_DIR="$(cd "$FRONTEND_DIR/$BACKEND_REL" 2>/dev/null && pwd || true)"
LLM_MODEL_TAG_OVERRIDE="${LLM_MODEL_TAG:-}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
SKIP_RUN="${SETUP_SKIP_RUN:-0}"

log()  { echo "[setup] $*"; }
warn() { echo "[setup] WARNING: $*" >&2; }

if [[ -z "$BACKEND_DIR" ]]; then
  echo "ERROR: could not find the backend checkout at '$BACKEND_REL' (relative to this script)." >&2
  echo "Clone AICA-backend alongside this repo, or set AICA_BACKEND_DIR to its path, then re-run." >&2
  exit 1
fi

detect_os() {
  case "$(uname -s)" in
    Linux*) echo linux ;;
    Darwin*) echo macos ;;
    MINGW*|MSYS*|CYGWIN*) echo windows ;;
    *) echo unknown ;;
  esac
}
OS="$(detect_os)"

echo "=== AICA setup ==="
log "OS:       $OS"
log "Frontend: $FRONTEND_DIR"
log "Backend:  $BACKEND_DIR"
echo

# ---------------------------------------------------------------------------
# 0. GPU detection — drives the LLM size we pick later. NVIDIA only via
#    nvidia-smi; Apple Silicon is inferred from OS+arch (torch's MPS backend
#    picks it up automatically, no separate driver check applies there).
# ---------------------------------------------------------------------------
GPU_VRAM_MB=""
if command -v nvidia-smi >/dev/null 2>&1; then
  GPU_VRAM_MB="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -n1 | tr -dc '0-9')"
  GPU_NAME="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -n1)"
  log "GPU detected: ${GPU_NAME:-unknown} (${GPU_VRAM_MB:-?} MB VRAM)"
elif [[ "$OS" == "macos" && "$(uname -m)" == "arm64" ]]; then
  log "Apple Silicon detected — torch uses the MPS backend automatically, no separate driver step needed."
else
  log "No NVIDIA GPU detected (nvidia-smi not found) — will size the LLM for CPU inference."
fi
echo

choose_llm_tag() {
  if [[ -n "$LLM_MODEL_TAG_OVERRIDE" ]]; then
    echo "$LLM_MODEL_TAG_OVERRIDE"
    return
  fi
  if [[ -z "$GPU_VRAM_MB" ]]; then
    if [[ "$OS" == "macos" && "$(uname -m)" == "arm64" ]]; then
      echo "qwen2.5:7b"
    else
      echo "qwen2.5:3b"
    fi
    return
  fi
  if (( GPU_VRAM_MB < 8000 )); then
    echo "qwen2.5:3b"
  elif (( GPU_VRAM_MB < 12000 )); then
    echo "qwen2.5:7b"
  elif (( GPU_VRAM_MB < 24000 )); then
    echo "qwen2.5:14b"
  else
    echo "qwen2.5:32b"
  fi
}
LLM_MODEL_TAG="$(choose_llm_tag)"
log "LLM model tag: $LLM_MODEL_TAG (override with LLM_MODEL_TAG=... ./setup.sh)"
echo

# ---------------------------------------------------------------------------
# 1. Frontend dependencies
# ---------------------------------------------------------------------------
echo "--- Frontend dependencies ---"
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found. Install Node.js (https://nodejs.org) first, then re-run." >&2
  exit 1
fi
(cd "$FRONTEND_DIR" && npm install)

if [[ ! -f "$FRONTEND_DIR/.env" ]]; then
  cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env"
  log "Created $FRONTEND_DIR/.env from .env.example"
else
  log "$FRONTEND_DIR/.env already exists — leaving it as is."
fi
echo

# ---------------------------------------------------------------------------
# 2. Python 3.10/3.11 — required for the AI4Bharat NeMo build. Auto-install
#    is best-effort per OS; if none of these package managers are present or
#    the install fails, this prints manual instructions and exits (nothing
#    downstream can proceed without a supported interpreter).
# ---------------------------------------------------------------------------
echo "--- Backend Python interpreter ---"
PYTHON_CMD=()
SUPPORTED_PYTHON='import sys; raise SystemExit(not ((3, 10) <= sys.version_info[:2] <= (3, 11)))'

find_python() {
  local candidate
  for candidate in python3.11 python3.10 python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 \
      && "$candidate" -c "$SUPPORTED_PYTHON" >/dev/null 2>&1; then
      PYTHON_CMD=("$candidate")
      return 0
    fi
  done
  local version
  for version in 3.11 3.10; do
    if command -v py >/dev/null 2>&1 \
      && py "-$version" -c "$SUPPORTED_PYTHON" >/dev/null 2>&1; then
      PYTHON_CMD=(py "-$version")
      return 0
    fi
  done
  return 1
}

try_install_python() {
  log "No Python 3.10/3.11 found — attempting a best-effort install for $OS..."
  case "$OS" in
    windows)
      if command -v winget >/dev/null 2>&1; then
        winget install --id Python.Python.3.11 -e --silent \
          --accept-package-agreements --accept-source-agreements || true
      else
        warn "winget not found — can't auto-install Python."
      fi
      ;;
    linux)
      if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y python3.11 python3.11-venv || true
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y python3.11 || true
      elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -Sy --noconfirm python311 || true
      else
        warn "No known package manager (apt/dnf/pacman) found — can't auto-install Python."
      fi
      ;;
    macos)
      if command -v brew >/dev/null 2>&1; then
        brew install python@3.11 || true
      else
        warn "Homebrew not found — can't auto-install Python."
      fi
      ;;
    *)
      warn "Unrecognized OS — can't auto-install Python."
      ;;
  esac
}

if ! find_python; then
  try_install_python
  hash -r 2>/dev/null || true
  if ! find_python; then
    echo "ERROR: Python 3.10 or 3.11 is required (the AI4Bharat NeMo build doesn't support 3.12+)." >&2
    echo "Install it from https://www.python.org/downloads/ (check 'Add Python to PATH'), then re-run." >&2
    exit 1
  fi
fi
log "Using: ${PYTHON_CMD[*]}"
echo

# ---------------------------------------------------------------------------
# 3. Backend virtualenv + dependencies + NeMo fork
# ---------------------------------------------------------------------------
echo "--- Backend Python environment ---"
VENV_DIR="$BACKEND_DIR/.venv"
if [[ ! -d "$VENV_DIR" ]]; then
  log "Creating backend virtual environment..."
  "${PYTHON_CMD[@]}" -m venv "$VENV_DIR"
fi

if [[ -x "$VENV_DIR/bin/python" ]]; then
  VENV_PYTHON="$VENV_DIR/bin/python"
elif [[ -x "$VENV_DIR/Scripts/python.exe" ]]; then
  # Lets Git Bash on Windows reuse a Windows virtual environment.
  VENV_PYTHON="$VENV_DIR/Scripts/python.exe"
else
  echo "ERROR: the virtual environment is incomplete. Delete $VENV_DIR and re-run." >&2
  exit 1
fi

log "Installing backend Python dependencies (pulls torch/transformers/etc — large, be patient)..."
"$VENV_PYTHON" -m pip install --upgrade pip
"$VENV_PYTHON" -m pip install -r "$BACKEND_DIR/requirements.txt"
# No special --index-url here: PyPI's default torch/torchaudio wheels on
# Linux/Windows already bundle CUDA support and use it automatically when an
# NVIDIA driver is present (falling back to CPU otherwise), and the macOS
# wheel uses Apple's MPS backend the same way — nothing to branch on here.
CUDA_STATUS="$("$VENV_PYTHON" -c 'import torch; print(torch.cuda.is_available())' 2>/dev/null || echo "unknown")"
log "torch.cuda.is_available(): $CUDA_STATUS"

if [[ -d "$BACKEND_DIR/NeMo_ai4bharat" ]]; then
  log "NeMo_ai4bharat/ already present."
else
  log "Cloning the AI4Bharat NeMo fork (required for ASR — stock nemo-toolkit can't load IndicConformer's tokenizer)..."
  git clone --depth 1 https://github.com/AI4Bharat/NeMo.git "$BACKEND_DIR/NeMo_ai4bharat"
fi
if ! "$VENV_PYTHON" -c "import nemo.collections.asr" >/dev/null 2>&1; then
  log "Installing the AI4Bharat NeMo fork..."
  "$VENV_PYTHON" -m pip install -e "$BACKEND_DIR/NeMo_ai4bharat" --no-deps
fi
echo

# ---------------------------------------------------------------------------
# 4. Hugging Face token for the gated ASR model — the one step that
#    genuinely can't be automated (personal account + license acceptance).
#    Prompts interactively so a single run can still finish end to end.
# ---------------------------------------------------------------------------
echo "--- ASR model access ---"
touch "$BACKEND_DIR/.env"
if grep -q '^HF_TOKEN=' "$BACKEND_DIR/.env"; then
  log "HF_TOKEN already set in $BACKEND_DIR/.env."
else
  cat <<'EOF'
The ASR model (ai4bharat/indicconformer_stt_ta_hybrid_ctc_rnnt_large) is gated:
  1. Visit https://huggingface.co/ai4bharat/indicconformer_stt_ta_hybrid_ctc_rnnt_large
     and accept its license.
  2. Create a read token at https://huggingface.co/settings/tokens
EOF
  if [[ -t 0 ]]; then
    read -rsp "Paste that token here (or press Enter to skip and add it to AICA-backend/.env later): " HF_TOKEN_INPUT
    echo
    if [[ -n "$HF_TOKEN_INPUT" ]]; then
      printf 'HF_TOKEN=%s\n' "$HF_TOKEN_INPUT" >> "$BACKEND_DIR/.env"
      log "Saved HF_TOKEN to $BACKEND_DIR/.env."
    else
      log "Skipped — ASR will report as unavailable until you add HF_TOKEN to $BACKEND_DIR/.env."
    fi
  else
    warn "Not running interactively — add HF_TOKEN=hf_your_token to $BACKEND_DIR/.env yourself."
  fi
fi
echo

# ---------------------------------------------------------------------------
# 5. Ollama: best-effort install, ensure it's running, pull the sized model
# ---------------------------------------------------------------------------
echo "--- Local LLM (Ollama) ---"
if ! command -v ollama >/dev/null 2>&1; then
  log "Ollama not found — attempting a best-effort install for $OS..."
  case "$OS" in
    linux)
      curl -fsSL https://ollama.com/install.sh | sh || warn "Ollama install script failed."
      ;;
    macos)
      if command -v brew >/dev/null 2>&1; then
        brew install ollama || warn "brew install ollama failed."
      else
        warn "Homebrew not found — can't auto-install. Get it from https://ollama.com/download/mac"
      fi
      ;;
    windows)
      if command -v winget >/dev/null 2>&1; then
        winget install --id Ollama.Ollama -e --silent \
          --accept-package-agreements --accept-source-agreements || true
      else
        warn "winget not found — can't auto-install. Get it from https://ollama.com/download/windows"
      fi
      ;;
    *)
      warn "Unrecognized OS — can't auto-install. Get it from https://ollama.com/download"
      ;;
  esac
  hash -r 2>/dev/null || true
fi

if command -v ollama >/dev/null 2>&1; then
  if ! curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then
    log "Ollama isn't responding on :11434 yet — starting it in the background..."
    nohup ollama serve > "$FRONTEND_DIR/ollama.log" 2>&1 &
    disown || true
    for _ in $(seq 1 15); do
      curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1 && break
      sleep 1
    done
  fi

  if curl -fsS http://localhost:11434/api/tags >/dev/null 2>&1; then
    log "Pulling $LLM_MODEL_TAG..."
    ollama pull "$LLM_MODEL_TAG"

    if grep -q '^LLM_MODEL=' "$BACKEND_DIR/.env"; then
      sed -i.bak "s|^LLM_MODEL=.*|LLM_MODEL=$LLM_MODEL_TAG|" "$BACKEND_DIR/.env"
      rm -f "$BACKEND_DIR/.env.bak"
    else
      printf 'LLM_MODEL=%s\n' "$LLM_MODEL_TAG" >> "$BACKEND_DIR/.env"
    fi
    grep -q '^LLM_BASE_URL=' "$BACKEND_DIR/.env" || printf 'LLM_BASE_URL=http://localhost:11434/v1\n' >> "$BACKEND_DIR/.env"
    grep -q '^LLM_API_KEY=' "$BACKEND_DIR/.env" || printf 'LLM_API_KEY=ollama\n' >> "$BACKEND_DIR/.env"
    log "AICA-backend/.env's LLM_MODEL is now $LLM_MODEL_TAG."
  else
    warn "Ollama still isn't responding on :11434 — start it manually (\`ollama serve\`) and re-run."
  fi
else
  cat <<EOF
Ollama still isn't installed. Install it from https://ollama.com/download, then run:
    ollama pull $LLM_MODEL_TAG
and make sure AICA-backend/.env has:
    LLM_BASE_URL=http://localhost:11434/v1
    LLM_MODEL=$LLM_MODEL_TAG
    LLM_API_KEY=ollama
EOF
fi
echo

# ---------------------------------------------------------------------------
# 6. Launch both services (skip with SETUP_SKIP_RUN=1)
# ---------------------------------------------------------------------------
if [[ "$SKIP_RUN" == "1" ]]; then
  echo "=== Setup finished (SETUP_SKIP_RUN=1 — not auto-starting) ==="
  cat <<EOF
Start manually:
  cd "$BACKEND_DIR" && bash run.sh
  cd "$FRONTEND_DIR" && npm run dev
EOF
  exit 0
fi

echo "=== Starting AICA ==="
BACKEND_LOG="$BACKEND_DIR/backend.log"
FRONTEND_LOG="$FRONTEND_DIR/frontend.log"

(cd "$BACKEND_DIR" && exec "$VENV_PYTHON" -m uvicorn backend.main:app --host 0.0.0.0 --port "$BACKEND_PORT") \
  > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

(cd "$FRONTEND_DIR" && exec npm run dev -- --host --port "$FRONTEND_PORT") \
  > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

cleanup() {
  echo
  log "Stopping AICA services..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

log "Backend  starting (PID $BACKEND_PID)  — logs: $BACKEND_LOG"
log "Frontend starting (PID $FRONTEND_PID) — logs: $FRONTEND_LOG"
log "First backend start can take a few minutes while the ASR model downloads and loads."
log "Once ready, open: http://localhost:$FRONTEND_PORT"
log "TTS is not implemented in this backend build yet — agent replies are text-only, no audio comes back."
log "Press Ctrl+C to stop both."
wait "$BACKEND_PID" "$FRONTEND_PID"
