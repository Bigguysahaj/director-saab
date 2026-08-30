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
