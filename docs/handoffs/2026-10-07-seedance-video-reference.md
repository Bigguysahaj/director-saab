# Handoff: send a /stage take to Seedance (2026-10-07)

For the agent picking this up (cloud Claude Code, from the PR). Read
`AGENTS.md` first: this Next.js has breaking changes; check
`node_modules/next/dist/docs/` before touching route handlers or config.

**Order:** start only after PR #5 (pose keyframes) is merged. Rebase this
branch on `main` first: both PRs touch `StageScene.tsx`.

## Goal

Get a recorded /stage take, plus a character image and an optional voice
track, into a Seedance generation, with a preview and cost estimate
**before** any paid call. This is for the first YouTube Short: a purse-POV
hook (`docs/scenes/purse-hook.json`), vertical 9:16.

## Research already done (don't redo it)

From OpenRouter `openapi.json` and the catalog, checked 2026-10-07:
- `input_references` accepts `{type:"video_url", video_url:{url}}`,
  `{type:"audio_url", audio_url:{url}}` and `{type:"image_url", image_url:{url}}`.
  Audio and video are honoured by Seedance 2.x (2.5, 2.0, 2.0-fast, 2.0-mini).
  Seedance 1.5 Pro takes text and images only.
- Seedance 2.x limits (fal docs, which mirror BytePlus):
  - video: MP4 or MOV only (**not WebM**), ≤3 files, 2–15 s combined, 24–60 fps;
  - audio: MP3 or WAV, ≤15 s combined, and it needs at least one image or video ref;
  - images: ≤9.
  - Prompts refer to the inputs as `@Video1`, `@Image1`, `@Audio1`.
- **Pricing:** tokens = w × h × 24 × (output s + reference-video s) / 1024.
  - The video-input rate applies when a video ref is present.
  - Seedance 2.0 Mini: $3.5/M tokens without video input, $2.1/M with it.
  - With a reference clip as long as the output: 480p is about $0.20 for 5 s
    and $0.40 for 10 s; 720p is about $0.45 and $0.91.
- **Unverified:** whether OpenRouter takes a **data URL** for video and audio.
  Images already go as data URLs today (`Studio.tsx` `frame_images`).
  **Unverified:** whether Seedance rejects a photoreal real-person reference.
  The user will run one paid probe; you don't.

## Where things are

- `src/lib/types.ts`: `InputReference` currently allows `image_url` only.
  `GenerateRequest`.
- `src/lib/openrouter.ts`: `createVideoJob`.
  `src/app/api/generate/route.ts`: a POST passthrough.
- `src/lib/models.ts`: catalog parsing, with `supports_input_references` and
  `pricing_skus` (check what is parsed).
- `src/components/Studio.tsx`, `useGeneration.ts`, `Dailies.tsx`: the
  generate UI, polling and history.
- `src/components/stage/StageScene.tsx`:
  - `toggleRecording()`: `MediaRecorder` on `canvas.captureStream(30)`,
    WebM only today.
  - `recordTake()`: plays the timeline while recording.
- `next.config.ts`: check the request body size limit for base64 video
  (about 2–6 MB for a 10 s 480p MP4).

## What to build

1. **`src/lib/videoReference.ts`**, pure functions that make
   `src/lib/videoReference.test.ts` pass:
   - `estimateVideoCost({width, height, outputSeconds, referenceVideoSeconds?, rate, videoInputRate})`;
   - `buildInputReferences({video?, images?, audio?})`, which validates the limits above;
   - `pickRecorderMimeType(isTypeSupported)`;
   - `fitAspect(w, h, aspect)`.
2. **Types:** widen `InputReference` to the three variants. Nothing else changes.
3. **Recorder:**
   - Use `pickRecorderMimeType(MediaRecorder.isTypeSupported)` and save as
     `.mp4` when supported.
   - If only WebM is available, still save the file but show a clear "WebM:
     convert to MP4 before sending to Seedance" notice. **Don't add ffmpeg or
     any new dependency.**
4. **9:16 frame lock on /stage:**
   - A toggle ("9:16") that, in camera view, letterboxes the view to a
     centred 9:16 frame (`fitAspect`).
   - Photos and recordings must come out at 9:16: either size the canvas to
     the frame, or record a 9:16 render target. Pick the simpler one that
     really produces 9:16 pixels.
   - Target sizes Seedance accepts: 480×854 or 720×1280.
5. **Send take** flow (in Studio or a small panel; your call, keep it minimal):
   - Inputs: a recorded MP4 (file picker is fine), 0–3 character images (file
     picker; reading cast sheets from `/api/cast` is a bonus), an optional
     MP3 or WAV voice line, a prompt, model, resolution and duration.
   - **The preview step is mandatory:**
     - the video plays inline;
     - the audio is playable;
     - the images show as thumbnails;
     - the estimated cost comes from `estimateVideoCost`, using the selected
       model's catalog rates;
     - an explicit **Confirm & generate** button.
   - Nothing hits `/api/generate` before Confirm.
   - The request uses `buildInputReferences` and gets a prompt hint
     ("Use @Video1 for camera motion and blocking, @Image1 for the
     character…") that the user can edit.
   - Only models whose catalog entry supports video input are offered. Use
     Seedance 2.x ids; default to `bytedance/seedance-2.0-mini` at 480p.

## Acceptance (the metric)

1. **`src/lib/videoReference.test.ts` passes unchanged.** If a test looks
   wrong, say so in the PR. Don't edit it to pass.
2. **`npm run check` green.** PR #5's tests stay green after the rebase.
3. **New e2e `tests/e2e/send-take.spec.ts`:**
   - Intercept `/api/generate` with `page.route` and count the calls.
   - Load a tiny MP4 fixture: generate one, or commit one of ≤200 KB.
   - Assert the preview shows the video and a cost like `$0.xx`.
   - Assert **zero** `/api/generate` calls before Confirm.
   - Assert exactly one call after Confirm, whose JSON body contains a
     `video_url` reference.
   - No page errors.
4. **9:16 check (e2e or unit):** with the lock on, a Capture photo PNG's
   width/height ratio is 9/16 ± 1%.
5. **CI green on the PR:** `check`, `e2e`, `eval`.
6. **No regressions:**
   - Studio text-to-video and first-frame image-to-video still send the same
     request shape as before;
   - Record clip and Record take still work;
   - the camera-view e2e passes, if you can run it.

## Guardrails

- **No paid API calls**, ever. No key in cloud; mock `/api/generate` in tests.
- Don't touch `evals/fixtures/` (real actor photos), `.data/` or the CI eval job.
- No new dependencies. Focused diff. Comments explain *why*.
- Push to this PR's branch `seedance-video-reference`. Don't merge.

## Known limits (accept them, don't try to solve)

- **Data URLs for video and audio may be rejected** by OpenRouter. Keep the
  reference URL construction in one place, so a hosted-URL upload can be
  swapped in later. Note it in the PR.
- **Real-face rejection** by Seedance is possible. Not your problem: surface
  the API error message clearly in the UI.
- **WebM-only browsers** get the conversion notice. That's it.

## Done = report in the PR description

- Each acceptance item with pass/fail.
- CI run link.
- A screenshot of the preview step, if the browser runs.
- Anything not verified.
- Decisions you made that this doc didn't cover.
