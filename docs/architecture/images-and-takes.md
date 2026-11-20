# Images, voice lines, and take logs

Status: implemented. Checked against source on 2026-11-20.

This is the path from a cast photo or a recorded stage take to a paid image
or video call, and what is kept on disk afterwards. Video job polling itself
still lives in `src/lib/openrouter.ts`. Pose keyframes are in
[posing](posing.md).

## Image providers

`src/lib/imageProvider.ts` is the switch for every paid image route.

- A model id that starts with `modelark/` uses BytePlus ModelArk
  (`src/lib/modelark.ts`) and requires `ARK_API_KEY`.
- Any other id uses OpenRouter image generation and requires
  `OPENROUTER_API_KEY`.
- A missing key returns **501** with the variable name in the error. The
  other provider's key is not a substitute.

ModelArk calls `POST https://ark.ap-southeast.bytepluses.com/api/v3/images/generations`
with the id after the `modelark/` prefix, `response_format: b64_json`,
`watermark: false`, and `size: "2K"`. Only `image_url` references are
accepted; they are sent as the `image` array. The returned media type is
`image/jpeg`. Unknown model ids throw before the request. Prices are the
table in `modelark.ts`; Seedream 5.0 Pro is billed higher when a returned
image is over 2.6 megapixels. Callers that do not get a provider cost fall
back to `IMAGE_PRICE_PER_CALL` in `src/lib/imageModels.ts`.

`GET /api/image-models` feeds the DoP picker. It keeps OpenRouter models
whose input modalities include `image` and whose `input_references` max is
at least 2, then appends the ModelArk list when `ARK_API_KEY` is set.
Without a key, or when the live catalog is empty or unreachable, the route
returns `FALLBACK_IMAGE_MODELS` and `live: false`. The default model is
`google/gemini-3.1-flash-lite-image`.

## Image routes

| Route | Body | Result |
| --- | --- | --- |
| `POST /api/character-sheet` | `photo` data URL, optional `model` | One 9-shot grid. The browser crops it (`src/lib/characterSheet.ts`). |
| `POST /api/image-edit` | `image` data URL, `prompt`, optional `model` | One edit. The server wraps the prompt so layout and identity stay, and the user's text is the change. |
| `POST /api/screen-test` | See modes below. | One image, appended to `.data/screen-test/history.json`. |
| `GET /api/screen-test` | — | Screen Test history, newest first. |

Screen Test is three modes, chosen by which fields are set:

- **edit** — `image` plus `prompt`, no cast. Reference image 1 is the picture to change.
- **cast** — `cast` entries (`name`, `images`), a `prompt`, and an optional scene `image`. The scene image, when present, is reference image 1.
- **stage** — `stagePhoto` plus cast entries that also have `colorLabel`. `prompt` is optional and is appended as `DIRECTOR'S NOTE`. Reference image 1 is the stage photo. `buildScreenTestPrompt` treats mannequin blocking as fixed: one person per mannequin, no invented contact. That prompt exists because an early test merged two mannequins into one couple.

`image` and `stagePhoto` together are rejected. A stage photo with no cast is rejected. Anything except a stage photo requires a prompt. Each cast entry needs a name and at least one image. The server does not know the live catalog's reference cap; the client checks it before sending.

Screen Test history is one folder for the app, not per project. Input images are not stored, only the result file and a short description (`kind`, cast names, whether a scene image was sent).

On Audition, a generated sheet stays the member's main sheet. Each edit is saved as another candidate (`src/lib/castStore.ts`). Send take and Screen Test do not tick candidates by default.

## Send take

`SendTake` is shown for video models with `supports_video_reference`
(`Studio.tsx`). On a live catalog, `normalizeModel` uses an explicit
reference-type list when the catalog has one. Otherwise Seedance 2.x ids
(`bytedance/seedance-2…`) and exactly `minimax/hailuo-3` count; `hailuo-3-max`
does not. The no-key fallback catalog marks Hailuo 3 as not video-capable, so
Send take hides it until a live catalog loads.

Nothing is submitted until **Confirm & generate**. Preview builds the same
request and shows a cost when the model has both token rates and the
resolution maps to a pixel size (`estimateVideoCost` in
`src/lib/videoReference.ts`). Tokens are `width × height × 24 × (output
seconds + reference-video seconds) / 1024`, billed at the video-input rate
when a reference video is present.

