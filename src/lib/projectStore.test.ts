// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createProject, listProjects } from "./projectStore";
import { createMember, readMemberFile, readRoster } from "./castStore";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-projects-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("projectStore", () => {
  it("starts with a single Default project when nothing is on disk", async () => {
    const { projects, activeId } = await listProjects();
    expect(projects.map((p) => p.name)).toEqual(["Default"]);
    expect(activeId).toBe(projects[0].id);
  });

  it("moves an existing .data/cast roster into Default unchanged", async () => {
    const legacy = path.join(root, "cast");
    const member = { id: "cast-1-1", name: "Asha", photo: "photo.png", shots: {}, stageColor: null };
    await mkdir(path.join(legacy, member.id), { recursive: true });
    await writeFile(path.join(legacy, "roster.json"), JSON.stringify([member]));
    await writeFile(path.join(legacy, member.id, "photo.png"), "png-bytes");

    const { projects } = await listProjects();
    const def = projects.find((p) => p.name === "Default")!;

    expect(await readRoster(def.id)).toEqual([member]);
    expect((await readMemberFile(def.id, member.id, "photo.png")).toString()).toBe("png-bytes");
    // Listing again must not migrate twice or lose anything.
    await listProjects();
    expect(await readRoster(def.id)).toEqual([member]);
    await expect(stat(path.join(legacy, "roster.json"))).rejects.toThrow();
  });

  it("creates Gini-first-vid, lists it and makes it active", async () => {
    const project = await createProject("Gini-first-vid");
    expect(project).toMatchObject({ id: "gini-first-vid", name: "Gini-first-vid" });

    const { projects, activeId } = await listProjects();
    expect(projects.map((p) => p.name)).toEqual(["Default", "Gini-first-vid"]);
    expect(activeId).toBe("gini-first-vid");
    const saved = JSON.parse(await readFile(path.join(root, "projects", "projects.json"), "utf-8"));
    expect(saved.activeId).toBe("gini-first-vid");
  });

  it("rejects empty and duplicate names", async () => {
    await expect(createProject("   ")).rejects.toThrow(/name/i);
    await createProject("Gini-first-vid");
    await expect(createProject("gini-first-vid")).rejects.toThrow(/already/i);
    await expect(createProject("Default")).rejects.toThrow(/already/i);
  });

  it("keeps each project's cast separate", async () => {
    const { activeId: defaultId } = await listProjects();
    const gini = await createProject("Gini-first-vid");
    await createMember(gini.id, "Gini");

    expect((await readRoster(gini.id)).map((m) => m.name)).toEqual(["Gini"]);
    expect(await readRoster(defaultId)).toEqual([]);
  });

  it("does not replace a corrupt projects file with a new Default", async () => {
    const file = path.join(root, "projects", "projects.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{");

    await expect(listProjects()).rejects.toThrow(SyntaxError);
    expect(await readFile(file, "utf8")).toBe("{");
  });

  it("leaves a legacy roster in place when Default already has a cast folder", async () => {
    const legacy = path.join(root, "cast");
    const target = path.join(root, "projects", "default", "cast");
    await mkdir(path.join(legacy, "cast-1"), { recursive: true });
    await writeFile(path.join(legacy, "roster.json"), JSON.stringify([{ id: "cast-1", name: "Legacy", photo: null, shots: {} }]));
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "roster.json"), JSON.stringify([{ id: "cast-2", name: "Kept", photo: null, shots: {} }]));

    const { projects } = await listProjects();
    expect(await readRoster(projects[0].id)).toEqual([{ id: "cast-2", name: "Kept", photo: null, shots: {} }]);
    expect(JSON.parse(await readFile(path.join(legacy, "roster.json"), "utf8"))).toEqual([
      { id: "cast-1", name: "Legacy", photo: null, shots: {} },
    ]);
  });

  it("refuses ids that would escape the project folder", async () => {
    const { activeId } = await listProjects();
    await expect(readRoster("../cast")).rejects.toThrow(/invalid/i);
    await expect(readRoster("a/b")).rejects.toThrow(/invalid/i);
    await expect(readMemberFile(activeId, "../x", "photo.png")).rejects.toThrow(/invalid/i);
    await expect(readMemberFile(activeId, "cast-1-1", "../../projects.json")).rejects.toThrow(/invalid/i);
  });
});
