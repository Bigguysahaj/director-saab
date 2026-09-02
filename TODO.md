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

- **Props (box/ball):** free drag, live X/Y/Z readout, adjustable size (a
  "Size" field feeds the `+ Box` / `+ Ball` spawn buttons — box side / ball
  radius). Ctrl+drag leaves a duplicate behind at the start position.
- **Light stands:** move and rotate to re-aim — the spotlight's target is a
  child Object3D of the stand's group (not a fixed world point), so the beam
  actually turns with it.
- **Camera marker:** move/rotate like anything else, plus a "Look through
  camera" toggle that swaps the whole viewport to that camera's POV
  (`makeDefault` flips between the main orbit camera and the marker's own
  nested `PerspectiveCamera`; `OrbitControls` disables while active). A
  picture-in-picture version via drei's `<View>` portal
  (https://drei.docs.pmnd.rs/portals/view) was tried and worked, then pulled
  back out — user wants to build that part themselves.
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
