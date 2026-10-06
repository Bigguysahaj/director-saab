"""Screen Test eval: blocking (does the output keep the /stage blocking?)
and identity (is each person the cast member assigned to that mannequin?).

Ground truth for blocking comes from the stage itself — a keypoint JSON
saved next to the captured photo (schema below), produced by
src/lib/stageKeypoints.ts or, for older photos, by hand. Detecting the
mannequins in the stage *photo* is not used: MediaPipe Pose finds 0-1
garbage poses on the mannequins (checked on all 4 real stage photos), and
color segmentation is confounded because props share the mannequin palette
(orange box next to the orange mannequin, green ball behind the green one).

Stage keypoint JSON (schema "director-stage-keypoints/v1"):
{
  "image_size": [W, H], "units": "px" | "normalized",
  "figures": [{ "color": "#c65d3b", "keypoints": { "head": [x, y], "nose": [x, y] | null,
                 "left_shoulder": ..., "right_ankle": ... } }],      # anatomical left/right
  "contacts": [[i, j]]   # optional: figure pairs physically touching in 3D on stage
}
"""

from __future__ import annotations

import itertools
import json
import math
from pathlib import Path

import cv2
import numpy as np

from .vision import Person, Vision, load_image

LIMBS = {
    "left_upper_arm": ("left_shoulder", "left_elbow"),
    "right_upper_arm": ("right_shoulder", "right_elbow"),
    "left_forearm": ("left_elbow", "left_wrist"),
    "right_forearm": ("right_elbow", "right_wrist"),
    "left_thigh": ("left_hip", "left_knee"),
    "right_thigh": ("right_hip", "right_knee"),
    "left_shin": ("left_knee", "left_ankle"),
    "right_shin": ("right_knee", "right_ankle"),
}
TORSO = ("left_shoulder", "right_shoulder", "left_hip", "right_hip")
CONTACT_POINTS = ("left_wrist", "right_wrist", "left_elbow", "right_elbow")


def metric(name, passed, value=None, threshold=None, detail=None):
    return {"metric": name, "pass": passed, "value": value, "threshold": threshold, "detail": detail}


# ---- normalized figure representation ---------------------------------------
# Each figure: {"head": (x, y) normalized, "kp": {name: (x_h, y_h)} in
# image-height units (x * W/H, y) so distances are isotropic, "aspect": W/H}


def load_stage(path: Path) -> dict:
    data = json.loads(path.read_text())
    W, H = data["image_size"]
    to_norm = (lambda p: (p[0] / W, p[1] / H)) if data.get("units", "normalized") == "px" else (lambda p: (p[0], p[1]))
    figs = []
    for f in data["figures"]:
        kp = {k: to_norm(v) for k, v in f["keypoints"].items() if v is not None}
        figs.append({"color": f["color"].lower(), "kp_norm": kp, "aspect": W / H})
    return {"figures": figs, "contacts": {tuple(sorted(c)) for c in data.get("contacts", [])}, "aspect": W / H}


def stage_figure(f: dict) -> dict:
    a = f["aspect"]
    kp = f["kp_norm"]
    head = kp.get("head") or kp.get("nose")
    return {"head": head, "kp": {k: (x * a, y) for k, (x, y) in kp.items()}}


def output_figure(p: Person, aspect: float, min_vis: float) -> dict:
    kp = {k: (x * aspect, y) for k, (x, y, v) in p.keypoints.items() if v >= min_vis}
    return {"head": p.head, "kp": kp}


def torso_len(kp: dict) -> float | None:
    if not all(k in kp for k in TORSO):
        return None
    sh = np.add(kp["left_shoulder"], kp["right_shoulder"]) / 2
    hp = np.add(kp["left_hip"], kp["right_hip"]) / 2
    return float(np.linalg.norm(sh - hp))


def seg(kp, a, b):
    if a in kp and b in kp:
        return np.subtract(kp[b], kp[a])
    return None


def contacts(figs: list[dict], margin: float) -> set[tuple[int, int]]:
    """Pairs (i, j) where a wrist/elbow of one figure lies inside the other's
    torso quad, scaled about its centre by (1 + margin): negative margin =
    must be well inside, positive = near is enough. In 2D this also fires on
    pure occlusion, so `evaluate` uses hysteresis: an output contact must be
    deep inside (contact_margin_output < 0) and the stage must not have had
    even a near contact (contact_margin_stage > 0) for it to count as new."""
    out = set()
    for i, a in enumerate(figs):
        for j, b in enumerate(figs):
            if i == j or not all(k in b["kp"] for k in TORSO):
                continue
            quad = np.array([b["kp"][k] for k in ("left_shoulder", "right_shoulder", "right_hip", "left_hip")], np.float32)
            c = quad.mean(axis=0)
            hull = cv2.convexHull((c + (quad - c) * (1 + margin)).astype(np.float32))
            for k in CONTACT_POINTS:
                if k in a["kp"] and cv2.pointPolygonTest(hull, tuple(map(float, a["kp"][k])), False) >= 0:
                    out.add(tuple(sorted((i, j))))
    return out


