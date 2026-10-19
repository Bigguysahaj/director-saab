// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { publishDataReferences } from "@/lib/mediaReference";
import { GET } from "./[filename]/route";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-media-api-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
  vi.stubEnv("PUBLIC_MEDIA_BASE_URL", "https://director.example.ngrok.app");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const get = (filename: string) =>
  GET(new Request(`http://localhost/api/media/${filename}`), { params: Promise.resolve({ filename }) });

describe("GET /api/media/[filename]", () => {
  it.each([
    ["video/mp4", "video_url"],
    ["image/png", "image_url"],
    ["audio/mpeg", "audio_url"],
  ] as const)("serves a stored file with its content type (%s)", async (mime, type) => {
    const bytes = Buffer.from(`bytes-${mime}`);
    const url = `data:${mime};base64,${bytes.toString("base64")}`;
    const ref = { type, [type]: { url } } as never;
    const out = await publishDataReferences({ model: "m", prompt: "p", input_references: [ref] });
    const r = out.input_references![0] as unknown as Record<string, { url: string }>;
    const filename = r[type].url.split("/").pop()!;

    const res = await get(filename);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(mime);
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
  });

  it("rejects path traversal", async () => {
    expect((await get("..%2Fprojects.json")).status).toBe(400);
  });
});
