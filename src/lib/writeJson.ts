import "server-only";
import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

/** Readers see either the previous record or the complete replacement. */
export async function writeJson(filename: string, value: unknown): Promise<void> {
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2));
    await rename(temporary, filename);
  } finally {
    await rm(temporary, { force: true });
  }
}
