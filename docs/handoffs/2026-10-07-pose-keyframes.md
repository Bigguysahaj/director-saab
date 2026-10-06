# Handoff: pose keyframes (2026-10-07)

For the agent picking this up (cloud Claude Code, from the PR). Read
`AGENTS.md` first: this Next.js has breaking changes; check
`node_modules/next/dist/docs/` before touching Next APIs (you shouldn't need to).

## Goal

A mannequin's **pose** (joint rotations) can be keyframed on the /stage timeline
the same way position/rotation already are, so a figure can move from one pose
to another during a take. Driver: the first YouTube Short's hook
(`docs/scenes/purse-hook.json`): she is bent over looking into a purse
(0-3 s), then straightens up to talk to the camera as it rises out (by ~6-8 s).
Today her pose is static for the whole take.

## Where things are

- `src/components/stage/types.ts`: `Keyframe` = `{ time, position, rotation }`.
  `SceneObject.pose` = static pose. `TIMELINE_DURATION` = 8 s.
- `src/components/stage/keyframes.ts`: `interpolateTransform` (linear,
  component-wise Euler lerp, holds ends), `upsertKeyframe`, `deleteKeyframeNear`.
- `src/lib/poses/model.ts`: `JointKey`, `MannequinPose`, `DEFAULT_POSE`,
  `JOINTS`, `resolvePose`. **Joint keys are viewer-side** (`leftArm` is the
  figure's own right); labels already handle it. Don't rename keys: saved
  poses, pose packs and scenes depend on them.
- `src/components/stage/StageScene.tsx`:
  - `SceneContents`: the mannequin branch passes `pose={o.pose}` to `<Mannequin>`.
  - `addKeyframe()` captures the selected node's live transform at the playhead.
  - `<PosePanel onChange>` writes the static `o.pose`. `syncJointTransform()`
    writes the static pose when a joint is dragged with the gizmo.
  - `recordTake()` plays the timeline from 0 while recording.
- `src/components/stage/scene.ts`: `parseScene` validates scene JSON
  (Export/Import scene buttons).
- `docs/scenes/purse-hook.json`: the Short's scene.

## What to build

1. **Type:** `Keyframe.pose?: Partial<MannequinPose>`, mannequins only.
2. **`interpolatePose(keyframes, t): MannequinPose | null`** in `keyframes.ts`.
   - Use only keyframes that carry a `pose` and ignore the rest.
   - Resolve each pose against `DEFAULT_POSE`.
   - Linear per-joint, per-axis lerp between the bracketing pose keyframes.
   - Hold the first/last pose outside the range.
   - Return `null` when there are no pose keyframes, so the static `o.pose` applies.
3. **`upsertKeyframe(..., pose?)`**: an optional 5th argument, stored when
   given. Existing callers and behaviour stay unchanged.
4. **Render:** the mannequin shows `interpolatePose(o.keyframes, playheadTime) ?? o.pose`.
5. **Editing rules** (keep them simple and predictable):
   - **Add key** on a mannequin also stores its current pose: the interpolated
     one if it has pose keys, otherwise the static one.
   - If the figure **already has pose keyframes**, a pose edit (PosePanel
     change, library apply, joint gizmo drag) **auto-keys at the playhead**,
     using an upsert with the current interpolated position/rotation. Otherwise
     it writes the static pose as today.
   - The PosePanel shows the pose at the playhead.
6. **`parseScene`**: accept a keyframe `pose`. Reject unknown joint names and
   values that aren't `[x, y, z]` finite numbers, with an error containing
   the word "joint".
7. **`purse-hook.json`**:
   - Give the mannequin pose keyframes: the current bent pose at 0 s and 3 s,
     upright (spine ≈ 0, head ≈ 0, arms relaxed or one arm out) by 6 s, held to 8 s.
   - Remove the static bent `pose` or keep it; keyframes win either way.

## Acceptance (the metric)

All of these must be true. Report each one explicitly.

1. **`src/components/stage/poseKeyframes.test.ts` passes unchanged.** It was
   written as the spec before the implementation. If a test looks wrong, say
   so in the PR. Don't edit it to pass.
2. **`npm run check` is green**: typecheck, lint, all Vitest and node tests.
   Existing keyframe and scene tests still pass.
3. **New e2e test `tests/e2e/pose-keyframes.spec.ts`**, following the style of
   `tests/e2e/pose-library.spec.ts`:
   - Add a mannequin, enter Pose, apply **Bow**, press **Add key** at 0 s.
   - Scrub to 4 s, apply **Neutral**: it auto-keys (the figure has pose keys).
   - Scrub to 2 s. Select joint `spine`: the "Bend (X) degrees" value is
     strictly between Bow's (≈37°) and 0.
   - No page errors.
4. **CI on the PR is green**: `check`, `e2e` and `eval`. The eval job doesn't
   touch stage code and should stay green; if it breaks, find out why.
5. **No regressions:**
   - Existing saved layouts (localStorage `director-stage-layout-v3`) with
     no pose keys render exactly as before.
   - Camera and prop keyframes still work.
   - `e2e/camera-view.e2e.mjs` still passes, if you can run it.

## Guardrails

- No paid API calls. There is no `OPENROUTER_API_KEY` in cloud, and it
  shouldn't be used anyway.
- Don't touch `evals/fixtures/` (real actor photos), `.data/` or the CI eval job.
- Keep the diff focused: no refactors of unrelated StageScene code, no new deps.
- Match the code's style: comments explain *why*, as the existing ones do.
- Work on branch `pose-keyframes` and push to this PR (#5). Don't merge.

## Known limits (accept them, don't try to solve)

- **Euler lerp:** large rotations can swing the long way round or twist.
  That's fine for blocking. No quaternions or slerp in this PR.
- **No IK:** feet can slide and hands won't exactly reach the purse.
- **Linear timing:** no easing curves. Optional only if trivial; mention it if you add it.
- **Can't judge the look:** if the browser runs, take screenshots at
  0/2/4 s and attach them to the PR. If not, say so.

## Done = report in the PR description

- Each acceptance item with pass/fail and the command output summary.
- CI run link.
- Anything not verified.
- Any decision you made that this doc didn't cover.