# ---- the eval ----------------------------------------------------------------


def evaluate(vis: Vision, cfg: dict, case: dict, case_dir: Path) -> dict:
    c = cfg["screen_test"]
    d = cfg["detection"]
    stage = load_stage(case_dir / case["stage_keypoints"])
    cast = case["cast"]
    color_to_cast = {m["color"].lower(): m for m in cast}
    expected = [(f, color_to_cast[f["color"]]) for f in stage["figures"] if f["color"] in color_to_cast]
    unassigned_contacts = stage["contacts"]

    img = load_image(case_dir / case["output"])
    H, W = img.shape[:2]
    aspect = W / H
    people = vis.detect_people(img, d["pose_face_match_max_dist"], d["max_people"])
    refs = [vis.reference_embedding(case_dir / m["reference"]) for _, m in expected]

    results = []
    n_exp, n_out = len(expected), len(people)
    results.append(metric("person_count", n_out == n_exp, n_out, n_exp, f"{n_out} people detected, {n_exp} cast figures on stage"))

    # Identity: best one-to-one assignment of output people to cast members.
    sim = np.full((n_exp, n_out), -1.0)
    for e in range(n_exp):
        for p in range(n_out):
            if people[p].embedding is not None:
                sim[e, p] = vis.cosine(refs[e], people[p].embedding)
    best, best_score = None, -math.inf
    k = min(n_exp, n_out)
    for exp_idx in itertools.permutations(range(n_exp), k):
        for out_idx in itertools.permutations(range(n_out), k):
            s = sum(sim[e, p] for e, p in zip(exp_idx, out_idx))
            if s > best_score:
                best, best_score = list(zip(exp_idx, out_idx)), s
    best = best or []
    id_sims = {expected[e][1]["name"]: round(float(sim[e, p]), 3) for e, p in best}
    id_ok = len(best) == n_exp and all(sim[e, p] >= c["identity_min_cosine"] for e, p in best)
    results.append(
        metric("identity", id_ok, min(id_sims.values()) if id_sims else None, c["identity_min_cosine"], {"cosine_by_cast": id_sims})
    )

    # Blocking pairs: by identity if identity is trustworthy, else by position.
    matched_by = "identity"
    pairs = best
    if not id_ok and n_out:
        matched_by = "position"
        best_pos, best_cost = [], math.inf
        for exp_idx in itertools.permutations(range(n_exp), k):
            for out_idx in itertools.permutations(range(n_out), k):
                cost = sum(
                    np.hypot(*(np.subtract(stage_figure(expected[e][0])["head"], people[p].head)))
                    for e, p in zip(exp_idx, out_idx)
                )
                if cost < best_cost:
                    best_pos, best_cost = list(zip(exp_idx, out_idx)), cost
        pairs = best_pos
    pairs = sorted(pairs)
    S = [stage_figure(expected[e][0]) for e, _ in pairs]
    O = [output_figure(people[p], aspect, d["pose_min_visibility"]) for _, p in pairs]
    names = [expected[e][1]["name"] for e, _ in pairs]

    # Position of each head.
    if pairs:
        dxs = [abs(o["head"][0] - s["head"][0]) for s, o in zip(S, O)]
        dys = [abs(o["head"][1] - s["head"][1]) for s, o in zip(S, O)]
        ok = max(dxs) <= c["position_max_dx"] and max(dys) <= c["position_max_dy"]
        results.append(
            metric(
                "position",
                ok,
                {"max_dx": round(max(dxs), 3), "max_dy": round(max(dys), 3)},
                {"max_dx": c["position_max_dx"], "max_dy": c["position_max_dy"]},
                {n: [round(a, 3), round(b, 3)] for n, a, b in zip(names, dxs, dys)},
            )
        )

    # Horizontal order + spacing between every pair of people.
    if len(pairs) >= 2:
        inversions, worst_gap = [], 0.0
        for i, j in itertools.combinations(range(len(pairs)), 2):
            sdx = S[j]["head"][0] - S[i]["head"][0]
            odx = O[j]["head"][0] - O[i]["head"][0]
            if abs(sdx) >= c["order_min_separation"] and np.sign(sdx) != np.sign(odx):
                inversions.append(f"{names[i]}/{names[j]}")
            worst_gap = max(worst_gap, abs(odx - sdx))
        results.append(metric("horizontal_order", not inversions, len(inversions), 0, inversions or None))
        results.append(metric("spacing", worst_gap <= c["spacing_max_ddx"], round(worst_gap, 3), c["spacing_max_ddx"]))
    else:
        results.append(metric("horizontal_order", None, detail="needs >= 2 matched people"))
        results.append(metric("spacing", None, detail="needs >= 2 matched people"))

    # Scale from torso length (shoulder-mid to hip-mid): robust to clothing
    # hiding legs, unlike full body height.
    t_s = [torso_len(s["kp"]) for s in S]
    t_o = [torso_len(o["kp"]) for o in O]
    abs_ratios = {n: round(to / ts, 3) for n, ts, to in zip(names, t_s, t_o) if ts and to}
    if abs_ratios:
        worst = max(abs(math.log(r)) for r in abs_ratios.values())
        results.append(
            metric("absolute_scale", worst <= math.log(c["absolute_scale_max_ratio"]), abs_ratios, c["absolute_scale_max_ratio"])
        )
    else:
        results.append(metric("absolute_scale", None, detail="no torso visible"))
    rel = []
    for i, j in itertools.combinations(range(len(pairs)), 2):
        if t_s[i] and t_s[j] and t_o[i] and t_o[j]:
            rel.append((t_o[i] / t_o[j]) / (t_s[i] / t_s[j]))
    if rel:
        worst = max(abs(math.log(r)) for r in rel)
        results.append(
            metric("relative_scale", worst <= math.log(c["relative_scale_max_ratio"]), round(math.exp(worst), 3), c["relative_scale_max_ratio"])
        )
    else:
        results.append(metric("relative_scale", None, detail="needs 2 people with visible torsos"))

    # Limbs: 2D angle of each visible segment, and its length relative to the
    # torso (catches out-of-plane differences like sitting vs standing, where
    # the 2D angle alone barely changes).
    angle_diffs, prop = [], {}
    for n, s, o, ts, to in zip(names, S, O, t_s, t_o):
        if not ts or not to:
            continue
        for limb, (a, b) in LIMBS.items():
            vs, vo = seg(s["kp"], a, b), seg(o["kp"], a, b)
            if vs is None or vo is None:
                continue
            ls, lo = np.linalg.norm(vs) / ts, np.linalg.norm(vo) / to
            prop[f"{n}:{limb}"] = round(max(lo, 0.05) / max(ls, 0.05), 2)
            if ls >= c["limb_angle_min_length"] and lo >= c["limb_angle_min_length"]:
                da = math.degrees(math.atan2(vo[1], vo[0]) - math.atan2(vs[1], vs[0]))
                angle_diffs.append(abs((da + 180) % 360 - 180))
    if angle_diffs:
        mean = float(np.mean(angle_diffs))
        results.append(metric("limb_angles", mean <= c["limb_angle_max_mean_deg"], round(mean, 1), c["limb_angle_max_mean_deg"], f"{len(angle_diffs)} segments"))
    else:
        results.append(metric("limb_angles", None, detail="no comparable limb segments"))
    if prop:
        worst_k = max(prop, key=lambda k: abs(math.log(prop[k])))
        ok = abs(math.log(prop[worst_k])) <= math.log(c["limb_proportion_max_ratio"])
        bad = {k: v for k, v in prop.items() if abs(math.log(v)) > math.log(c["limb_proportion_max_ratio"])}
        results.append(metric("limb_proportions", ok, {worst_k: prop[worst_k]}, c["limb_proportion_max_ratio"], bad or None))
    else:
        results.append(metric("limb_proportions", None, detail="no comparable limb segments"))

    # Facing: anatomical-left shoulder on image-right means facing camera.
    flips = []
    for n, s, o, ts, to in zip(names, S, O, t_s, t_o):
        if not ts or not to:
            continue
        sdx = s["kp"]["left_shoulder"][0] - s["kp"]["right_shoulder"][0]
        odx = o["kp"]["left_shoulder"][0] - o["kp"]["right_shoulder"][0]
        if abs(sdx) >= c["facing_min_shoulder_dx"] * ts and abs(odx) >= c["facing_min_shoulder_dx"] * to and np.sign(sdx) != np.sign(odx):
            flips.append(n)
    results.append(metric("facing", not flips, len(flips), 0, flips or None))

    # No new contact/overlap between figures.
    if len(pairs) >= 2:
        sc = contacts(S, c["contact_margin_stage"])
        idx_map = {e: i for i, (e, _) in enumerate(pairs)}
        fig_index = {id(f): fi for fi, f in enumerate(stage["figures"])}
        for a, b in unassigned_contacts:  # 3D contacts exported by the stage
            ea = next((ei for ei, (f, _) in enumerate(expected) if fig_index[id(f)] == a), None)
            eb = next((ei for ei, (f, _) in enumerate(expected) if fig_index[id(f)] == b), None)
            if ea in idx_map and eb in idx_map:
                sc.add(tuple(sorted((idx_map[ea], idx_map[eb]))))
        oc = contacts(O, c["contact_margin_output"])
        new = sorted(oc - sc)
        results.append(metric("no_new_contact", not new, len(new), 0, [f"{names[i]}+{names[j]}" for i, j in new] or None))
    else:
        results.append(metric("no_new_contact", None, detail="needs >= 2 matched people"))

    return {"matched_by": matched_by, "metrics": results}
