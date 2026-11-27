# Stage blocking, camera, and scene files

Status: implemented on `/stage`. The room is a flat floor and wall (no cove,
no HDRI). There is no physics, no IK, and playback does not loop. The wind
machine is a placeable prop; its strength, gust, and start time are stored
and do not move other objects. Pose packs are documented in
[posing](posing.md).

## What a shot is

`/stage` is a blocking set. You place props and mannequins, aim one camera,
and capture a still or a clip from that camera. The orbit view is a separate
camera used to build the set. **Camera view** swaps the viewport to the stage
camera. Capture and recording always use that camera: if you were in the orbit
view, they enter camera view first and, when they started the switch, leave it
again when the photo or clip finishes.

The room shell is 12 wide and 8 deep. The floor slab is 0.2 thick and centered
on y = 0, so its top face is y = 0.1. The back wall faces the set at
z = −2.9. Props stay where they are put. Ctrl+drag duplicates a box, ball, or
purse; mannequins, lights, the camera, and the wind machine do not duplicate
that way.

## Where state lives

| State | Store | Scope |
| --- | --- | --- |
| Current layout | `localStorage` key `director-stage-layout-v3` | This browser. Not per project. |
| Layout at each recording | `director-stage-snapshots-v1`, newest 20 | This browser. Keyed by the clip timestamp. |
| Keypoint export toggle | `director-stage-export-keypoints` | This browser. Off by default. |
| Backdrop (plain, green, or a dropped image) | React state | This tab. An image backdrop is an object URL and is not saved. |
| Cast assignment on a mannequin | `castId` inside the layout, plus `stageColor` on the roster | Layout is local. The roster write goes to the active project on disk. |

Every layout change autosaves the objects array. If `localStorage` is full or
blocked, the write fails quietly and the next reload uses the default set.
**Reset layout** deletes the layout key and restores that default. It does not
clear recordings' snapshots or the pose library.

Switching projects does not swap the blocked set. The roster shown in **+ Cast**
is the active project's. Assigning a member stores their id on the mannequin
and, separately, copies the mannequin color onto that member's `stageColor`.
Screen Test reads `stageColor`. If the roster write fails, the mannequin still
keeps `castId`.

## Scene file

**Export scene** downloads `{ "schema": "director-stage-scene/v1", "objects": [...] }`.
**Import scene** accepts that wrapper or a bare array. The `schema` string is
written on export and is not checked on import. A failed import alerts and
leaves the current layout in place. Worked example:
[`docs/scenes/purse-hook.json`](../scenes/purse-hook.json).

`parseScene` (`src/components/stage/scene.ts`) requires a non-empty list. Each
object needs a unique numeric `id`, a known `kind`, and finite `[x, y, z]`
`position` and `rotation` (radians, Three.js XYZ Euler). Kinds are `box`,
`ball`, `purse`, `light`, `camera`, `mannequin`, and `wind`. More than one
camera is rejected.

Optional fields the renderer uses:

- `color`, `size`, `length`, `breadth` for box, ball, and purse. `length` is X
  and `breadth` is Z; each falls back to `size`. A purse added from the
  inventory ignores the Size / L / B inputs and uses a fixed handbag
  (height 0.3, length 0.45, breadth 0.2) sitting on the floor.
- `fov` for the camera. Missing fov is 50.
- `pose` for a mannequin: joint name to `[x, y, z]`. Missing joints resolve to
  the neutral pose. Joint names are the rig's viewer-side keys (`leftArm` is
  the figure's own right); see posing.md.
- `castId` for a mannequin.
- `keyframes` for box, ball, purse, mannequin, and camera.
- `strength` (≥ 0), `gust` (boolean), and `at` (seconds, 0 through 8) for wind.

Autosave reload does not run `parseScene`. It accepts any non-empty JSON array.
Hand-written files should go through Import, which does validate. New objects
from the inventory get ids starting at `max(1000, highest id + 1)`.

## Timeline

The timeline is 8 seconds (`TIMELINE_DURATION`). It is shown only while a
keyframable object is selected. Lights and the wind machine are not
keyframable, so selecting one hides the bar.

Play advances with the frame delta and stops at 8s. It does not loop. Pressing
play at the end jumps back to 0 and starts again. Scrubbing pauses and snaps
the playhead to 0.1s. **Record take** rewinds to 0, starts a recording, and
plays until the end, which stops the recorder. Stopping the recording early
does not stop that playback. The next manual **Clip** still records until you
stop it.

**+ Key** stores the selected object's live position and rotation at the
playhead. A mannequin key also stores the pose shown there. The time is snapped
to 0.1s, and a key already within 0.05s is replaced. **− Key** removes the
nearest key within 0.05s. Deleting the last key freezes the object on that
key's transform (and, if it had one, its pose) instead of jumping back to the
old base values.

Between two keys, position and rotation interpolate per component. That is a
linear Euler blend, not a quaternion slerp, so a large rotation does not take
the shortest arc and can pass through an odd orientation. Before the first key
and after the last, the value holds. An object with no keys uses its base
`position` and `rotation`.

The pose track is only the keys that include `pose`. A position-only key
between them does not snap the figure to neutral. Before the first pose key
and after the last, the pose holds. With no pose keys, the static `pose` is
shown. Once any pose key exists, further pose edits auto-key at the playhead
and keep the interpolated root transform, because writing the static pose would
no longer be visible.

