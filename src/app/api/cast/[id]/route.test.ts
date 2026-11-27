// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "./route";
import { createMember, readRoster, updateMember } from "@/lib/castStore";
import { createProject, listProjects, projectDir } from "@/lib/projectStore";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-cast-transfer-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

function post(id: string, body: string) {
  return POST(new Request(`http://localhost/api/cast/${id}?project=default`, { method: "POST", body }), {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/cast/[id] transfer", () => {
  it("rejects a body that is not JSON and does not move anyone", async () => {
    await listProjects();
    const member = await createMember("default", "Asha");
    const res = await post(member.id, "{");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request body" });
    expect(await readRoster("default")).toHaveLength(1);
  });

  it("returns 404 for a missing member and leaves the destination empty", async () => {
    await listProjects();
    const target = await createProject("Target");
    const res = await post("cast-missing", JSON.stringify({ targetProjectId: target.id, mode: "move" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/not found/);
    expect(await readRoster(target.id)).toEqual([]);
  });

  it("hides a failed copy behind 500 and does not remove the source", async () => {
    await listProjects();
    const target = await createProject("Target");
    const member = await createMember("default", "Asha");
    await updateMember("default", member.id, { photoDataUrl: "data:image/png;base64,cGhvdG8=" });
    await rm(path.join(projectDir("default"), "cast", member.id, "photo.png"));

    const res = await post(member.id, JSON.stringify({ targetProjectId: target.id, mode: "move" }));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Transfer failed" });
    expect(JSON.stringify(body)).not.toContain(root);
    expect((await readRoster("default")).map((m) => m.id)).toEqual([member.id]);
    expect(await readRoster(target.id)).toEqual([]);
  });
});
