// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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

const png = (text: string) => `data:image/png;base64,${Buffer.from(text).toString("base64")}`;

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

  it("does not replace a corrupt roster with a new member", async () => {
    const { activeId } = await listProjects();
    const file = path.join(projectDir(activeId), "cast", "roster.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{");

    await expect(createMember(activeId, "Ana")).rejects.toThrow(SyntaxError);
    expect(await readFile(file, "utf8")).toBe("{");
  });

  it("rejects a shot id that is not one safe filename", async () => {
    const { activeId } = await listProjects();
    const member = await createMember(activeId, "Ana");
    const rosterFile = path.join(projectDir(activeId), "cast", "roster.json");
    const before = await readFile(rosterFile, "utf8");
    const outside = path.join(projectDir(activeId), "escape.png");

    for (const shotId of ["../escape", "a/b", "..", ".hidden"]) {
      await expect(updateMember(activeId, member.id, {
        shots: { [shotId]: { image: png("shot"), cost: 1 } },
      })).rejects.toThrow(/invalid filename/i);
    }

    expect(await readFile(rosterFile, "utf8")).toBe(before);
    await expect(stat(outside)).rejects.toThrow();
  });
});

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

  it("keeps the current sheet when a replacement is not a data URL", async () => {
    const { projectId, id } = await sheetMember();
    await expect(updateMember(projectId, id, { sheetDataUrl: "https://example.com/sheet.png" })).rejects.toThrow(/data URL/i);
    const [member] = await readRoster(projectId);
    expect((await readMemberFile(projectId, id, member.sheet!)).toString()).toBe("main");
    expect(member.candidates ?? []).toEqual([]);
  });

  it("Replace main keeps the old sheet as a candidate", async () => {
    const { projectId, id } = await sheetMember();
    const m = await updateMember(projectId, id, { sheetDataUrl: png("new") });
    expect((await readMemberFile(projectId, id, m.sheet!)).toString()).toBe("new");
    expect(m.candidates).toHaveLength(1);
    expect((await readMemberFile(projectId, id, m.candidates![0])).toString()).toBe("main");
  });
});