A keyframed object's gizmo drag is not written into the base fields. The drag
changes the live node until the next render from the keys. **+ Key** is what
makes that pose stick. The same applies to camera moves on a camera that
already has keys: the move mutates the live camera, then playback draws the
interpolated key again unless you key the result.

## Camera moves

Hold moves run while the key or toolbar button is down and stop on release.
They are ignored while typing in a field and while Ctrl, Cmd, or Alt is held.
`R` toggles Move and Rotate on the gizmo and is not a camera move. Leaving the
window cancels a stuck hold. Rates are per second:

| Move | Keys | Rate |
| --- | --- | --- |
| Dolly zoom | I in, O out | 2 metres, FOV compensates |
| Optical zoom | Z in, X out | 14 degrees of FOV |
| Pan (yaw) | L left, P right | 24 degrees |
| Tilt (pitch) | T toward top, B toward bottom | 24 degrees |
| Roll | `,` left, `.` right | 24 degrees |

Dolly zoom aims at the fixed point `(0, 1, 0)`, not at the selected object.
Apparent size at that point stays constant (`distance · tan(fov / 2)`).
Distance is clamped to 0.5–10 and FOV to 8–100. The move travels along the
line to that point, not along the camera's facing direction.

Whip moves are one click, 220ms, eased in and out. Pan whips sweep 45 degrees.
Dolly whips halve or double the distance to the same focus point, inside the
same clamps. A whip runs to completion. Starting a hold cancels it. A second
whip is ignored until the first finishes.

Fly controls work only in camera view. W and S move along the view (looking up
climbs), A and D strafe, Q and E move on world vertical, and Shift is a 3×
boost. Base speed is 2.5 m/s. Look is right-drag, F plus left-drag, or the
**Drag to look** toggle. Yaw is about world up, pitch stops at ±85 degrees, and
existing roll is kept. The camera is clamped to about x ±5.8, y 0.2–7.5, z
−2.8–3.8, and a single frame never integrates more than 0.1s. Fly does nothing
while a whip is running, and keys are ignored while typing. The layout is
updated when the input stops, not every frame.

Orbit controls target `(0, 1, 0)`, stay between 3 and 12 metres, and are
disabled in camera view. They are pinned to the orbit camera so entering
camera view does not re-aim the stage camera at the origin.

## Capture

The canvas keeps its drawing buffer, so a photo or recording taken on click is
not blank. Both wait three frames after entering camera view. With the 9:16
frame lock on, they also wait until the canvas matches 9:16 (up to about a
second) and then two more frames, so the file is that shape rather than the
whole viewport. The capture comment notes Seedance's 9:16 sizes as 480×854
and 720×1280.

**Capture photo** downloads `stage-photo-<timestamp>.png`. With **+ Keypoints**
on, it also downloads `stage-photo-<timestamp>.json`
(`director-stage-keypoints/v1`): normalized joint positions from the live rig,
plus which figures touch in 3D. Names in that file are anatomical (the
person's own left and right), so they are swapped relative to the rig's
`left*` / `right*` keys. The eval uses this file because pose models do not
find the mannequins in the photo. See `evals/README.md`.

**Clip** and **Take** record `canvas.captureStream(30)`. The mime type is the
first the browser supports of `video/mp4;codecs=avc1`, `video/mp4`,
`video/webm;codecs=vp9`, and `video/webm`. The file is
`stage-clip-<timestamp>.mp4` or `.webm`. WebM is not accepted by Seedance; the
stage shows that and leaves conversion to you. Leaving camera view stops the
recording.

When the recorder stops, the layout from the moment recording started is saved
under that timestamp (at most 20 snapshots). Send take looks the clip up by
filename. The spec rides along on the generate request and is stripped before
OpenRouter: the server writes it to `.data/takes/<jobId>/stage.json` and does
not send it to the video model. If the stage has changed since the recording,
the panel says so. A missing snapshot means the clip has no stage spec.
Editing the set after the recording does not rewrite the snapshot.

## Code boundaries

- `src/components/stage/scene.ts` validates an imported scene.
- `src/components/stage/types.ts` is the object and keyframe shape. 8s timeline,
  0.05s key tolerance.
- `src/components/stage/keyframes.ts` lerps transforms and poses and inserts or
  deletes keys.
- `src/components/stage/flyMath.ts` is the fly step, look step, and room clamp.
  No React.
- `src/components/stage/StageScene.tsx` owns the animators, autosave, import,
  and capture.
- `src/components/stage/Timeline.tsx` is the scrub bar only.
- `src/lib/stageSnapshots.ts` stores the layout that was filmed.
- `src/lib/stageKeypoints.ts` projects joints for the blocking eval.
- `src/lib/videoReference.ts` picks the recorder mime type.

## Checks

`scene.test.ts` loads `purse-hook.json` and rejects a bad kind, a short vector,
a duplicate id, a second camera, an out-of-range key, and a bad wind field.
`keyframes.test.ts` and `poseKeyframes.test.ts` cover hold-at-the-ends,
replacement within 0.05s, and pose keys that skip a position-only key.
`flyMath.test.ts` covers speed, boost, the room clamp, and pitch. `npm run
test:e2e` includes pose-key interpolation (`tests/e2e/pose-keyframes.spec.ts`)
and a take stopped early not cutting off the next clip
(`tests/e2e/record-take.spec.ts`).
