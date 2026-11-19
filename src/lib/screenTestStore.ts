import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseDataUrl } from "./dataUrl";
import { dataRoot } from "./projectStore";
import { writeJson } from "./writeJson";

/**
 * Screen Test history on disk under <data>/screen-test/ (gitignored): one
 * image file per result plus history.json listing them. Input images aren't
 * kept, only a description of what made each result. A result saved before
 * history existed (latest.json + latest.<ext>) shows up as the oldest entry.
 */

export type ScreenTestInputs = { kind: "edit" | "cast" | "stage"; cast: string[]; image: boolean };
export type ScreenTestMeta = { prompt: string; model: string; inputs: ScreenTestInputs };
export type ScreenTestEntry = ScreenTestMeta & { id: string; file: string; cost: number | null; createdAt: number };

const dir = () => path.join(dataRoot(), "screen-test");
const historyPath = () => path.join(dir(), "history.json");

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf-8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function readHistory(): Promise<ScreenTestEntry[]> {
  return (await readJson<ScreenTestEntry[]>(historyPath())) ?? [];
}

/** Newest first. */
export async function listScreenTests(): Promise<ScreenTestEntry[]> {
  const history = await readHistory();
  const legacy = await readJson<{ file: string; cost: number; createdAt: number }>(path.join(dir(), "latest.json"));
  if (legacy) {
    history.push({ ...legacy, id: "latest", prompt: "", model: "", inputs: { kind: "stage", cast: [], image: true } });
  }
  return history.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveScreenTest(imageDataUrl: string, cost: number | null, meta: ScreenTestMeta): Promise<ScreenTestEntry> {
  const parsed = parseDataUrl(imageDataUrl, "jpg");
  if (!parsed) throw new Error("Not a base64 data URL");
  const { buffer, ext } = parsed;
  await mkdir(dir(), { recursive: true });
  const id = `st-${randomUUID()}`;
  const entry: ScreenTestEntry = { ...meta, id, file: `${id}.${ext}`, cost, createdAt: Date.now() };
  await writeFile(path.join(dir(), entry.file), buffer);
  await writeJson(historyPath(), [...(await readHistory()), entry]);
  return entry;
}

export async function readScreenTestFile(filename: string): Promise<Buffer> {
  return readFile(path.join(dir(), filename));
}

export function toClientScreenTest(e: ScreenTestEntry) {
  return { id: e.id, image: `/api/screen-test/file/${e.file}`, cost: e.cost, createdAt: e.createdAt, prompt: e.prompt, model: e.model, inputs: e.inputs };
}
