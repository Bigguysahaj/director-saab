// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createMember, deleteMember, readMemberFile, readRoster, toClientMember, updateMember } from "./castStore";
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

describe("castStore photo replacement", () => {
  const jpg = (text: string) => `data:image/jpeg;base64,${Buffer.from(text).toString("base64")}`;

  it("drops shots from the old photo, and a new extension removes the old file", async () => {
    const { activeId } = await listProjects();
    const member = await createMember(activeId, "Ana");
    const first = await updateMember(activeId, member.id, {
      photoDataUrl: png("face-v1"),
      shots: { front: { image: png("shot"), cost: 0.2, model: "m" } },
    });
    expect((await readMemberFile(activeId, member.id, first.shots.front.file)).toString()).toBe("shot");

    const replaced = await updateMember(activeId, member.id, { photoDataUrl: png("face-v2") });
    expect(replaced.photo).toBe("photo.png");
    expect(replaced.shots).toEqual({});
    expect((await readMemberFile(activeId, member.id, "photo.png")).toString()).toBe("face-v2");
    await expect(readMemberFile(activeId, member.id, "front.png")).rejects.toThrow();

    const jpeg = await updateMember(activeId, member.id, { photoDataUrl: jpg("face-v3") });
    expect(jpeg.photo).toBe("photo.jpg");
    expect((await readMemberFile(activeId, member.id, "photo.jpg")).toString()).toBe("face-v3");
    await expect(readMemberFile(activeId, member.id, "photo.png")).rejects.toThrow();
  });

  it("rejects a photo that is not a data URL and leaves the shots on disk", async () => {
    const { activeId } = await listProjects();
    const member = await createMember(activeId, "Ana");
    await updateMember(activeId, member.id, {
      photoDataUrl: png("face"),
      shots: { front: { image: png("shot"), cost: 0.2 } },
    });

    await expect(updateMember(activeId, member.id, { photoDataUrl: "https://example.com/a.png" })).rejects.toThrow(/data URL/i);

    const [saved] = await readRoster(activeId);
    expect(saved.photo).toBe("photo.png");
    expect((await readMemberFile(activeId, member.id, saved.shots.front.file)).toString()).toBe("shot");
  });
});

describe("castStore delete", () => {
  it("removes one member's files and leaves the rest of the cast", async () => {
    const { activeId } = await listProjects();
    const ana = await createMember(activeId, "Ana");
    const ben = await createMember(activeId, "Ben");
    await updateMember(activeId, ana.id, { photoDataUrl: png("ana") });
    const benSaved = await updateMember(activeId, ben.id, { photoDataUrl: png("ben") });

    await deleteMember(activeId, ana.id);

    expect((await readRoster(activeId)).map((m) => m.id)).toEqual([ben.id]);
    expect((await readMemberFile(activeId, ben.id, benSaved.photo!)).toString()).toBe("ben");
    await expect(readMemberFile(activeId, ana.id, "photo.png")).rejects.toThrow();
  });
});

