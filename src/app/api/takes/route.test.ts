// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter", () => ({
  isConfigured: () => true,
  createVideoJob: vi.fn(async () => ({ id: "job-1", polling_url: "x", status: "pending" })),
}));

import { createVideoJob } from "@/lib/openrouter";
import * as takeLog from "@/lib/takeLog";
import { createProject, setActiveProject } from "@/lib/projectStore";
import { POST as generate } from "../generate/route";
import { PATCH as patchTake } from "./[id]/route";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-takes-api-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

function req(url: string, method: string, body: unknown) {
  return new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const stage = { schema: "director-stage-scene/v1", objects: [] };

describe("/api/generate take logging", () => {
  it("sends the request to OpenRouter without the stage field and logs the take", async () => {
    const res = await generate(req("http://x/api/generate", "POST", { model: "m", prompt: "a dog", stage }));

    expect(res.status).toBe(202);
    expect(vi.mocked(createVideoJob).mock.calls[0][0]).toEqual({ model: "m", prompt: "a dog" });
    const take = await takeLog.readTake("job-1");
    expect(take).toMatchObject({ id: "job-1", prompt: "a dog", stage: "stage.json" });
  });

  it("logs the project the take was sent from, without sending it to OpenRouter", async () => {
    await createProject("Gini-first-vid");
    await setActiveProject("default");

    await generate(req("http://x/api/generate", "POST", { model: "m", prompt: "a dog", project: "gini-first-vid" }));

    expect(vi.mocked(createVideoJob).mock.calls[0][0]).toEqual({ model: "m", prompt: "a dog" });
    expect((await takeLog.readTake("job-1")).project).toBe("gini-first-vid");
  });

  it("falls back to the active project when none is named", async () => {
    await createProject("Gini-first-vid");

    await generate(req("http://x/api/generate", "POST", { model: "m", prompt: "a dog" }));

    expect((await takeLog.readTake("job-1")).project).toBe("gini-first-vid");
  });

  it("still returns 202 when the log write fails", async () => {
    // A plain file where the data folder should be makes every write fail.
    const blocker = path.join(root, "blocker");
    await writeFile(blocker, "");
    vi.stubEnv("DIRECTOR_DATA_DIR", blocker);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await generate(req("http://x/api/generate", "POST", { model: "m", prompt: "a dog" }));

    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ id: "job-1" });
  });
});

describe("PATCH /api/takes/[id]", () => {
  it("sets kept, and 404s for an unknown take", async () => {
    await takeLog.logSubmittedTake({ id: "job-9", request: { model: "m", prompt: "p" } });

    const ok = await patchTake(req("http://x/api/takes/job-9", "PATCH", { kept: true }), params("job-9"));
    expect(ok.status).toBe(200);
    expect((await takeLog.readTake("job-9")).kept).toBe(true);

    const missing = await patchTake(req("http://x/api/takes/nope", "PATCH", { kept: true }), params("nope"));
    expect(missing.status).toBe(404);

    const bad = await patchTake(req("http://x/api/takes/job-9", "PATCH", { kept: "yes" }), params("job-9"));
    expect(bad.status).toBe(400);
  });
});
