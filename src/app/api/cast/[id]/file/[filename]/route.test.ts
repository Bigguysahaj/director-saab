// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "./route";
import { createMember, readRoster, updateMember } from "@/lib/castStore";
import { listProjects, projectDir } from "@/lib/projectStore";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-cast-file-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const get = (id: string, filename: string, project?: string) =>
  GET(new Request(`http://localhost/api/cast/${id}/file/${filename}${project ? `?project=${project}` : ""}`), {
    params: Promise.resolve({ id, filename }),
  });

describe("GET /api/cast/[id]/file/[filename]", () => {
  it("serves a member photo and does not serve a path outside that folder", async () => {
    const { activeId } = await listProjects();
    const member = await createMember(activeId, "Ana");
    await updateMember(activeId, member.id, { photoDataUrl: "data:image/png;base64,cGhvdG8=" });
    const filename = (await readRoster(activeId))[0].photo!;
    const outside = path.join(projectDir(activeId), "secret.txt");
    await writeFile(outside, "do-not-serve");

    const res = await get(member.id, filename);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("photo");

    for (const filename of ["../secret.txt", "a/b.png"]) {
      const blocked = await get(member.id, filename);
      expect(blocked.status).toBe(400);
      expect(await blocked.text()).not.toContain("do-not-serve");
    }

    const escapedId = await get("..", "secret.txt");
    expect(escapedId.status).toBe(404);
    expect(await escapedId.text()).not.toContain("do-not-serve");

    expect((await get(member.id, "missing.png")).status).toBe(404);
    expect((await get(member.id, filename, "no-such-project")).status).toBe(404);
  });
});
