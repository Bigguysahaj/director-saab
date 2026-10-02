# Poses, character movement, and future language control

Status: pose library implemented; character demeanor, language/voice control,
IK, and joint animation are proposals, not implemented features.
Research checked: 2026-09-25.

## Current behavior

The stage supports 14 connected joints and 14 built-in static poses. Users can
apply, modify, name, save, search, delete, export, and import poses. Saved poses
can be shared across figures or restricted to a cast member's stable ID. Two
figures assigned the same cast member see the same character poses. Reassigning
a figure does not transfer the previous character's poses to the new character.

The pose library is local to this browser and origin. It is not a cloud store or
commercial marketplace. Export makes a portable backup. Imports add fresh IDs
and clear character ownership because a foreign cast ID cannot safely identify
a local character. Imported poses can be applied and saved for a local character.

Presets change joint rotations only. Sitting and other poses may need the figure
repositioned with Move. Joint rotations are static across the timeline; existing
keyframes animate the figure's root transform only.

## Code boundaries

- `src/lib/poses/model.ts`: canonical joint names, neutral rotations, independent
  pose copies, strict import validation. It has no React or Three.js dependency.
- `src/lib/poses/catalog.ts`: bundled assets with stable IDs. New built-in poses
  require data changes here, not new UI branches.
- `src/lib/poses/library.ts`: versioned pack schema, serialization, validation,
  import semantics, and persistence behind a small storage interface.
- `src/lib/poses/usePoseLibrary.ts`: React's external-store subscription to browser
  storage. It handles hydration and storage updates from other tabs.
- `PoseLibrary.tsx`: library browsing, forms, file import/export, and user feedback.
- `PosePanel.tsx`: joint editing and applying poses to the selected figure.
- `Mannequin.tsx`: articulated geometry; receives pose data, never reads storage.
- `StageScene.tsx`: scene selection and updating the selected figure's pose.

`stage/types.ts` re-exports rig types for existing stage consumers. The domain
model does not depend on the UI. Rotations use radians and Three.js XYZ Euler
order. The figure faces +Z. Pose keys use the rig's existing left/right convention.
A rig coordinate change must change the rig ID and supply an explicit migration.

## Pose pack contract

```json
{
  "version": 1,
  "rig": "director-mannequin-v1",
  "poses": [
    {
      "id": "example-wave",
      "name": "Small wave",
      "pose": {
        "rightArm": [0, 0, 2.2],
        "rightElbow": [-1.2, 0, 0]
      }
    }
  ]
}
```

Missing joints default to neutral. Unknown joints, malformed rotations, nonfinite
numbers, angles outside ±π, duplicate IDs, incompatible versions, and invalid
names are rejected. These are data validity bounds, not anatomical limits.
There is a 1 MB pack limit and a 200-pose library limit. A failed import leaves
existing data untouched. Unreadable storage is preserved and disables writes;
write failure is shown as an error instead of a success notice.

Cross-tab storage events refresh the UI. localStorage is not transactional;
exactly simultaneous writes from different tabs remain last-writer-wins. Move to
a transactional server repository before offering shared or account-wide editing.

## Character demeanor: proposed design

Store a versioned movement profile under the stable cast identity, separately
from the current shot and current pose. A profile could contain:

- Preferred pose asset IDs and a default resting pose.
- Authored posture offsets: head tilt, shoulder posture, resting arm position.
- Gesture preferences: preferred hand, gesture size, symmetry, expressiveness.
- Motion preferences once animation exists: tempo, pause length, acceleration,
  settling time, and preferred transition clips.

A pose describes where the body is. A transition describes how it gets there.
A demeanor supplies defaults and variation for both. An explicit user request
must override profile defaults, and hard contact constraints must still hold.
Expose editable, observable traits rather than promising to infer personality
from a name, photograph, or a broad label such as "confident".

Example future direction: “Have Mira explain it, in her usual restrained way.”
Choose an explain gesture, apply Mira's preferred hand and smaller gesture range,
and later use her authored timing. Store the selected asset, profile version,
resolved command, and final pose so the result can be reproduced after a model
or profile changes.

## Text and voice: proposed execution path

Text → intent adapter → validated command → pose/IK engine → preview → undoable edit.
Voice adds push-to-talk transcription before the same text path. Show the heard
words, support correction, and never silently apply a stale response to a newly
selected character.

