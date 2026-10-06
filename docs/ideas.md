# Ideas map (2026-10-06)

Brain-dump sorted by horizon. Move items between sections as they firm up.

## Core direction (keep everything aligned to this)
Director = a virtual film set: block a scene in 3D with stand-ins, shoot it
with a real camera move, then use AI to turn it into finished footage with
consistent actors.
Stage (blocking + camera) → Audition (actors) → Screen Test / video gen.

## Now (current goal: shoot a YouTube Short on /stage)
- [x] Backdrop picker on /stage: plain / green screen / dropped image (session-only).
- [ ] Evals: blocking-fidelity + identity checks for Screen Test, character
      sheet grid/identity checks. Golden set of ~10 stage photos + cast refs.
- [ ] Shot list for the Short, using the existing camera-move library + Record clip.

## Research (small, scoped subagent tasks)
- Open models via API: which OpenRouter / fal.ai image + video models (Wan,
  Hunyuan, LTX, Flux Kontext, Qwen-Image-Edit) handle multi-reference + pose.
  Output: table of price, latency, region access, ref-image support.
- Language → pose: "JEV" (confirm: V-JEPA 2?) vs. LLM emitting joint angles
  for our rig vs. text-to-motion models (MDM / MotionGPT family). Which is
  cheap enough to run per edit.
- Camera trajectory from video: monocular camera-pose estimation (e.g.
  MegaSaM / VGGT-style) → our keyframe format.
- Eval method: VLM-judge reliability for spatial/blocking checks vs.
  pose-keypoint comparison (MediaPipe on both images).

## Next (after the Short)
- LLM/agent blocks the whole stage from a scene idea: emits a JSON scene
  (objects, positions, poses, keyframes, camera move) that /stage loads.
  Start with schema + "load scene JSON" button; the LLM comes after.
- Audition as a reference library: upload sheets/images, not just generate;
  per-image annotation (what it shows, relation to the character).
- Character consistency as opt-in module.

## Future scope (park, don't build yet)
- Trait orbits: traits on rings by change rate (never: birthmark, dimple ·
  rarely: weight, build · long: kalai dhaga, mala · sometimes: earrings,
  hairstyle · often: clothes). Inner rings = locked in prompts, outer =
  free to vary. Drag to re-orbit. Low cost: it's just tagged text + a
  prompt-assembly rule, an SVG UI on top.
- Context-consistency rules (needs a script/boardroom dept first): character
  context (income, background, era, place, job, faith, health, story day)
  constrains wardrobe/props; e.g. outfit cost can't exceed the character's
  budget unless the screenplay team approves. Same engine as orbits: traits
  + rules → prompt + a validator that flags violations.
  Other constraint axes: era/period accuracy, climate/season/weather,
  occupation wear (uniform, calluses, sun tan), injury/health continuity
  (bandage stays until healed), story-time (beard growth, wet clothes after
  rain), relationship markers (ring after wedding scene), arc-driven wardrobe
  (palette shifts as the character changes), planetary palette per character
  (Vedic: Venus = white/pastel, Saturn = dark blue/black).
- Storyboard/screenplay section (minimal) → feeds scene JSON + constraints.
- 360° LED volume (StageCraft-style): wrap backdrop as a cylinder/sphere
  (equirect image or video), lit by it.
- Video backdrops, keyed actors composited live.
- Webcam mocap (MediaPipe) driving mannequins — see TODO.md.
