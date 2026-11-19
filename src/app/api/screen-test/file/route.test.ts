// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { saveScreenTest } from "@/lib/screenTestStore";
import { GET } from "./[filename]/route";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-screen-test-file-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const get = (filename: string) =>
  GET(new Request("http://localhost/api/screen-test/file/x"), { params: Promise.resolve({ filename }) });

describe("GET /api/screen-test/file/[filename]", () => {
  it("serves a saved screen test with its image type", async () => {
    const png = `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`;
    const entry = await saveScreenTest(png, 0.03, {
      prompt: "night",
      model: "m",
      inputs: { kind: "edit", cast: [], image: true },
    });

    const res = await get(entry.file);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("png-bytes");
  });

  it("rejects filenames that escape the screen-test directory", async () => {
    await writeFile(path.join(root, "secret.txt"), "secret-bytes");

    for (const filename of ["../secret.txt", "foo/../../secret.txt", ".."]) {
      const res = await get(filename);
      expect(res.status, filename).toBe(400);
      expect(await res.text()).not.toContain("secret-bytes");
    }
  });
});
