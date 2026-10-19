// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { publishDataReferences } from "./mediaReference";

let root: string;
const BASE = "https://director.example.ngrok.app";

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-media-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
  vi.stubEnv("PUBLIC_MEDIA_BASE_URL", BASE);
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
    const stored = await readFile(path.join(root, "media", url.split("/").pop()!));
    expect(stored.equals(bytes)).toBe(true);
  });

  it("leaves https references untouched", async () => {
    const url = "https://cdn.example.com/clip.mp4";
    const out = await publishDataReferences(req(url));
    expect(out.input_references).toEqual([{ type: "video_url", video_url: { url } }]);
  });
});
