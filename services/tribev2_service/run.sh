#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-/Users/lucagazze/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3}"
VENV_DIR="${ROOT_DIR}/.venv"

if [ ! -d "${VENV_DIR}" ]; then
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi

"${VENV_DIR}/bin/python" -m pip install --upgrade pip
"${VENV_DIR}/bin/python" -m pip install -r "${ROOT_DIR}/requirements.txt"

export TRIBE_V2_CACHE_DIR="${TRIBE_V2_CACHE_DIR:-${ROOT_DIR}/cache}"
export CUDA_VISIBLE_DEVICES="${CUDA_VISIBLE_DEVICES:--1}"
export TRIBE_V2_DEVICE="${TRIBE_V2_DEVICE:-cpu}"
"${VENV_DIR}/bin/python" -m uvicorn server:app --host 127.0.0.1 --port "${PORT:-8787}" --app-dir "${ROOT_DIR}"
