// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter", () => ({
  isConfigured: () => true,
  createVideoJob: vi.fn(async () => ({ id: "job-1", polling_url: "x", status: "pending" })),
}));

import { createVideoJob } from "@/lib/openrouter";
import type { GenerateRequest } from "@/lib/types";
import { POST } from "./route";

let root: string;
const b64 = (s: string) => Buffer.from(s).toString("base64");

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-generate-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const body: GenerateRequest = {
  model: "bytedance/seedance-2.0-mini",
  prompt: "Use @Video1.",
  input_references: [
    { type: "video_url", video_url: { url: `data:video/mp4;base64,${b64("mp4")}` } },
    { type: "image_url", image_url: { url: `data:image/png;base64,${b64("png")}` } },
    { type: "audio_url", audio_url: { url: `data:audio/mpeg;base64,${b64("mp3")}` } },
    { type: "image_url", image_url: { url: "https://cdn.example.com/a.png" } },
  ],
};
const post = (b: unknown) =>
  POST(new Request("http://localhost/api/generate", { method: "POST", body: JSON.stringify(b) }));

describe("POST /api/generate", () => {
  it("returns a clear error when PUBLIC_MEDIA_BASE_URL is unset and a data URL is present", async () => {
    vi.stubEnv("PUBLIC_MEDIA_BASE_URL", "");
    const res = await post(body);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await res.json()).error).toContain("PUBLIC_MEDIA_BASE_URL");
    expect(createVideoJob).not.toHaveBeenCalled();
  });

  it("sends only https references to OpenRouter", async () => {
    vi.stubEnv("PUBLIC_MEDIA_BASE_URL", "https://director.example.ngrok.app");
    const res = await post(body);
    expect(res.status).toBe(202);
    const sent = vi.mocked(createVideoJob).mock.calls[0][0];
    const urls = sent.input_references!.map((r) =>
      r.type === "video_url" ? r.video_url.url : r.type === "audio_url" ? r.audio_url.url : r.image_url.url
    );
    expect(urls).toHaveLength(4);
    for (const url of urls) expect(url.startsWith("https://")).toBe(true);
  });
});
