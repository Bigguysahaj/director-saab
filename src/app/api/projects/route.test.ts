// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET as getProjects, POST as postProject } from "./route";
import { GET as getCast, POST as postCast } from "../cast/route";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-api-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

function json(url: string, body: unknown) {
  return new Request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("/api/projects", () => {
  it("lists projects and creates one, rejecting bad names", async () => {
    const created = await postProject(json("http://x/api/projects", { name: "Gini-first-vid" }));
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ id: "gini-first-vid", name: "Gini-first-vid" });

    const list = await (await getProjects()).json();
    expect(list.projects.map((p: { name: string }) => p.name)).toEqual(["Default", "Gini-first-vid"]);
    expect(list.activeId).toBe("gini-first-vid");

    expect((await postProject(json("http://x/api/projects", { name: "" }))).status).toBe(400);
    expect((await postProject(json("http://x/api/projects", { name: "Gini-first-vid" }))).status).toBe(400);
  });
});

describe("/api/cast?project=", () => {
  it("reads and writes the named project's roster, 404 for an unknown project", async () => {
    await postProject(json("http://x/api/projects", { name: "Gini-first-vid" }));

    const made = await postCast(json("http://x/api/cast?project=gini-first-vid", { name: "Gini" }));
    expect(made.status).toBe(200);

    const gini = await (await getCast(new Request("http://x/api/cast?project=gini-first-vid"))).json();
    expect(gini.map((m: { name: string }) => m.name)).toEqual(["Gini"]);
    const def = await (await getCast(new Request("http://x/api/cast?project=default"))).json();
    expect(def).toEqual([]);

    expect((await getCast(new Request("http://x/api/cast?project=nope"))).status).toBe(404);
    expect((await postCast(json("http://x/api/cast?project=nope", { name: "X" }))).status).toBe(404);
  });
});
