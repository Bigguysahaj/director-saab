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
- **Mannequin:** a plain stand-in figure (head/torso/arms/legs from
  primitives) for blocking where a person goes. Moves/rotates as one unit —
  not a rig. **Future plan:** posable joints (per-limb rotation, maybe a
  simple IK for arms/legs) so it can actually act, not just stand there.
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
  back out — user wants to build that part themselves. **Future plan:** fly
  controls (WASD + mouse-look) bound to the camera while in camera view, so
  it can be repositioned without round-tripping through the orbit view — its
  own gizmo is unusable there since it renders exactly at the viewer's eye
  point.
- **Camera moves:** three hold-to-run moves — Dolly zoom in (I), Zoom (Z),
  Pan (P) — behind a "+ Camera moves" popover, bound to both a key and a
  press-and-hold toolbar button. Held, a move progresses at a fixed rate
  every frame (`HoldMoveAnimator`, framerate-independent via useFrame's
  `delta`); released, it stops per a Linear/Quad toggle — Linear halts
  instantly, Quad eases out over ~0.4s. Dolly zoom in does the real Vertigo
  effect (position + inverse FOV together, subject stays the same apparent
  size while the background warps), not a plain push-in. **Future plan
  ("other"):** more move types — crane, truck/dolly-track, arc, rack focus,
  and a dolly-*zoom-out* counterpart; literal placeable rig props (a tripod
  to pan/tilt from, a dolly track/moving crate to physically attach the
  camera to) instead of the camera just animating itself in place.
- **Inventory:** collapsed into a "+ Inventory" popover (Size/L/B dimension
  inputs + Box/Ball/Mannequin buttons), replacing the old always-expanded
  row. **Future plan:** keyframing — record a shape's (or the mannequin's)
  position/rotation at chosen points in time and animate between them, so
  scenes can have simple blocked-out motion instead of being fully static.
- **Layout persistence:** every change (drag, rotate, add, duplicate)
  auto-saves to `localStorage`; "Reset layout" clears it and returns to the
  default arrangement.

Deliberately simple for the prototype phase — no true curved cove backdrop
(flat wall + floor instead), no HDRI environment.

## Auditorium mode (future, for fun)
A PVR / IMAX-style viewing mode for reviewing a completed take: dim the rest
of the UI, frame the video like a cinema screen (curtains that open on
playback, subtle seat-back/armrest silhouettes along the bottom edge,
optional widescreen letterbox), maybe a soft audience-ambience toggle. Purely
a delight-factor presentation layer on top of the existing Viewer — no change
to generation logic. Not started.
