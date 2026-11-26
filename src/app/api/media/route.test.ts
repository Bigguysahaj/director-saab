// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { publishDataReferences } from "@/lib/mediaReference";
import { GET } from "./[project]/[filename]/route";

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
  GET(new Request(`http://localhost/api/media/untitled/${filename}`), { params: Promise.resolve({ project: "untitled", filename }) });

describe("GET /api/media/[project]/[filename]", () => {
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

  it("serves a file only for its own project, with a public cache header", async () => {
    const bytes = Buffer.from("proj-a-bytes");
    const url = `data:image/png;base64,${bytes.toString("base64")}`;
    const out = await publishDataReferences(
      { model: "m", prompt: "p", input_references: [{ type: "image_url", image_url: { url } }] },
      "proj-a",
    );
    const filename = out.input_references![0].type === "image_url"
      ? out.input_references[0].image_url.url.split("/").pop()!
      : "";

    const served = await GET(new Request("http://localhost/api/media/proj-a/x"), {
      params: Promise.resolve({ project: "proj-a", filename }),
    });
    expect(served.status).toBe(200);
    expect(served.headers.get("Cache-Control")).toBe("public, max-age=86400, immutable");
    expect(Buffer.from(await served.arrayBuffer()).equals(bytes)).toBe(true);

    const other = await GET(new Request("http://localhost/api/media/proj-b/x"), {
      params: Promise.resolve({ project: "proj-b", filename }),
    });
    expect(other.status).toBe(404);
    expect(Buffer.from(await other.arrayBuffer()).equals(bytes)).toBe(false);

    for (const project of ["..", "Proj", "a/b"]) {
      const blocked = await GET(new Request("http://localhost/api/media/x"), {
        params: Promise.resolve({ project, filename }),
      });
      expect(blocked.status, project).toBe(400);
      expect(Buffer.from(await blocked.arrayBuffer()).equals(bytes)).toBe(false);
    }
  });
});
