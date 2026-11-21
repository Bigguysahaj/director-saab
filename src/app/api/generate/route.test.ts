// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter", () => ({
  isConfigured: () => Boolean(process.env.OPENROUTER_API_KEY),
  createVideoJob: vi.fn(async () => ({ id: "job-1", polling_url: "x", status: "pending" })),
}));

import { createVideoJob } from "@/lib/openrouter";
import { readTake } from "@/lib/takeLog";
import type { GenerateRequest } from "@/lib/types";
import { POST } from "./route";

let root: string;
const b64 = (s: string) => Buffer.from(s).toString("base64");

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-generate-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
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

  it("does not start a paid job without a model and a non-blank prompt", async () => {
    for (const payload of [
      { prompt: "a dog" },
      { model: "", prompt: "a dog" },
      { model: "m", prompt: "   " },
      { model: "m" },
    ]) {
      expect((await post(payload)).status).toBe(400);
    }
    expect(createVideoJob).not.toHaveBeenCalled();
  });

  it("returns 501 and does not call OpenRouter when the key is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const res = await post({ model: "m", prompt: "a dog" });
    expect(res.status).toBe(501);
    expect((await res.json()).error).toContain("OPENROUTER_API_KEY");
    expect(createVideoJob).not.toHaveBeenCalled();
  });

  it("returns 502 when the provider rejects the job and does not log a take", async () => {
    vi.mocked(createVideoJob).mockRejectedValueOnce(new Error("OpenRouter create video job failed (402)"));
    const res = await post({ model: "m", prompt: "a dog" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("402");
    await expect(readTake("job-1")).rejects.toThrow();
  });

  it("hides a non-Error provider failure behind a generic 502", async () => {
    vi.mocked(createVideoJob).mockRejectedValueOnce("nope");
    const res = await post({ model: "m", prompt: "a dog" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Generation request failed" });
  });

  it("logs an unknown project as none and still accepts the paid job", async () => {
    const res = await post({
      model: "m",
      prompt: "  a dog  ",
      project: "no-such-project",
      stage: { objects: [] },
    });
    expect(res.status).toBe(202);
    expect(vi.mocked(createVideoJob).mock.calls[0][0]).toEqual({ model: "m", prompt: "  a dog  " });
    expect(await readTake("job-1")).toMatchObject({ project: null, prompt: "  a dog  ", stage: "stage.json" });
  });
});
