// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listScreenTests, readScreenTestFile, saveScreenTest, toClientScreenTest } from "./screenTestStore";

let root: string;
const png = (t: string) => `data:image/png;base64,${Buffer.from(t).toString("base64")}`;
const jpg = (t: string) => `data:image/jpeg;base64,${Buffer.from(t).toString("base64")}`;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "director-screen-test-"));
  vi.stubEnv("DIRECTOR_DATA_DIR", root);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("screenTestStore history", () => {
  it("keeps every result, newest first, with its prompt, model, inputs and cost", async () => {
    await saveScreenTest(png("one"), 0.034, { prompt: "make it night", model: "a/model", inputs: { kind: "edit", cast: [], image: true } });
    await saveScreenTest(jpg("two"), 0.018, { prompt: "Ana and Ben", model: "b/model", inputs: { kind: "cast", cast: ["Ana", "Ben"], image: false } });
    const list = await listScreenTests();
    expect(list.map((e) => e.prompt)).toEqual(["Ana and Ben", "make it night"]);
    expect(list[0]).toMatchObject({ model: "b/model", cost: 0.018, inputs: { kind: "cast", cast: ["Ana", "Ben"], image: false } });
    expect(list[0].file).not.toBe(list[1].file);
    expect((await readScreenTestFile(list[0].file)).toString()).toBe("two");
    expect((await readScreenTestFile(list[1].file)).toString()).toBe("one");
    expect(toClientScreenTest(list[0]).image).toBe(`/api/screen-test/file/${list[0].file}`);
  });

  it("shows an old single latest result as a history entry", async () => {
    const dir = path.join(root, "screen-test");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "latest.png"), "old");
    await writeFile(path.join(dir, "latest.json"), JSON.stringify({ file: "latest.png", cost: 0.034, createdAt: 1 }));
    await saveScreenTest(png("new"), 0.018, { prompt: "p", model: "m", inputs: { kind: "edit", cast: [], image: true } });
    const list = await listScreenTests();
    expect(list).toHaveLength(2);
    expect(list[0].prompt).toBe("p");
    expect(list[1]).toMatchObject({ file: "latest.png", prompt: "", inputs: { kind: "stage" } });
    expect((await readScreenTestFile("latest.png")).toString()).toBe("old");
  });
});
