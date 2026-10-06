"""OPTIONAL, NOT RUN IN CI: generate a fresh output through the running app,
then eval it. Costs real money (~$0.03-0.04 per image) and needs
OPENROUTER_API_KEY (in the environment or .env.local) plus `npm run dev`.

Goes through the app's own API routes, so it exercises the exact prompts
and model the product uses.

  npm run eval:live -- sheet --reference evals/fixtures/images/cast1_ref.jpg
  npm run eval:live -- screen-test \
      --stage-photo stage-photo-123.png --stage-keypoints stage-photo-123.json \
      --cast "Cast 1=#c65d3b=evals/fixtures/images/cast1_ref.jpg" \
      --cast "Cast 2=#3b6b5c=evals/fixtures/images/cast2_ref.jpg"

Outputs and a ready-made case.json land in evals/.out/live/<timestamp>/ —
copy that folder's files into evals/fixtures/ to turn a run into a golden case.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

EVALS = Path(__file__).resolve().parent
ROOT = EVALS.parent
sys.path.insert(0, str(EVALS))


def has_key() -> bool:
    if os.environ.get("OPENROUTER_API_KEY"):
        return True
    env = ROOT / ".env.local"
    return env.exists() and re.search(r"^OPENROUTER_API_KEY=\S+", env.read_text(), re.M) is not None


def data_url(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def post(base: str, route: str, body: dict) -> dict:
    req = urllib.request.Request(f"{base}{route}", json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())


def color_labels() -> dict[str, str]:
    src = (ROOT / "src/lib/stageColors.ts").read_text()
    return {h.lower(): l for h, l in re.findall(r'hex: "(#[0-9a-fA-F]{6})", label: "([^"]+)"', src)}


def save_image(url_or_data: str, base: str, dest_stem: Path) -> Path:
    if url_or_data.startswith("data:"):
        mime, b64 = re.match(r"data:([^;]+);base64,(.*)", url_or_data, re.S).groups()
        raw = base64.b64decode(b64)
    else:
        mime = "image/jpeg"
        with urllib.request.urlopen(f"{base}{url_or_data}") as r:
            raw, mime = r.read(), r.headers.get_content_type()
    path = dest_stem.with_suffix(mimetypes.guess_extension(mime) or ".jpg")
    path.write_bytes(raw)
    return path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["sheet", "screen-test"])
    ap.add_argument("--base-url", default="http://localhost:3000")
    ap.add_argument("--reference")
    ap.add_argument("--stage-photo")
    ap.add_argument("--stage-keypoints")
    ap.add_argument("--cast", action="append", default=[], help='"Name=#hex=path/to/photo"')
    ap.add_argument("--model", help="image model id for screen-test (default: app default)")
    args = ap.parse_args()

    if not has_key():
        print("OPENROUTER_API_KEY not set (env or .env.local) - refusing to run a paid live generation.", file=sys.stderr)
        return 2

    out = EVALS / ".out" / "live" / time.strftime("%Y%m%d-%H%M%S")
    out.mkdir(parents=True, exist_ok=True)
    rel = lambda p: os.path.relpath(Path(p).resolve(), out)  # noqa: E731

    if args.kind == "sheet":
        if not args.reference:
            ap.error("--reference is required")
        print("generating character sheet (paid call)...", flush=True)
        res = post(args.base_url, "/api/character-sheet", {"photo": data_url(Path(args.reference))})
        if "error" in res:
            print(res["error"], file=sys.stderr)
            return 1
        img = save_image(res["image"], args.base_url, out / "sheet")
        case = {"kind": "character_sheet", "provenance": "LIVE run", "reference": rel(args.reference), "output": img.name}
    else:
        if not (args.stage_photo and args.stage_keypoints and args.cast):
            ap.error("--stage-photo, --stage-keypoints and at least one --cast are required")
        labels = color_labels()
        cast = []
        for spec in args.cast:
            name, hexcolor, photo = spec.split("=", 2)
            cast.append({"name": name, "color": hexcolor.lower(), "reference": photo})
        body = {
            "stagePhoto": data_url(Path(args.stage_photo)),
            "cast": [{"name": c["name"], "colorLabel": labels.get(c["color"], c["color"]), "photo": data_url(Path(c["reference"]))} for c in cast],
        }
        if args.model:
            body["model"] = args.model
        print("generating screen test (paid call)...", flush=True)
        res = post(args.base_url, "/api/screen-test", body)
        if "error" in res:
            print(res["error"], file=sys.stderr)
            return 1
        img = save_image(res["image"], args.base_url, out / "output")
        case = {
            "kind": "screen_test",
            "provenance": "LIVE run",
            "stage_photo": rel(args.stage_photo),
            "stage_keypoints": rel(args.stage_keypoints),
            "output": img.name,
            "cast": [{**c, "reference": rel(c["reference"])} for c in cast],
        }

    case_path = out / "case.json"
    case_path.write_text(json.dumps(case, indent=2))
    print(f"saved {img} and {case_path}")

    from run import load_config, run_case  # noqa: E402
    from director_eval.models import ensure_models  # noqa: E402
    from director_eval.vision import Vision  # noqa: E402

    cfg = load_config()
    vis = Vision(ensure_models(), cfg["detection"]["face_min_score"])
    report = run_case(vis, cfg, case_path)
    vis.close()
    (out / "report.json").write_text(json.dumps(report, indent=2, default=str))
    print(f"\n{report['verdict'].upper()}")
    for m in report["metrics"]:
        status = "skip" if m["pass"] is None else ("PASS" if m["pass"] else "FAIL")
        print(f"  {m['metric']:<18} {status}  {json.dumps(m['value'])}")
    return 0 if report["verdict"] == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
