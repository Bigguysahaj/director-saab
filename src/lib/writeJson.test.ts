// @vitest-environment node
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { writeJson } from "./writeJson";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "director-write-json-"));
  dirs.push(dir);
  return dir;
}

describe("writeJson", () => {
  it("replaces a record and leaves no temp file", async () => {
    const dir = await scratch();
    const file = path.join(dir, "roster.json");
    await writeJson(file, { a: 1 });
    await writeJson(file, { b: [2] });

    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ b: [2] });
    expect((await readdir(dir)).filter((name) => name.includes(".tmp"))).toEqual([]);
  });

  it("keeps the previous record when the replacement cannot be renamed into place", async () => {
    const dir = await scratch();
    const file = path.join(dir, "roster.json");
    await writeJson(file, { ok: true });
    await rm(file);
    await mkdir(file);
    await writeFile(path.join(file, "child"), "keep");

    await expect(writeJson(file, { ok: false })).rejects.toThrow();

    expect(await readFile(path.join(file, "child"), "utf8")).toBe("keep");
    expect((await readdir(dir)).filter((name) => name.includes(".tmp"))).toEqual([]);
  });
});
