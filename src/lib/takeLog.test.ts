// @vitest-environment node
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logSubmittedTake, readTake, recordTakeResult, setKept } from "./takeLog";
import type { GenerateRequest } from "./types";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-takes-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

const b64 = (s: string) => Buffer.from(s).toString("base64");
const takeDir = (id: string) => path.join(root, "takes", id);

const request: GenerateRequest = {
  model: "bytedance/seedance-2.0-mini",
  prompt: "Use @Video1 for camera motion and blocking.",
  duration: 5,
  resolution: "480p",
  aspect_ratio: "9:16",
  generate_audio: true,
  input_references: [
    { type: "video_url", video_url: { url: `data:video/mp4;base64,${b64("mp4-bytes")}` } },
    { type: "image_url", image_url: { url: `data:image/png;base64,${b64("png-bytes")}` } },
    { type: "audio_url", audio_url: { url: `data:audio/mpeg;base64,${b64("mp3-bytes")}` } },
  ],
};

const stage = { schema: "director-stage-scene/v1", objects: [{ id: 1, kind: "box", position: [0, 0, 0], rotation: [0, 0, 0] }] };

describe("takeLog", () => {
  it("records which project the take was sent from", async () => {
    await logSubmittedTake({ id: "job-p", request, project: "gini-first-vid" });
    expect((await readTake("job-p")).project).toBe("gini-first-vid");
  });

  it("logs a submitted take with settings, pending status and media as files", async () => {
    await logSubmittedTake({ id: "job-1", request });

    const take = await readTake("job-1");
    expect(take).toMatchObject({
      id: "job-1",
      model: request.model,
      prompt: request.prompt,
      settings: { duration: 5, resolution: "480p", aspect_ratio: "9:16", generate_audio: true },
      status: "pending",
      kept: null,
      output: null,
    });
    expect(typeof take.createdAt).toBe("number");

    const files = await readdir(takeDir("job-1"));
    const refFiles = take.references.map((r: { file: string }) => r.file);
    expect(take.references.map((r: { type: string }) => r.type)).toEqual(["video_url", "image_url", "audio_url"]);
    for (const f of refFiles) expect(files).toContain(f);
    expect((await readFile(path.join(takeDir("job-1"), refFiles[0]))).toString()).toBe("mp4-bytes");

    const raw = await readFile(path.join(takeDir("job-1"), "take.json"), "utf-8");
    expect(raw).not.toContain("base64");
  });

  it("saves the stage spec when given, and null when not", async () => {
    await logSubmittedTake({ id: "job-stage", request, stage });
    expect((await readTake("job-stage")).stage).toBe("stage.json");
    expect(JSON.parse(await readFile(path.join(takeDir("job-stage"), "stage.json"), "utf-8"))).toEqual(stage);

    await logSubmittedTake({ id: "job-plain", request: { model: "m", prompt: "a dog" } });
    expect((await readTake("job-plain")).stage).toBeNull();
  });

  it("records completion with cost and saves the output only once", async () => {
    await logSubmittedTake({ id: "job-done", request });
    const fetchOutput = vi.fn(async () => new Response("video-out"));

    await recordTakeResult("job-done", { status: "completed", cost: 0.21 }, fetchOutput);
    await recordTakeResult("job-done", { status: "completed", cost: 0.21 }, fetchOutput);

    expect(fetchOutput).toHaveBeenCalledTimes(1);
    const take = await readTake("job-done");
    expect(take).toMatchObject({ status: "completed", cost: 0.21 });
    expect((await readFile(path.join(takeDir("job-done"), take.output!))).toString()).toBe("video-out");
  });

  it("downloads once when two completed polls arrive together", async () => {
    await logSubmittedTake({ id: "job-race", request });
    // Slow download, so both polls are past the "file exists?" check before it lands.
    const fetchOutput = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return new Response("video-out");
    });

    await Promise.all([
      recordTakeResult("job-race", { status: "completed" }, fetchOutput),
      recordTakeResult("job-race", { status: "completed" }, fetchOutput),
    ]);

    expect(fetchOutput).toHaveBeenCalledTimes(1);
    const output = (await readTake("job-race")).output!;
    expect((await readFile(path.join(takeDir("job-race"), output))).toString()).toBe("video-out");
    // Written via a temp file; nothing half-written is left behind.
    expect((await readdir(takeDir("job-race"))).filter((f) => f.includes("tmp"))).toEqual([]);
  });

  it("leaves no output after a failed download, and the next poll retries", async () => {
    await logSubmittedTake({ id: "job-retry", request });
    const broken = vi.fn(async () => {
      throw new Error("network");
    });

    const before = await readdir(takeDir("job-retry"));
    await expect(recordTakeResult("job-retry", { status: "completed" }, broken)).rejects.toThrow("network");
    expect(await readdir(takeDir("job-retry"))).toEqual(before);

    await recordTakeResult("job-retry", { status: "completed" }, async () => new Response("video-out"));
    expect((await readTake("job-retry")).output).toMatch(/\.mp4$/);
  });

  it("records a failed take with its error and no output", async () => {
    await logSubmittedTake({ id: "job-fail", request });
    const fetchOutput = vi.fn();

    await recordTakeResult("job-fail", { status: "failed", error: "content policy" }, fetchOutput);

    expect(fetchOutput).not.toHaveBeenCalled();
    expect(await readTake("job-fail")).toMatchObject({ status: "failed", error: "content policy", output: null });
    expect(await readdir(takeDir("job-fail"))).not.toContain("output.mp4");
  });

  it("persists kept / discarded and throws for an unknown take", async () => {
    await logSubmittedTake({ id: "job-keep", request });
    await setKept("job-keep", true);
    expect((await readTake("job-keep")).kept).toBe(true);
    await setKept("job-keep", false);
    expect((await readTake("job-keep")).kept).toBe(false);

    await expect(setKept("nope", true)).rejects.toThrow();
  });

  it("rejects ids that could escape the takes folder", async () => {
    await expect(logSubmittedTake({ id: "../evil", request })).rejects.toThrow();
  });

  describe("video names", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("numbers takes per project", async () => {
      await logSubmittedTake({ id: "g1", request, project: "gini-first-vid" });
      await logSubmittedTake({ id: "d1", request, project: "default" });
      await logSubmittedTake({ id: "g2", request, project: "gini-first-vid" });

      expect((await readTake("g1")).takeNumber).toBe(1);
      expect((await readTake("g2")).takeNumber).toBe(2);
      expect((await readTake("d1")).takeNumber).toBe(1);
    });

    it("names the video <project>_take-<NN>_<YYYYMMDD-HHMM>.mp4", async () => {
      // Only Date is faked; local time, so the name matches the user's clock.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 9, 9, 14, 32));
      await logSubmittedTake({ id: "g1", request, project: "gini-first-vid" });
      await logSubmittedTake({ id: "g2", request, project: "gini-first-vid" });

      await recordTakeResult("g2", { status: "completed" }, async () => new Response("video-out"));

      const name = "gini-first-vid_take-02_20261009-1432.mp4";
      expect((await readTake("g2")).output).toBe(name);
      expect((await readFile(path.join(takeDir("g2"), name))).toString()).toBe("video-out");
    });

    it("keeps takes saved before naming working as output.mp4", async () => {
      await logSubmittedTake({ id: "old", request });
      // A record from before take numbers existed, its video already saved.
      const record = JSON.parse(await readFile(path.join(takeDir("old"), "take.json"), "utf-8"));
      delete record.takeNumber;
      await writeFile(path.join(takeDir("old"), "take.json"), JSON.stringify({ ...record, status: "completed", output: "output.mp4" }));
      await writeFile(path.join(takeDir("old"), "output.mp4"), "old-video");
      const fetchOutput = vi.fn(async () => new Response("new-video"));

      await recordTakeResult("old", { status: "completed" }, fetchOutput);

      expect(fetchOutput).not.toHaveBeenCalled();
      expect((await readTake("old")).output).toBe("output.mp4");
    });
  });
});
