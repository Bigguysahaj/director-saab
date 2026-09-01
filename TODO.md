# Todo

## Stage (3D room prototype) — in progress
r3f + drei + rapier playground at `/stage`, linked from the header's "Go to
studio" button. A small physics room: floor + backdrop wall, two decorative
softbox-on-a-stand light props (inspired by a studio-lighting diagram),
OrbitControls camera, and a handful of boxes/spheres that drop and stack via
`@react-three/rapier`. "Reset stack" re-drops a fresh set.

Deliberately simple for the prototype phase — no true curved cove backdrop
(flat wall + floor instead), no HDRI environment, light props are static
decoration (the actual illumination comes from real spotLights at the same
position). Next steps if it's worth continuing: curved cove geometry, nicer
prop materials/shadows, maybe let dropped shapes be picked/dragged.

## Auditorium mode (future, for fun)
A PVR / IMAX-style viewing mode for reviewing a completed take: dim the rest
of the UI, frame the video like a cinema screen (curtains that open on
playback, subtle seat-back/armrest silhouettes along the bottom edge,
optional widescreen letterbox), maybe a soft audience-ambience toggle. Purely
a delight-factor presentation layer on top of the existing Viewer — no change
to generation logic. Not started.
