# Todo

## Stage (3D room prototype) — in progress
r3f + drei playground at `/stage`, linked from the header's "Go to studio"
button. Floor + backdrop wall, OrbitControls camera, and a set of selectable
objects manipulated with a gizmo (no physics — props stay where they're put).

Physics (`@react-three/rapier`) was tried — drop-and-stack simulation, plus a
drag-to-place/pin-with-toothpick interaction — but didn't serve the actual
goal, so it's parked on the `stage-physics` branch rather than carried
forward.

Everything selectable (box/ball props, the two light stands, one camera
marker) shares one gizmo, toggled between Move and Rotate in the toolbar.
Uses drei's `TransformControls` as-is for both modes — its plane handles
already mirror themselves to whichever side is camera-facing as you orbit,
no custom code needed for that. Design notes:
https://rystorm.com/blog/translate-gizmo-design.

- **Props (box/ball):** free drag, live X/Y/Z readout. Boxes can be
  stretched into cuboids via the Inventory row's Size (height) / L (X) / B
  (Z) inputs. Ctrl+drag leaves a duplicate behind at the start position.
- **Mannequin:** 14 connected joints with selectable body parts, posed
  through a "Pose" gizmo mode / pose editor (forward kinematics only, no
  IK). 14 built-in presets plus a pose library — save, search, delete,
  import/export JSON packs (versioned, validated), optionally scoped to a
  cast member. Presets set joint rotations only; library is per-browser
  (`localStorage`). Details: `docs/architecture/posing.md`. Whole-figure
  move/rotate is unchanged. Looked at driving that rig from
  webcam mocap instead of hand-posing: FreeMoCap (https://freemocap.org/)
  is the obvious candidate but it's AGPL/copyleft and Python-only
  (multi-cam capture app, offline triangulate-and-export pipeline) — wrong
  license and wrong shape for a browser app. Better fit: MediaPipe Pose
  running client-side (`@mediapipe/tasks-vision`, Apache-2.0) off a single
  webcam, same landmark scheme (33 points, x/y/z/visibility) already proven
  out in the old Shravan project
  (github.com/Bigguysahaj/SHRAVAN--elderly-physiotherapy-app, MIT, own
  code) — real-time in-browser, no Python sidecar, no licensing problem.
  Single-camera MediaPipe pose is 2.5D (image-plane x/y + relative z, not
  triangulated metric 3D like FreeMoCap), which is fine for a blocking
  stand-in, not for research-grade mocap. Not started. **Future plan:**
  real IK; live mocap driving the rig or seeding
  keyframes instead of posing by hand.
- **Light stands:** move and rotate to re-aim — the spotlight's target is a
  child Object3D of the stand's group (not a fixed world point), so the beam
  actually turns with it.
- **Camera marker:** move/rotate like anything else, plus a "Camera view"
  toggle that swaps the whole viewport to that camera's POV (`makeDefault`
  flips between the main orbit camera and the marker's own nested
  `PerspectiveCamera`; `OrbitControls` disables while active). "Capture
  photo" and "Record clip" are always available (not gated on being in
  camera view) — triggering them auto-switches into camera view, does its
  thing, and auto-restores whatever view you were on before. A
  picture-in-picture version of the camera view via drei's `<View>` portal
  (https://drei.docs.pmnd.rs/portals/view) was tried and worked, then pulled
  back out — user wants to build that part themselves. **Fly controls**
  (`FlyController` in `StageScene.tsx`, maths in `flyMath.ts`): while in camera
  view, W/A/S/D fly along the view / strafe, Q/E go down/up (world vertical),
  Shift is a 3x boost, and right-drag, F + left-drag, or the "Drag to look"
  toggle looks around. Camera view has a compact top bar with a collapsible
  "Shortcuts" guide grouping movement, rotation, and lens controls. Look
  gestures intercept scene/gizmo events and stop on release, cancellation,
  or focus loss — so the camera can be repositioned without round-tripping
  through the orbit view (its own gizmo is unusable there since it renders at
  the viewer's eye point). Ordinary left-drag still handles selection and
  gizmos when Drag to look is off and F isn't held; yaw is about world-up, pitch is clamped to
  ±85°, existing roll is preserved. Clamped to the room, per-frame delta
  capped at 0.1s, ignored while typing in an input or during a whip move, and
  the result is written back to the layout (and so persisted) when input
  stops. Roll keys moved from W/E to `,` / `.` to free the fly keys. Tests:
  `npm test` (pure maths, no deps) and `npm run test:e2e` (Playwright against
  a running dev server, reads the camera back out of the autosaved layout).
- **Camera moves:** hold-to-run moves — dolly zoom in/out (I/O), zoom
  (Z/X), pan (L/P), tilt (T/B), roll (,/.) — behind a "+ Camera moves"
  popover, bound to both a key and a press-and-hold toolbar button. Held, a
  move progresses at a fixed rate every frame (`HoldMoveAnimator`,
  framerate-independent via useFrame's `delta`); released, it stops at once.
  Whip pan and whip dolly zoom are one-click eased sweeps
  (`WhipMoveAnimator`). Dolly zoom does the real Vertigo effect (position +
  inverse FOV together, subject stays the same apparent size while the
  background warps), not a plain push-in. **Future plan ("other"):** more
  move types — crane, truck/dolly-track, arc, rack focus; literal placeable
  rig props (a tripod
  to pan/tilt from, a dolly track/moving crate to physically attach the
  camera to) instead of the camera just animating itself in place.
- **Inventory:** collapsed into a "+ Add" popover (Size/L/B dimension
  inputs + Mannequin, Box/Ball/Purse and Wind machine buttons).
- **Keyframing:** an 8s timeline bar (scrub track, Play/Pause, tick marks)
  bottom-docked under the toolbar, shown only while a keyframeable object is
  selected (`selected && canKeyframeSelection`) — Play with nothing selected
  had nothing to play back, so it stayed hidden until then. A selected
  box/ball/purse/mannequin/camera's position/rotation can be recorded at the current
  playhead time via "+ Key" (and removed via "− Key"); between two
  keyframes it linearly interpolates, so scenes can have simple blocked-out
  motion instead of being fully static. A mannequin's key also stores its
  joint pose, interpolated per joint. Lights aren't keyframable. A keyframed camera gives a
  moving shot; "Record take" plays the timeline from 0 while recording and
  stops at the end. Whole scenes export/import as JSON ("Export scene" /
  "Import scene", `director-stage-scene/v1`, validated in `scene.ts`;
  example: `docs/scenes/purse-hook.json`). **Future plan:** loop/ping-pong playback, more
  than one clip, eased (not just linear) interpolation.
- **Cast:** roster built on `/audition` — upload one reference photo per
  member, generate a 9-shot character sheet (4 body angles + 5 expressions)
  via `/api/character-sheet` (one grid image per sheet, cropped into shots
  in the browser — see `src/lib/characterSheet.ts`), with the billed cost
  passed through from the provider where reported. A ready-made sheet can
  be added whole instead ("Add from sheet") and edited into candidates. Default model is
  `google/gemini-3.1-flash-lite-image` (Muse Image is region-blocked from
  the dev IP). Roster, photos and shots persist on disk per project under
  `.data/projects/<id>/cast/` (gitignored) via `/api/cast`, not the browser. On `/stage`, the "+ Cast"
  popover assigns a roster member to the selected mannequin, which copies
  the mannequin's color-code onto the member (`stageColor`).
- **Screen Test (`/screen-test`):** one image from any mix of a dropped
  image, cast and a prompt. In stage mode it composites a captured `/stage` photo
  with the reference photos of whichever cast members are assigned to its
  color-coded mannequins, into a photoreal shot on a fixed garden backdrop
  (`src/lib/screenTest.ts` — prompt is strict about keeping blocking/
  spacing exact, after an early test merged two mannequins into one
  couple). Model chosen per run with the "DoP" picker, fed by OpenRouter's
  live image-model catalog via `/api/image-models` (fallback list in
  `src/lib/imageModels.ts`), plus Seedream via ModelArk when `ARK_API_KEY`
  is set. Every result is kept in a history (`.data/screen-test/`).
  **Future plan:** selectable backdrops.
- **Layout persistence:** every change (drag, rotate, add, duplicate)
  auto-saves to `localStorage`; "Reset layout" clears it and returns to the
  default arrangement.

Deliberately simple for the prototype phase — no true curved cove backdrop
(flat wall + floor instead), no HDRI environment. Inspo for a future lighting/
debug-panel pass: `docs/inspo/studio-room/` (from sweriko/ai4anim-webgpu).

## Auditorium mode (future, for fun)
A PVR / IMAX-style viewing mode for reviewing a completed take: dim the rest
of the UI, frame the video like a cinema screen (curtains that open on
playback, subtle seat-back/armrest silhouettes along the bottom edge,
optional widescreen letterbox), maybe a soft audience-ambience toggle. Purely
a delight-factor presentation layer on top of the existing Viewer — no change
to generation logic. Not started.
