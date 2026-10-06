"""Runs the image-output eval harness over the golden fixtures.

    npm run eval                       # all cases in evals/fixtures/cases
    npm run eval -- --case st_real     # cases whose filename contains "st_real"
    npm run eval -- --json out.json    # also write the full report

Each case declares `expect: pass|fail` (and optionally `expect_failures`,
metrics that must be among the failing ones). Exit code 1 if any case's
verdict differs from what it expects — that is what CI gates on: known-good
outputs must pass and known-bad outputs must be caught.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

EVALS = Path(__file__).resolve().parent
sys.path.insert(0, str(EVALS))

from director_eval import screen_test, sheet  # noqa: E402
from director_eval.models import ensure_models  # noqa: E402
from director_eval.vision import Vision  # noqa: E402

EVALUATORS = {"screen_test": screen_test.evaluate, "character_sheet": sheet.evaluate}


def load_config(path: Path | None = None) -> dict:
    return json.loads((path or EVALS / "config.json").read_text())


def run_case(vis: Vision, cfg: dict, case_path: Path) -> dict:
    case = json.loads(case_path.read_text())
    t0 = time.perf_counter()
    res = EVALUATORS[case["kind"]](vis, cfg, case, case_path.parent)
    failing = [m["metric"] for m in res["metrics"] if m["pass"] is False]
    verdict = "fail" if failing else "pass"
    out = {
        "case": case_path.stem,
        "kind": case["kind"],
        "verdict": verdict,
        "failing": failing,
        "seconds": round(time.perf_counter() - t0, 2),
        **res,
    }
    if "expect" in case:
        missing = [m for m in case.get("expect_failures", []) if m not in failing]
        out["expect"] = case["expect"]
        out["as_expected"] = verdict == case["expect"] and not missing
        if missing:
            out["missing_expected_failures"] = missing
    return out


def fmt_value(m: dict) -> str:
    if m["pass"] is None:
        return f"skip ({m['detail']})"
    v = m["value"]
    s = json.dumps(v) if isinstance(v, (dict, list)) else str(v)
    t = m["threshold"]
    ts = json.dumps(t) if isinstance(t, (dict, list)) else str(t)
    return f"{'PASS' if m['pass'] else 'FAIL'}  {s}  (threshold {ts})"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--case", default="", help="substring filter on case filename")
    ap.add_argument("--cases-dir", default=str(EVALS / "fixtures" / "cases"))
    ap.add_argument("--config", default=None)
    ap.add_argument("--json", default=str(EVALS / ".out" / "report.json"))
    ap.add_argument("-v", "--verbose", action="store_true", help="print metric details")
    args = ap.parse_args()

    t0 = time.perf_counter()
    cfg = load_config(Path(args.config) if args.config else None)
    vis = Vision(ensure_models(), cfg["detection"]["face_min_score"])
    cases = sorted(p for p in Path(args.cases_dir).glob("*.json") if args.case in p.stem)
    if not cases:
        print("no cases matched", file=sys.stderr)
        return 2

    reports = []
    for p in cases:
        r = run_case(vis, cfg, p)
        reports.append(r)
        status = "" if "as_expected" not in r else ("ok  " if r["as_expected"] else "XX  ")
        exp = f" (expected {r['expect']})" if "expect" in r else ""
        print(f"\n{status}{r['case']}: {r['verdict'].upper()}{exp}  [{r['seconds']}s]")
        if r.get("matched_by"):
            print(f"      people matched to stage figures by {r['matched_by']}")
        for m in r["metrics"]:
            print(f"      {m['metric']:<18} {fmt_value(m)}")
            if args.verbose and m["detail"] is not None:
                print(f"      {'':<18} detail: {json.dumps(m['detail'])}")
        if r.get("missing_expected_failures"):
            print(f"      expected these metrics to fail but they did not: {r['missing_expected_failures']}")
    vis.close()

    Path(args.json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.json).write_text(json.dumps(reports, indent=2, default=str))
    bad = [r["case"] for r in reports if r.get("as_expected") is False]
    print(f"\n{len(reports)} cases, {len(reports) - len(bad)} as expected, {len(bad)} unexpected  [{time.perf_counter() - t0:.1f}s total]")
    if bad:
        print("UNEXPECTED: " + ", ".join(bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
