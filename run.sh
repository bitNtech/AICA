#!/usr/bin/env bash

# Starts the AICA backend and the legacy static test client from the repository
# root. This is a backend-only quick start (assumes deps already installed) -
# for the real React frontend + backend together, use ./setup.sh instead.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5500}"

PYTHON_CMD=()

# IndicConformer's NeMo build has no wheels above 3.11 - numba and
# editdistance try to compile from source and fail - so the range is pinned
# rather than "3.10 or newer".
SUPPORTED_PYTHON='import sys; raise SystemExit(not ((3, 10) <= sys.version_info[:2] <= (3, 11)))'

find_python() {
  local candidate
  for candidate in python3.11 python3.10 python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 \
      && "$candidate" -c "$SUPPORTED_PYTHON" >/dev/null 2>&1; then
      PYTHON_CMD=("$candidate")
      return
    fi
  done

  local version
  for version in 3.11 3.10; do
    if command -v py >/dev/null 2>&1 \
      && py "-$version" -c "$SUPPORTED_PYTHON" >/dev/null 2>&1; then
      PYTHON_CMD=(py "-$version")
      return
    fi
  done

  echo "Python 3.10 or 3.11 is required (IndicConformer's NeMo build does not support 3.12+)." >&2
  echo "Install it from https://www.python.org/downloads/ (select 'Add Python to PATH'), then run this script again." >&2
  exit 1
}

find_python

if [[ ! -d "$VENV_DIR" ]]; then
  echo "Creating virtual environment..."
  "${PYTHON_CMD[@]}" -m venv "$VENV_DIR"
fi

if [[ -x "$VENV_DIR/bin/python" ]]; then
  VENV_PYTHON="$VENV_DIR/bin/python"
elif [[ -x "$VENV_DIR/Scripts/python.exe" ]]; then
  # Lets Git Bash on Windows reuse a Windows virtual environment.
  VENV_PYTHON="$VENV_DIR/Scripts/python.exe"
else
  echo "The virtual environment is incomplete. Delete .venv and run again." >&2
  exit 1
fi

if ! "$VENV_PYTHON" -c "$SUPPORTED_PYTHON" >/dev/null 2>&1; then
  echo ".venv was built with an unsupported Python version (NeMo needs 3.10 or 3.11)." >&2
  echo "Delete .venv and run this script again." >&2
  exit 1
fi

echo "Installing backend requirements..."
"$VENV_PYTHON" -m pip install --upgrade pip
"$VENV_PYTHON" -m pip install -r "$ROOT_DIR/requirements.txt"

# IndicConformer needs the AI4Bharat NeMo fork; stock nemo-toolkit cannot load
# its multilingual tokenizer. --no-deps skips Windows-incompatible deps (triton).
if [[ -d "$ROOT_DIR/NeMo_ai4bharat" ]]; then
  if ! "$VENV_PYTHON" -c "import nemo.collections.asr" >/dev/null 2>&1; then
    echo "Installing the AI4Bharat NeMo fork..."
    "$VENV_PYTHON" -m pip install -e "$ROOT_DIR/NeMo_ai4bharat" --no-deps
  fi
else
  echo "NeMo_ai4bharat/ is missing - ASR will be unavailable." >&2
  echo "  git clone --depth 1 https://github.com/AI4Bharat/NeMo.git NeMo_ai4bharat" >&2
fi

cleanup() {
  echo
  echo "Stopping AICA services..."
  [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting API at http://localhost:$BACKEND_PORT"
"$VENV_PYTHON" -m uvicorn backend.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload &
BACKEND_PID=$!

echo "Starting legacy test client at http://localhost:$FRONTEND_PORT"
"$VENV_PYTHON" -m http.server "$FRONTEND_PORT" --directory "$ROOT_DIR/legacy_test_client" &
FRONTEND_PID=$!

echo
echo "AICA is running. Open http://localhost:$FRONTEND_PORT/?apiPort=$BACKEND_PORT"
echo "Press Ctrl+C to stop both services."
wait "$BACKEND_PID" "$FRONTEND_PID"
