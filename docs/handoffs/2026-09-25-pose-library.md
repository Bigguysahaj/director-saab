# Pose library handoff — 2026-09-25

## Status and user intent

PAUSED at the user's request. They had to leave and explicitly asked to do tests
later, then asked for this handoff. Do not interpret this note as permission to
resume testing until they resume the work.

Confirmed scope: “Yes, build the pose library now; plan AI and demeanor for later.”
The user likes preset poses, wants more poses and a library that can acquire more
later, and expects good structure and meaningful tests. They are interested in
character-specific movement peculiarities and text/voice control as future work.

Implementation is saved in the working tree. This session did not commit, push,
or deploy it. The tree contains substantial unrelated/concurrent edits in
Audition, cast APIs, screen tests, model/provider code, and other files. Preserve
those changes; do not reset the tree or stage everything indiscriminately.

## Implemented

- Earlier work expanded the mannequin into 14 connected joints with selectable
  body parts, local rotation gizmos, sliders, numeric angles, and resets.
- Expanded the preset catalog from 6 to 14: Neutral, T pose, Wave, Reach, Walk,
  Point, Cheer, Bow, Listen, Explain, Shrug, Run, Look back, Sit.
- Pose library: search, apply, save current pose, delete saved pose, import/export
  JSON packs, and saving for everyone or a selected cast character's stable ID.
- Library persistence is browser localStorage, not a cloud store or marketplace.
  Subscribes to changes across tabs. Exactly simultaneous writes are still
  last-writer-wins, as documented.
- Versioned rig/pack contract, joint/angle validation, independent rotation-array
  copies, 1 MB pack and 200-pose limits. Failed imports are atomic; unreadable
  storage is preserved and disables writes. Imports get fresh IDs and clear
  foreign character assignments.
- Presets only change joint rotations. Joint poses are static across the timeline;
  root transforms remain the only animated keyframes. Move is needed to place
  seated figures. No IK, voice, model calls, or demeanor engine was implemented.
- Added Vitest, React Testing Library, Playwright, npm scripts, and a GitHub Actions
  workflow. Replaced the earlier ad hoc scripts/check-stage-rig.cjs with tests.
- Browser testing found inventory could overlay the Pose button after adding a
  mannequin. Latest fix: addFromInventory now calls setInventoryOpen(false).
  THIS FIX HAS NOT YET PASSED BROWSER VERIFICATION.

## Main files

- src/lib/poses/model.ts — canonical rig data/types, copying, validation.
- src/lib/poses/catalog.ts — preset asset catalog.
- src/lib/poses/library.ts — pack parsing, persistence, imports, ownership filters.
- src/lib/poses/usePoseLibrary.ts — React external-store subscription.
- src/components/stage/PoseLibrary.tsx — library UI and storage feedback.
- src/components/stage/PosePanel.tsx — joint editing and library integration.
- src/components/stage/Mannequin.tsx — articulated geometry.
- src/components/stage/StageScene.tsx — selected-figure wiring; shared file with
  other ongoing work. Also ignores SELECT/TEXTAREA targets in keyboard shortcuts.
- src/components/stage/types.ts — re-exports canonical pose types.
- vitest.config.mts, playwright.config.ts, .github/workflows/checks.yml.
- src/lib/poses/library.test.ts and stage/*.test.ts(x).
- tests/e2e/pose-library.spec.ts — real browser flows.
- docs/architecture/posing.md — implemented boundaries, format, future design.
- README.md — feature and test instructions.

## Verification: actual evidence

- Earlier complete `npm run check` PASSED: TypeScript, repository ESLint, and
  50 tests in 5 Vitest files. Covers imports/storage errors, cast visibility,
  asset isolation, joint edits/resets, cross-tab updates, rig hierarchy/limb
  transforms, presets, and timeline operations.
- That pass was BEFORE the latest inventory-popover fix. Later check was
  interrupted at user request; it is NOT a new pass.
- Browser tests have NOT passed. Initial runs failed from environment setup,
  then exposed the actual inventory overlap. After fixing it, the rerun was
  interrupted at user request.
- At handoff, test-results/.last-run.json says `status: interrupted` and
  `failedTests: []`. An empty failedTests list is NOT a successful test run.
- No production build, deployment, full-app coverage audit, or final screenshot
  review was completed. Other sessions may have edited files since the passing
  checks. Verify current state on resumption.

## Resume steps (when user asks)

1. Read AGENTS.md and relevant installed Next.js guides before framework edits.
   Inspect git status/diffs to preserve concurrent changes.
2. Run `npm run check` on the current tree.
3. Run the two browser tests. The usual default is `npm run test:e2e`, which
   starts a dedicated dev server on localhost:3100. However, Next.js locks this
   project to one development server. Another session had localhost:3000 running;
   do not kill that server. Reuse it with the command below if still available.
4. Fix real failures and rerun only the necessary checks. Tests should exercise
   save → reload → apply to a new figure → export → delete, and invalid/valid
   import flows. Do not bypass overlapping UI with forced clicks.
5. Review the stage visually. The first browser test saves a screenshot at
   test-results/stage-pose-library.png if it reaches that step. Confirm pose
   editor scrolling, discoverability, and actual mannequin changes.
6. Report implementation and exact verification scope. Do not claim production
   readiness or complete app coverage. The user wanted a solid foundation, not
   untested assertions about quality.

Command used for this machine:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 \
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/home/bigguysahaj/.cache/ms-playwright/chromium-1140/chrome-linux/chrome \
npm run test:e2e
```

Use localhost, not 127.0.0.1, when reusing this server: Next.js blocked dev JS
resources from the alternate origin. Browser and local-network access required
sandbox escalation. Tests use isolated browser storage and do not call paid AI
APIs. If the existing Chromium is unavailable, install Playwright Chromium per
README. Node runtime is 22; @types/node was updated to 22 for Vitest compatibility.

## Future AI / demeanor direction (not implemented)

User confirmed “Jev” refers to the recent project. Research found TypeSafe Jev:
https://docs.typesafe.ai/introduction
https://typesafe.ai/blog/introducing-system-one-models-and-jev

Official docs describe Choice, Score, and Noul typed decisions. Proposed use:
choose a known pose, joint/side, action, and bounded adjustment intensity. This
is an architectural inference, not a tested pose-control capability. Jev does
not establish human-motion generation quality; vendor speed claims were not
benchmarked. A small model with structured output is another future candidate.

Proposed pipeline: text (or push-to-talk transcription) → intent adapter →
validated pose command → deterministic pose/IK engine → preview/undoable edit.
Engine owns joint limits, contacts, transforms, and interpolation. Commands must
be scoped to character ID and scene revision so stale replies cannot edit a newly
selected figure. Evaluate negation, left/right, preserved contacts, ambiguity,
latency, and correction rate before choosing a provider.

Character demeanor should live under stable cast identity with preferred poses,
authored posture offsets, gesture preferences, and later timing/transition
traits. Explicit user direction overrides those defaults. Pose, transition, and
character profile remain distinct data. See docs/architecture/posing.md for the
full roadmap and acceptance gates.
