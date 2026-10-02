# Director

A minimal, cinematic front end for AI video generation over [OpenRouter's video API](https://openrouter.ai/docs/guides/overview/multimodal/video-generation) — Seedance 2.5 first, but the model picker is driven live from OpenRouter's `/api/v1/videos/models` catalog, so anything else OpenRouter adds there (Veo, Hailuo, Wan, Grok Imagine, ...) shows up automatically.

## Setup

```bash
npm install
cp .env.local.example .env.local
# then put your key in .env.local
npm run dev
```

Get a key at https://openrouter.ai/settings/keys and set it as `OPENROUTER_API_KEY` in `.env.local`. The key is only ever read server-side (in route handlers under `src/app/api/`) — it's never sent to the browser.

Without a key, the app still runs in **demo mode**: the model picker shows a static fallback catalog so you can see the UI, but calling Action returns a clear "not configured" error instead of generating.

## How it's wired

- `src/lib/openrouter.ts` — server-only client for OpenRouter's video endpoints (create job, poll job, fetch rendered content).
- `src/app/api/models` — proxies the live model catalog (falls back to `src/lib/models.ts` if no key is set or the call fails).
- `src/app/api/generate` — submits a job (`POST /api/v1/videos`).
- `src/app/api/generate/[id]` — polls job status.
- `src/app/api/generate/[id]/content` — streams the finished video back through the server, since OpenRouter's content endpoint needs the same `Authorization` header as the rest of the API (it can't be linked to directly from the browser).
- `src/components/Studio.tsx` — the page: prompt, model/duration/resolution/aspect-ratio controls, the viewer, and the "Dailies" history strip (persisted to `localStorage`, per-browser).

## Notes

- Generation history lives in the browser's `localStorage`, not a database — clearing site data clears your Dailies reel.
- Image-to-video (reference frame) support is wired for any model whose catalog entry reports `supported_frame_images`; it sends a single first-frame reference. Multi-reference / video / audio reference inputs (`input_references`) aren't exposed in the UI yet.

## Stage poses and tests

`/stage` includes 14 static poses and a reusable pose library. Select a mannequin,
enter **Pose**, and use the library to apply or save a pose. Assign a cast member
to save poses for that character. **Export saved** backs up the browser library;
**Import pack** adds compatible pose packs. Saved poses are local to this browser.

Use Node.js 22. Install dependencies with `npm ci`, then run:

```bash
npm run check       # TypeScript, ESLint, unit and component tests
npm run test:watch  # Vitest during development
npx playwright install chromium
npm run test:e2e    # Starts a dedicated stage server on port 3100
```

The browser tests need a machine with Chromium's system dependencies; Linux CI
uses `npx playwright install --with-deps chromium`. An existing browser can be
selected through `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. If Next.js is already running,
set `PLAYWRIGHT_BASE_URL=http://localhost:3000` to reuse it (Next.js locks a project
to one development server). Tests still use isolated browser storage. Failed browser traces are saved
in `test-results/`. The GitHub Actions workflow runs the checks and browser tests.

See [posing architecture and roadmap](docs/architecture/posing.md) for the pose
pack format, code boundaries, test scope, and future character demeanor and
text/voice control design. Those AI and animation features are not implemented.

Paused work: [pose library handoff, 2026-09-25](docs/handoffs/2026-09-25-pose-library.md)
records implementation status and the remaining browser verification.