`buildInputReferences` is the limit check:

- Video: MP4 or MOV, 2–15 seconds. WebM is rejected. One video.
- Images: at most 9.
- Audio: MP3 or WAV, more than 0 and at most 15 seconds, and only when a
  video or an image is also attached.

Prompt hints use `@Video1`, `@Image1`, `@Audio1` in that reference order.
Cast images come first, then uploads, so the first ticked cast image is
`@Image1`. The upload control caps extra files at 3 (`MAX_CHARACTER_IMAGES`);
the 9-image ceiling still applies to cast images plus uploads together.

**Which cast images are ticked.** `castImageOptions` sends, by default, the
sheet and close-up when a sheet exists, or else the front shot or the photo.
Candidates start unticked. Any image can be unticked. **Use cast sheet**
drops the cast images and leaves uploads. The cast menu only lists members
who already have a sheet.

**Voice line.** **Generate voice line** loads `GET /api/tts/voices` and
submits `POST /api/tts` with `{ text, voiceId }`. The server calls ElevenLabs
`eleven_v3` and returns `audio/mpeg`. Text must be non-empty and at most 500
characters. Missing `ELEVENLABS_API_KEY` is **503**; a provider failure is
**502**. The MP3 is handed back as a file named `voice-line.mp3` and then
follows the same audio rules as an upload. Without the key, upload an MP3 or
WAV instead.

`POST /api/generate` still requires `OPENROUTER_API_KEY` (**501** without
it). `stage` and `project` are logged and are not forwarded. `data:`
references are swapped for public https URLs (`publishDataReferences`)
before `createVideoJob`. An unknown project id is logged as no project, and
its media is stored under `untitled/`. The job is already paid for when
logging runs: a log failure is printed and the route still returns **202**.

## What is stored

`DIRECTOR_DATA_DIR` overrides the root (default `.data`, gitignored). Read
it per call via `dataRoot()` so tests can point at a scratch directory.

| Path | Contents |
| --- | --- |
| `projects/projects.json` | Project list and the active project. The active id is server-side, so `/`, `/stage`, and `/audition` share it. |
| `projects/<id>/cast/` | That project's roster, photos, sheet, and candidates. |
| `media/<project>/<uuid>.<ext>` | Local reference files published for OpenRouter. R2 uses the same key layout in the bucket. |
| `takes/<jobId>/` | `take.json`, reference files, optional `stage.json`, and the output video once the job completes. |
| `screen-test/` | Screen Test history. Not removed when a project is deleted. |

Dailies (`src/lib/history.ts`) are a separate browser reel: `localStorage`,
per project, 60 takes. Clearing site data clears Dailies and leaves the take
log.

`logSubmittedTake` stores the browser's `data:` bytes in the take folder.
The provider receives the published https URLs, not those files. Output is
written from `GET /api/generate/[id]` after the poll response, under
`<project>_take-<NN>_<YYYYMMDD-HHMM>.mp4` (local time). Once that file is on
disk, a later poll does not download it again. Takes logged before numbering
keep `output.mp4`. A missing take record on poll is ignored.

Deleting a project calls `mediaStore().deleteAll` first. If that throws
(including a partial `R2_*` config), the project is left in place and the
delete can be retried. Then take folders whose `take.json` `project` matches
are removed; a missing or broken `take.json` is skipped. The project
directory goes last. Deleting the final project recreates **Default**.
Reference files are public to anyone with the URL. Nothing else deletes
them; `untitled/` media is not tied to a project delete.

## Pitfalls

- Set all five `R2_*` variables or none. A partial set throws
  `MediaConfigError` on publish and blocks project delete.
- Local media needs an https `PUBLIC_MEDIA_BASE_URL` (an ngrok tunnel in
  dev). OpenRouter does not accept `data:` or plain `http` reference URLs.
- Restart `npm run dev` after changing env vars.
- ModelArk size is fixed at `2K` in `generateImage`. A picker resolution
  does not change that request.
- Screen Test's server prompt does not consult the live model list. A model
  that accepts fewer references than the client sent fails at the provider.
- Pose edits and voice generation are different systems. Joint keyframes do
  not call a model; voice lines do not change the stage.
