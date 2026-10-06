#!/bin/sh
# Entry point for `npm run eval`. Uses evals/.venv if present (local dev,
# created by `npm run eval:setup`), else whatever python3 is on PATH (CI
# installs the pinned deps into the setup-python interpreter).
DIR="$(cd "$(dirname "$0")" && pwd)"
PY="$DIR/.venv/bin/python"
[ -x "$PY" ] || PY=python3
if ! "$PY" -c "import mediapipe, cv2" 2>/dev/null; then
  echo "eval deps missing for $PY - run: npm run eval:setup" >&2
  exit 2
fi
export GLOG_minloglevel=2 TF_CPP_MIN_LOG_LEVEL=3
exec "$PY" "$DIR/run.py" "$@"
