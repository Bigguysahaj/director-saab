import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Persists the single latest Screen Test composite to disk under
 * .data/screen-test/ (gitignored, same convention as src/lib/castStore.ts)
 * — v1 keeps only the most recent result, not a history, matching how the
 * character-sheet feature started simple (see character-sheet-feature
 * memory). A later pass can turn this into a list if past screen tests turn
 * out to be worth keeping around.
 */

export type ScreenTestMeta = { file: string; cost: number; createdAt: number };

const DATA_DIR = path.join(process.cwd(), ".data", "screen-test");
const META_PATH = path.join(DATA_DIR, "latest.json");

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function parseDataUrl(dataUrl: string): { buffer: Buffer; ext: string } {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new Error("Not a base64 data URL");
  const [, mime, base64] = match;
  return { buffer: Buffer.from(base64, "base64"), ext: EXT_BY_MIME[mime] ?? "jpg" };
}

export async function readLatestScreenTest(): Promise<ScreenTestMeta | null> {
  try {
    const raw = await readFile(META_PATH, "utf-8");
    return JSON.parse(raw) as ScreenTestMeta;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function saveScreenTest(imageDataUrl: string, cost: number): Promise<ScreenTestMeta> {
  const previous = await readLatestScreenTest();
  const { buffer, ext } = parseDataUrl(imageDataUrl);
  await mkdir(DATA_DIR, { recursive: true });
  const filename = `latest.${ext}`;
  await writeFile(path.join(DATA_DIR, filename), buffer);
  // A re-generation with a different extension writes a new filename rather
  // than overwriting the old one — clean up the stale file, same reasoning
  // as castStore's photo replacement.
  if (previous && previous.file !== filename) {
    await rm(path.join(DATA_DIR, previous.file), { force: true });
  }
  const meta: ScreenTestMeta = { file: filename, cost, createdAt: Date.now() };
  await writeFile(META_PATH, JSON.stringify(meta, null, 2));
  return meta;
}

export async function readScreenTestFile(filename: string): Promise<Buffer> {
  return readFile(path.join(DATA_DIR, filename));
}

export function toClientScreenTest(m: ScreenTestMeta) {
  return { image: `/api/screen-test/file/${m.file}`, cost: m.cost, createdAt: m.createdAt };
}