Start with a small command vocabulary:

- Apply a known pose by asset ID, optionally to an explicit set of joints.
- Set or offset a named joint's rotation in explicit units.
- Mirror a pose using a tested rig convention.
- Later: position a hand/foot target, pin a contact, look at a target, or transition
  over a specified duration.

The model should choose commands and parameters. Engine code validates targets,
units, finite values, anatomical constraints, and reachable positions. It owns
transforms and interpolation. A command batch is one undoable transaction and
must be rejected atomically if invalid. Models must never execute code or mutate
scene objects directly. Batch commands need character ID and scene revision;
responses to stale selections are discarded or re-previewed.

Example future request: “Keep her feet still and bring her right hand closer to
her face.” Resolving this needs foot contacts, a hand target relative to the head,
and an IK solver. Language interpretation alone cannot provide those mechanics.

For gradual adjustments, reuse the previous command's explicit target, not an
implicit global "last joint." Ambiguous side, character, or reference frame must
produce a short clarification or reversible preview, not a silent guess.

## Jev and small language models

[TypeSafe's official introduction](https://docs.typesafe.ai/introduction) describes
Jev as a typed decision model with Choice, Score, and Noul outputs. It evaluates
questions against supplied state; it does not generate arbitrary text. Choice
selects among predefined options; Score rates a rubric; Noul estimates the
probability of a statement. Questions are evaluated independently, so software
must check consistency across answers.

Proposed Jev use: choose from available pose IDs, identify left/right/both, select
an action from a fixed vocabulary, and choose an authored intensity level. This
is a design inference, not a tested capability or an integrated feature. A score
is not a direct continuous 3D joint-coordinate prediction.

A small language model with constrained structured output is another candidate
for composing multi-step commands and explicit numeric adjustments. Choose a
model through task-specific evaluation rather than committing to a provider now.
Jev and small models can still misunderstand validly typed requests. Compare
end-to-end latency and correction rate; do not treat vendor benchmarks as app
performance measurements.

[TypeSafe's launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
provides vendor speed/cost claims. Those have not been benchmarked here. No model
calls, credentials, speech capture, or provider dependencies are added by this work.

For later motion synthesis, NVIDIA's [GEM research](https://research.nvidia.com/labs/dair/gem/)
explores human motion with text, audio, video, keypoint, and keyframe conditioning.
It is a separate research direction requiring rig retargeting, runtime/resource
and licensing review, and animation-quality evaluation.

## Delivery order and acceptance gates

1. Current: static asset library, cast ownership, validated portable packs,
   deterministic model, and automated tests.
2. Editor confidence: undo/redo transactions, pose thumbnails, mirroring, joint
   limits, IK, pinned contacts, and visual pose review across camera angles.
3. Character profiles: authored neutral poses and optional gesture preferences;
   test ownership, migration, explicit overrides, and profile versioning.
4. Text prototype: a fixed command schema and fixture-based intent evaluations.
   No model access to storage or arbitrary execution.
5. Voice: push-to-talk → visible transcript → same tested command engine.
6. Motion: joint keyframes, rotation interpolation, transitions/contact handling,
   and repeatable character-specific timing.

Before a model ships, evaluate held-out examples for left/right, “don't move the
feet,” negation, relative adjustments, multiple characters, “a little more,”
unsupported requests, noisy transcripts, and cancellation. Report command
accuracy, wrong-character edits, unintended-joint edits, correction rate, p50/p95
latency, and cost. Structural validity alone is not an accuracy metric.

## Verification and remaining scope

`npm run check` runs TypeScript, repository lint, and Vitest tests for pose schema,
asset isolation, persistence, invalid imports, character visibility, UI save/apply,
storage failure, rig hierarchy and limb movement, and timeline operations.
`npm run test:e2e` exercises the real stage in Chromium, including save/reload/apply,
export, deletion, and invalid imports. GitHub Actions runs both on pushes and PRs.
Browser tests use a dedicated port and isolated browser storage, with no model
calls or paid services. They use the development server; they are not a production
build or deployment check.

This establishes coverage for the posing feature and core timeline behavior, not
full application coverage. Cast file APIs, generation polling/retries, auth,
provider contracts, media export, broader accessibility, and production builds
need their own tests before claiming application-wide production readiness.
