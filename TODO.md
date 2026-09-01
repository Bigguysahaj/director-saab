# Todo

## Stage (3D room prototype) — in progress
r3f + drei playground at `/stage`, linked from the header's "Go to studio"
button. A small static room: floor + backdrop wall, two decorative
softbox-on-a-stand light props (inspired by a studio-lighting diagram),
OrbitControls camera, and a handful of boxes/spheres sitting at fixed
positions.

Physics (`@react-three/rapier`) was tried — drop-and-stack simulation, plus a
drag-to-place/pin-with-toothpick interaction — but didn't serve the actual
goal (props need to *stay put*, not tumble), so it's parked on the
`stage-physics` branch rather than carried forward.

Repositioning is now via a translate gizmo instead: click a prop to select it
(shows arrow + 2-axis plane handles, drag snaps to a 0.25 grid, live X/Y/Z
readout bottom-right), click empty space to deselect. Uses drei's
`TransformControls` as-is — its plane handles already mirror themselves to
whichever side is camera-facing as you orbit, no custom code needed for that.
Design notes: https://rystorm.com/blog/translate-gizmo-design.

Deliberately simple for the prototype phase — no true curved cove backdrop
(flat wall + floor instead), no HDRI environment, light props are static
decoration (the actual illumination comes from real spotLights at the same
position).

## Auditorium mode (future, for fun)
A PVR / IMAX-style viewing mode for reviewing a completed take: dim the rest
of the UI, frame the video like a cinema screen (curtains that open on
playback, subtle seat-back/armrest silhouettes along the bottom edge,
optional widescreen letterbox), maybe a soft audience-ambience toggle. Purely
a delight-factor presentation layer on top of the existing Viewer — no change
to generation logic. Not started.
