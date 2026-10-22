// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { fetchR2 } = vi.hoisted(() => ({ fetchR2: vi.fn() }));
vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch(url: string, init: RequestInit = {}) {
      return fetchR2(String(url), init.method ?? "GET", new Headers(init.headers), init.body);
    }
  },
}));

import { MediaConfigError, publishDataReferences } from "./mediaReference";
import type { GenerateRequest } from "./types";

let root: string;
const BASE = "https://director.example.ngrok.app";
const R2 = {
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "access",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "references",
  R2_PUBLIC_BASE_URL: "https://media.example.com",
};

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-media-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
  vi.stubEnv("PUBLIC_MEDIA_BASE_URL", BASE);
  for (const name of Object.keys(R2)) vi.stubEnv(name, "");
  fetchR2.mockReset();
  fetchR2.mockImplementation(async () => new Response(null));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const req = (url: string) => ({
  model: "m",
  prompt: "p",
  input_references: [{ type: "video_url" as const, video_url: { url } }],
});

describe("publishDataReferences", () => {
  it("rewrites a data:video/mp4 reference to a PUBLIC_MEDIA_BASE_URL https URL", async () => {
    const bytes = Buffer.from("mp4-bytes");
    const out = await publishDataReferences(req(`data:video/mp4;base64,${bytes.toString("base64")}`));
    const ref = out.input_references![0];
    const url = ref.type === "video_url" ? ref.video_url.url : "";
    expect(url.startsWith(`${BASE}/`)).toBe(true);
    expect(url.endsWith(".mp4")).toBe(true);
    const stored = await readFile(path.join(root, "media", new URL(url).pathname.replace("/api/media/", "")));
    expect(stored.equals(bytes)).toBe(true);
  });

  it("leaves https references untouched", async () => {
    const url = "https://cdn.example.com/clip.mp4";
    const out = await publishDataReferences(req(url));
    expect(out.input_references).toEqual([{ type: "video_url", video_url: { url } }]);
  });

  it("publishes all data references and frame images to R2 without a tunnel", async () => {
    for (const [name, value] of Object.entries(R2)) vi.stubEnv(name, value);
    vi.stubEnv("PUBLIC_MEDIA_BASE_URL", undefined);
    const data = (mime: string, value: string) => `data:${mime};base64,${Buffer.from(value).toString("base64")}`;
    const request: GenerateRequest = {
      model: "m", prompt: "p",
      input_references: [
        { type: "video_url", video_url: { url: data("video/mp4", "video") } },
        { type: "image_url", image_url: { url: data("image/png", "image") } },
        { type: "audio_url", audio_url: { url: data("audio/mpeg", "audio") } },
      ],
      frame_images: [
        { type: "image_url", frame_type: "first_frame", image_url: { url: data("image/png", "first") } },
        { type: "image_url", frame_type: "last_frame", image_url: { url: data("image/png", "last") } },
      ],
    };
    const out = await publishDataReferences(request, "proj");
    const urls = [
      ...out.input_references!.map((ref) => ref.type === "video_url" ? ref.video_url.url : ref.type === "audio_url" ? ref.audio_url.url : ref.image_url.url),
      ...out.frame_images!.map((frame) => frame.image_url.url),
    ];
    expect(urls).toHaveLength(5);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/media\.example\.com\/proj\/[0-9a-f-]{36}\.(mp4|png|mp3)$/);
    }
    expect(fetchR2).toHaveBeenCalledTimes(5);
    const uploads = fetchR2.mock.calls.map(([url, method, headers, body]) => {
      expect(method).toBe("PUT");
      const key = url.replace("https://account.r2.cloudflarestorage.com/references/", "");
      expect(urls).toContain(`${R2.R2_PUBLIC_BASE_URL}/${key}`);
      return [headers.get("Content-Type"), Buffer.from(body).toString()];
    });
    expect(uploads.sort()).toEqual([
      ["video/mp4", "video"], ["image/png", "image"], ["audio/mpeg", "audio"],
      ["image/png", "first"], ["image/png", "last"],
    ].sort());
  });

  it("throws MediaConfigError mentioning R2 when no public https storage is configured", async () => {
    for (const base of [undefined, "http://localhost:3000"]) {
      vi.stubEnv("PUBLIC_MEDIA_BASE_URL", base);
      const publish = () => publishDataReferences(req("data:video/mp4;base64,bXA0"));
      await expect(publish()).rejects.toBeInstanceOf(MediaConfigError);
      await expect(publish()).rejects.toThrow(/PUBLIC_MEDIA_BASE_URL/);
      await expect(publish()).rejects.toThrow(/R2/);
    }
  });
});
