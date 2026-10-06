# Image-output evals

Cheap, deterministic, CPU-only checks for the two AI image outputs. CI runs them on stored input/output pairs, with no API calls.

```sh
npm run eval:setup        # once: venv in evals/.venv + pinned deps
npm run eval              # all golden cases (about 5 s warm; weights download on first run)
npm run eval -- -v        # with per-metric details
npm run eval -- --case st_real
npm run eval:live -- sheet --reference path/to/photo.jpg   # OPTIONAL, paid, needs npm run dev + OPENROUTER_API_KEY
```

Each case declares `expect: pass|fail`. The run exits 1 when a known-good output fails or a known-bad one gets through. The full report goes to `evals/.out/report.json`.

## Models (all permissive, commercial use OK)

| Use | Model | License |
|---|---|---|
| Body keypoints | MediaPipe Pose Landmarker (full) | Apache-2.0 |
| Face boxes + landmarks | OpenCV zoo YuNet 2023mar | MIT |
| Face embedding | OpenCV zoo SFace 2021dec | Apache-2.0 |

`models.json` pins each URL and sha256. The weights (about 48 MB) download to `evals/.models/` and are never committed. InsightFace/ArcFace pretrained weights are deliberately **not** used, because they are licensed for non-commercial research only.

## Screen Test: blocking + identity (`director_eval/screen_test.py`)

**Ground truth comes from the stage, not the stage photo.** Plain mannequins cannot be reliably detected in the photo. MediaPipe found 0–1 garbage poses across all four real stage captures. Color segmentation doesn't work either, because props use the same palette as the mannequins (an orange box beside the orange mannequin, a green ball behind the green one). The stage already knows every joint, so `src/lib/stageKeypoints.ts` projects the live joint pivots through the stage camera into a `director-stage-keypoints/v1` JSON that is meant to be saved beside the photo. It also lists the mannequin pairs that touch in 3D. On `/stage`, turn on **+ Keypoints** next to Capture photo (off by default, remembered per browser) and each capture also downloads `stage-photo-<ts>.json` beside the PNG. Older photos are annotated by hand in the same format.

**Output side:** YuNet finds faces, which anchor each person. MediaPipe Pose then runs on a crop around each face. Full-image multi-pose merged the two overlapping people in the real output into one, so it isn't used for anchoring. A full-image pass still adds any person seen from behind with no visible face. People are paired with stage figures by face identity, or by head position if identity fails.

| Metric | Measures | Threshold (`config.json` → `screen_test`) |
|---|---|---|
| person_count | people detected == cast-assigned figures on stage | exact |
| identity | SFace cosine(cast reference, matched output face) for every cast member | ≥ `identity_min_cosine` 0.363 (OpenCV's recommended SFace threshold) |
| position | head-center offset per person (fraction of width / height) | ≤ `position_max_dx` 0.08, `position_max_dy` 0.10 |
| horizontal_order | left-to-right order of people is unchanged (pairs closer than `order_min_separation` are ignored) | 0 inversions |
| spacing | change in horizontal gap between each pair | ≤ `spacing_max_ddx` 0.08 |
| absolute_scale | torso length (shoulder-mid to hip-mid) vs stage, per person | ratio within ×`absolute_scale_max_ratio` 1.6 |
| relative_scale | torso-length ratio between people vs stage | within ×`relative_scale_max_ratio` 1.35 |
| limb_angles | mean 2D angle difference of upper arm/forearm/thigh/shin (segments shorter than `limb_angle_min_length` torso are skipped) | ≤ `limb_angle_max_mean_deg` 30° |
| limb_proportions | each segment's length / torso vs stage: catches out-of-plane changes such as sitting → standing, where 2D angles barely move | within ×`limb_proportion_max_ratio` 2.0 |
| facing | toward vs away from the camera (shoulder order), when shoulders are wide enough to tell | 0 flips |
| no_new_contact | a wrist/elbow deep inside another person's torso region (`contact_margin_output` −0.10) that was not even close on stage (`contact_margin_stage` +0.25, or listed in the stage's 3D `contacts`) | 0 new contacts |

Known limitation: when two figures already overlap in the stage camera view, 2D can't tell occlusion apart from contact. `no_new_contact` therefore stays silent for that pair, as in the real 2026-09-25 case. Per-joint depth from the stage export would close that gap.

## Character sheet: grid + identity (`director_eval/sheet.py`)

| Metric | Measures | Threshold (`config.json` → `character_sheet`) |
|---|---|---|
| grid_structure | Seams (lines with a high column-median pixel step relative to their neighborhood) at 1/3 and 2/3 on both axes, and no strong seam anywhere else. Seams are used rather than white gutters because the real good sheet has none. | each expected seam ≥ `seam_min_score` 3.0 within ±`seam_window`; no other seam ≥ `spurious_seam_score` 3.0 |
| one_face_per_cell | ≥ `min_face_cells` (6) of the 8 face cells (the back view, cell 3, is exempt) have a face, and no cell has more than `max_faces_per_cell` (1) | as listed |
| identity | SFace cosine(reference, largest face in each cell) | ≥ 0.363 in at least `min_identity_cells` (5) cells |

## Golden set (`fixtures/`)

| Case | Source | Expect |
|---|---|---|
| st_real_2026-09-25 | REAL stage capture + output (stage keypoints hand-annotated). The seated orange mannequin became a standing man and the shot was reframed. | fail (limb_proportions, position) |
| st_synth_matched | real output + stage keypoints hand-annotated *from* that output | pass |
| st_synth_apart | same output, stage with Cast 2 moved 0.2 of the width away with no contact (the "came back as a couple" failure) | fail (position, spacing, no_new_contact) |
| st_synth_mirrored | output flipped left/right | fail (horizontal_order) |
| st_synth_missing_person | Cast 2 painted out of the output | fail (person_count) |
| st_synth_wrong_person | Cast 2 reference swapped for Cast 1's photo | fail (identity) |
| cs_real_cast1 | REAL 3x3 sheet, reassembled from the 9 stored crops | pass |
| cs_real_cast2_5x2 | REAL sheet where the model returned a 5x2 layout | fail (grid_structure) |
| cs_synth_wrong_person | Cast 2 reference vs Cast 1 sheet | fail (identity) |

`fixtures/make_synthetic.py` regenerates the synthetic images.

### Adding a golden case

1. Put the images in `fixtures/images/`. For a Screen Test, also add the stage keypoint JSON (the stage export, or hand-annotated pixels with `"units": "px"`) in `fixtures/stage/`. `npm run eval:live` writes a ready-made `case.json` plus outputs under `evals/.out/live/<ts>/`.
2. Add `fixtures/cases/<name>.json` with `kind` (`screen_test` | `character_sheet`), the paths (relative to the case file), `provenance`, `expect`, and optionally `expect_failures`. Copy an existing case.
3. Run `npm run eval -- --case <name> -v`. If a threshold has to move, change it in `config.json` and make sure every other case still behaves as expected.
4. Only commit photos of real people when you have the right to. Say so in `provenance`.
