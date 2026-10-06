"""Character-sheet eval: is the output a real GRID x GRID sheet, and is the
person in every panel the person in the reference photo?

Grid structure is checked from seams, not white gutters: the real good
sheet (2026-09-25) has no gutters at all, panels just butt against each
other. A seam is a line where the per-pixel step across it is high along
most of its length (column-wise median), relative to its neighbourhood.
Expected seams sit at k/GRID of width/height; strong seams anywhere else
mean a different layout (the real bad sheet is 5x2, seams at 1/5 steps).
The client crops by exact thirds (Audition.tsx cropGrid), so a seam that
misses its third by more than `seam_window` already means cut-off panels.
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from .screen_test import metric
from .vision import Vision, load_image


def seam_scores(img: np.ndarray, axis: int) -> np.ndarray:
    """axis=1: score per x (vertical seams); axis=0: score per y."""
    f = img.astype(np.float32)
    step = np.abs(np.diff(f, axis=axis)).sum(axis=2)
    prof = np.median(step, axis=0 if axis == 1 else 1)
    n = len(prof)
    local = np.array(
        [np.median(np.r_[prof[max(0, i - 25) : max(0, i - 3)], prof[i + 4 : i + 26]]) for i in range(n)]
    )
    return prof / (local + 2.0)


def grid_structure(img: np.ndarray, c: dict) -> dict:
    g = c["grid_size"]
    s = c["analysis_long_side"] / max(img.shape[:2])
    small = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    detail, ok = {}, True
    for axis, name in ((1, "vertical"), (0, "horizontal")):
        sc = seam_scores(small, axis)
        n = len(sc)
        win = max(2, int(c["seam_window"] * n))
        expected = [round(k * n / g) for k in range(1, g)]
        found = [round(float(sc[max(0, e - win) : e + win + 1].max()), 1) for e in expected]
        mask = np.ones(n, bool)
        for e in expected:
            mask[max(0, e - win) : e + win + 1] = False
        b = int(c["border_ignore"] * n)
        mask[:b] = False
        mask[n - b :] = False
        spurious = [round(i / n, 3) for i in np.where(mask & (sc >= c["spurious_seam_score"]))[0]]
        # collapse neighbouring indices into one seam each
        merged = [x for k, x in enumerate(spurious) if k == 0 or x - spurious[k - 1] > 0.01]
        axis_ok = all(v >= c["seam_min_score"] for v in found) and not merged
        ok &= axis_ok
        detail[name] = {"expected_seam_scores": found, "unexpected_seams_at": merged}
    return metric("grid_structure", ok, None, {"seam_min_score": c["seam_min_score"]}, detail)


def evaluate(vis: Vision, cfg: dict, case: dict, case_dir: Path) -> dict:
    c = cfg["character_sheet"]
    img = load_image(case_dir / case["output"])
    ref = vis.reference_embedding(case_dir / case["reference"])
    g = c["grid_size"]
    H, W = img.shape[:2]
    results = [grid_structure(img, c)]

    faces_per_cell, sims = [], {}
    for i in range(g * g):
        r, col = divmod(i, g)
        cell = img[r * H // g : (r + 1) * H // g, col * W // g : (col + 1) * W // g]
        faces = vis.detect_faces(cell, min_long_side=640)
        faces_per_cell.append(len(faces))
        if len(faces):
            best = faces[np.argmax(faces[:, 2] * faces[:, 3])]
            sims[i] = round(vis.cosine(ref, vis.embed(cell, best)), 3)

    exp = c["expected_face_cells"]
    with_face = [i for i in exp if faces_per_cell[i] >= 1]
    crowded = [i for i in range(g * g) if faces_per_cell[i] > c["max_faces_per_cell"]]
    results.append(
        metric(
            "one_face_per_cell",
            len(with_face) >= c["min_face_cells"] and not crowded,
            {"cells_with_face": len(with_face), "crowded_cells": crowded},
            {"min_face_cells": c["min_face_cells"], "max_faces_per_cell": c["max_faces_per_cell"]},
            {"faces_per_cell": faces_per_cell},
        )
    )
    passing = [i for i, s in sims.items() if s >= c["identity_min_cosine"]]
    results.append(
        metric(
            "identity",
            len(passing) >= c["min_identity_cells"],
            {"cells_matching": len(passing), "median_cosine": round(float(np.median(list(sims.values()))), 3) if sims else None},
            {"min_cosine": c["identity_min_cosine"], "min_identity_cells": c["min_identity_cells"]},
            {"cosine_by_cell": sims},
        )
    )
    return {"metrics": results}
