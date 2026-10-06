"""Model weight download + sha256 verification (cached under evals/.models/)."""

from __future__ import annotations

import hashlib
import json
import os
import urllib.request
from pathlib import Path

EVALS_DIR = Path(__file__).resolve().parent.parent
MODELS_JSON = EVALS_DIR / "models.json"
MODELS_DIR = Path(os.environ.get("EVAL_MODELS_DIR", EVALS_DIR / ".models"))


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_models() -> dict[str, Path]:
    spec = json.loads(MODELS_JSON.read_text())
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}
    for key, m in spec.items():
        if key.startswith("_"):
            continue
        dest = MODELS_DIR / m["file"]
        if not dest.exists() or _sha256(dest) != m["sha256"]:
            print(f"[models] downloading {m['file']} ...", flush=True)
            tmp = dest.with_suffix(dest.suffix + ".part")
            urllib.request.urlretrieve(m["url"], tmp)
            got = _sha256(tmp)
            if got != m["sha256"]:
                tmp.unlink(missing_ok=True)
                raise RuntimeError(f"sha256 mismatch for {m['file']}: got {got}, want {m['sha256']}")
            tmp.replace(dest)
        paths[key] = dest
    return paths
