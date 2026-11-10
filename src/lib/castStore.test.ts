// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createMember, readMemberFile, readRoster, toClientMember, updateMember } from "./castStore";
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

const png = (text: string) => `data:image/png;base64,${Buffer.from(text).toString("base64")}`;

describe("castStore candidate sheets", () => {
  async function sheetMember() {
    const { activeId } = await listProjects();
    const member = await createMember(activeId, "Ana");
    await updateMember(activeId, member.id, { sheetDataUrl: png("main") });
    return { projectId: activeId, id: member.id };
  }

  it("adds, promotes and deletes candidates", async () => {
    const { projectId, id } = await sheetMember();
    await updateMember(projectId, id, { addCandidateDataUrl: png("c1") });
    let m = await updateMember(projectId, id, { addCandidateDataUrl: png("c2") });
    expect(m.candidates).toHaveLength(2);
    expect(new Set(m.candidates).size).toBe(2);
    for (const f of m.candidates!) expect((await readMemberFile(projectId, id, f)).length).toBeGreaterThan(0);

    const [first, second] = m.candidates!;
    m = await updateMember(projectId, id, { promoteCandidate: first });
    expect((await readMemberFile(projectId, id, m.sheet!)).toString()).toBe("c1");
    expect(m.candidates).toHaveLength(2);
    const demoted = m.candidates!.find((f) => f !== second)!;
    expect((await readMemberFile(projectId, id, demoted)).toString()).toBe("main");

    m = await updateMember(projectId, id, { deleteCandidate: second });
    expect(m.candidates).toEqual([demoted]);
    await expect(readMemberFile(projectId, id, second)).rejects.toThrow();

    await expect(updateMember(projectId, id, { deleteCandidate: "candidate-missing.png" })).rejects.toThrow();
    await expect(updateMember(projectId, id, { promoteCandidate: "../x" })).rejects.toThrow();
  });

  it("loads old rosters with no candidates and maps candidates to URLs", async () => {
    const { activeId } = await listProjects();
    const dir = path.join(projectDir(activeId), "cast");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "roster.json"), JSON.stringify([
      { id: "old", name: "Old", photo: null, shots: {}, sheet: "sheet.png" },
    ]));
    const [old] = await readRoster(activeId);
    expect(toClientMember(activeId, old).candidates).toEqual([]);

    const { projectId, id } = await sheetMember();
    const m = await updateMember(projectId, id, { addCandidateDataUrl: png("c1") });
    expect(toClientMember(projectId, m).candidates).toEqual([
      expect.stringMatching(new RegExp(`^/api/cast/${id}/file/candidate-[^/]+\\?project=${projectId}$`)),
    ]);
  });

  it("Replace main keeps the old sheet as a candidate", async () => {
    const { projectId, id } = await sheetMember();
    const m = await updateMember(projectId, id, { sheetDataUrl: png("new") });
    expect((await readMemberFile(projectId, id, m.sheet!)).toString()).toBe("new");
    expect(m.candidates).toHaveLength(1);
    expect((await readMemberFile(projectId, id, m.candidates![0])).toString()).toBe("main");
  });
});

