// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pending = vi.hoisted(() => ({ tasks: [] as Array<() => unknown> }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after(task: () => unknown) {
      pending.tasks.push(task);
    },
  };
});
vi.mock("server-only", () => ({}));
const openrouter = vi.hoisted(() => ({ pollVideoJob: vi.fn(), fetchVideoContent: vi.fn() }));
vi.mock("@/lib/openrouter", () => openrouter);

import { GET } from "./route";
import { logSubmittedTake, readTake } from "@/lib/takeLog";
import type { GenerationStatus } from "@/lib/types";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-poll-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
  pending.tasks = [];
  openrouter.pollVideoJob.mockReset();
  openrouter.fetchVideoContent.mockReset();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const get = (id: string) =>
  GET(new Request(`http://localhost/api/generate/${id}`), { params: Promise.resolve({ id }) });

async function flushAfter() {
  const tasks = pending.tasks.splice(0);
  for (const task of tasks) await task();
}

async function log(id: string) {
  await logSubmittedTake({ id, request: { model: "m", prompt: "a take" } });
}

describe("GET /api/generate/[id]", () => {
  it("returns a completed poll before the output download, then logs the video once", async () => {
    await log("job-1");
    let downloaded = false;
    openrouter.pollVideoJob.mockResolvedValue({ id: "job-1", status: "completed", usage: { cost: 0.42 } });
    openrouter.fetchVideoContent.mockImplementation(async () => {
      downloaded = true;
      return new Response(Uint8Array.from([1, 2, 3]));
    });

    const res = await get("job-1");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "job-1", status: "completed", usage: { cost: 0.42 } });
    expect(downloaded).toBe(false);
    expect((await readTake("job-1")).status).toBe("pending");
    expect(openrouter.pollVideoJob).toHaveBeenCalledWith("job-1");

    await flushAfter();

    expect(downloaded).toBe(true);
    expect(openrouter.fetchVideoContent).toHaveBeenCalledTimes(1);
    expect(openrouter.fetchVideoContent).toHaveBeenCalledWith("job-1", 0);
    const take = await readTake("job-1");
    expect(take).toMatchObject({ status: "completed", cost: 0.42, error: null });
    expect(await readFile(path.join(root, "takes", "job-1", take.output!))).toEqual(Buffer.from([1, 2, 3]));
  });

  it.each(["failed", "cancelled", "expired"] as const)(
    "records a %s poll without downloading video",
    async (status: GenerationStatus) => {
      const id = `job-${status}`;
      await log(id);
      openrouter.pollVideoJob.mockResolvedValue({ id, status, error: "provider stopped" });

      const res = await get(id);
      expect(res.status).toBe(200);
      expect(openrouter.fetchVideoContent).not.toHaveBeenCalled();
      await flushAfter();

      expect(await readTake(id)).toMatchObject({ status, error: "provider stopped", output: null });
      expect(openrouter.fetchVideoContent).not.toHaveBeenCalled();
    },
  );

  it("does not log an in-progress poll", async () => {
    await log("job-1");
    openrouter.pollVideoJob.mockResolvedValue({ id: "job-1", status: "in_progress" });

    const res = await get("job-1");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "in_progress" });
    expect(pending.tasks).toEqual([]);
    expect((await readTake("job-1")).status).toBe("pending");
    expect(openrouter.fetchVideoContent).not.toHaveBeenCalled();
  });

  it("returns 502 when the poll fails and does not log", async () => {
    await log("job-1");
    openrouter.pollVideoJob.mockRejectedValue(new Error("OpenRouter poll video job failed (500)"));

    const res = await get("job-1");

    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("OpenRouter poll video job failed (500)");
    expect(pending.tasks).toEqual([]);
    expect((await readTake("job-1")).status).toBe("pending");
  });

  it("still returns the poll when the take was never logged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    openrouter.pollVideoJob.mockResolvedValue({ id: "job-missing", status: "completed", usage: { cost: 0.1 } });

    const res = await get("job-missing");

    expect(res.status).toBe(200);
    await flushAfter();
    expect(error).not.toHaveBeenCalled();
    expect(openrouter.fetchVideoContent).not.toHaveBeenCalled();
  });

  it("keeps the poll response when the output download fails, and leaves the take retryable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await log("job-1");
    openrouter.pollVideoJob.mockResolvedValue({ id: "job-1", status: "completed" });
    openrouter.fetchVideoContent.mockRejectedValue(new Error("download failed"));

    const res = await get("job-1");
    expect(res.status).toBe(200);
    await flushAfter();

    expect(error).toHaveBeenCalledWith(expect.stringContaining("job-1"), expect.any(Error));
    expect((await readTake("job-1")).status).toBe("pending");
    expect((await readTake("job-1")).output).toBeNull();
  });
});
