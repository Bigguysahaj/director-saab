// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createMember, readRoster, toClientMember, updateMember } from "./castStore";
import { listProjects, projectDir } from "./projectStore";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-cast-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("castStore shot model", () => {
  it("saves and loads a shot's model, and loads old rosters without one", async () => {
    const { activeId } = await listProjects();
    const member = await createMember(activeId, "Ana");
    const model = "bytedance-seed/seedream-5-0-flash";
    await updateMember(activeId, member.id, {
      shots: { front: { image: "data:image/png;base64,eA==", cost: 0.002, model } },
    });
    const [saved] = await readRoster(activeId);
    expect(saved.shots.front.model).toBe(model);
    expect(toClientMember(activeId, saved).shots.front.model).toBe(model);

    const dir = path.join(projectDir(activeId), "cast");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "roster.json"), JSON.stringify([
      { id: "old", name: "Old", photo: null, shots: { front: { file: "front.png", cost: 0.004 } } },
    ]));
    const [old] = await readRoster(activeId);
    expect(toClientMember(activeId, old).shots.front.model).toBeUndefined();
  });
});
