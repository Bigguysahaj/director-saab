import "server-only";
import { mkdir, readdir, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { dataRoot } from "./projectStore";

export class MediaConfigError extends Error {}

export const PROJECT_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAME_RE = /^[0-9a-f-]{36}\.[a-z0-9]+$/;

function validateProject(project: string): void {
  if (!PROJECT_RE.test(project)) throw new Error(`Invalid media project: ${project}`);
}

function validateKey(key: string): void {
  const [project, name, extra] = key.split("/");
  validateProject(project);
  if (!name || !NAME_RE.test(name) || extra !== undefined) throw new Error(`Invalid media key: ${key}`);
}

function httpsBase(value: string, message: string): string {
  const base = value.replace(/\/+$/, "");
  try {
    if (new URL(base).protocol === "https:") return base;
  } catch {}
  throw new MediaConfigError(message);
}

export function mediaStore() {
  const names = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"] as const;
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0 && missing.length < names.length) {
    throw new MediaConfigError(`Missing R2 configuration: ${missing.join(", ")}`);
  }
  const r2 = missing.length === 0;
  const base = r2 ? httpsBase(process.env.R2_PUBLIC_BASE_URL!, "R2_PUBLIC_BASE_URL must be a public https URL.") : "";
  const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}`;
  const client = r2 ? new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  }) : null;
  const dir = path.join(dataRoot(), "media");

  async function fetchR2(op: string, url: string, init: RequestInit): Promise<Response> {
    const res = await client!.fetch(url, init);
    if (!res.ok) throw new Error(`R2 ${op} failed (${res.status}): ${await res.text()}`);
    return res;
  }

  const store = {
    async put(project: string, name: string, bytes: Buffer | Uint8Array, mime: string): Promise<{ key: string; url: string }> {
      validateProject(project);
      if (!NAME_RE.test(name)) throw new Error(`Invalid media name: ${name}`);
      const key = `${project}/${name}`;
      if (r2) {
        // aws4fetch re-wraps the body as a stream, so without an explicit length the
        // upload goes chunked and R2 rejects it (411 MissingContentLength).
        await fetchR2("put", `${endpoint}/${key}`, {
          method: "PUT", body: new Uint8Array(bytes),
          headers: { "Content-Type": mime, "Content-Length": String(bytes.byteLength) },
        });
        return { key, url: `${base}/${key}` };
      }
      const localBase = httpsBase(process.env.PUBLIC_MEDIA_BASE_URL ?? "",
        "PUBLIC_MEDIA_BASE_URL must be a public https URL, or configure R2_* storage, to send reference media; OpenRouter only accepts https URLs.");
      await mkdir(path.join(dir, project), { recursive: true });
      await writeFile(path.join(dir, key), bytes);
      return { key, url: `${localBase}/api/media/${key}` };
    },
    async list(project: string): Promise<string[]> {
      validateProject(project);
      if (!r2) {
        const entries = await readdir(path.join(dir, project)).catch((err: NodeJS.ErrnoException) => {
          if (err.code === "ENOENT") return [];
          throw err;
        });
        return entries.filter((name) => NAME_RE.test(name)).map((name) => `${project}/${name}`);
      }
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const url = new URL(endpoint);
        url.searchParams.set("list-type", "2");
        url.searchParams.set("prefix", `${project}/`);
        if (token) url.searchParams.set("continuation-token", token);
        const xml = await (await fetchR2("list", url.toString(), { method: "GET" })).text();
        for (const match of xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)) {
          if (!match[1].startsWith(`${project}/`)) continue;
          try {
            validateKey(match[1]);
          } catch {
            continue;
          }
          keys.push(match[1]);
        }
        token = undefined;
        if (/<IsTruncated>\s*true\s*<\/IsTruncated>/.test(xml)) {
          token = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1]
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
          if (!token) throw new Error("R2 list missing continuation token");
        }
      } while (token);
      return keys;
    },
    async delete(key: string): Promise<void> {
      validateKey(key);
      if (r2) {
        await fetchR2("delete", `${endpoint}/${key}`, { method: "DELETE" });
      } else {
        await unlink(path.join(dir, key)).catch((err: NodeJS.ErrnoException) => {
          if (err.code !== "ENOENT") throw err;
        });
      }
    },
    async deleteAll(project: string): Promise<void> {
      validateProject(project);
      if (r2) {
        for (const key of await store.list(project)) await store.delete(key);
      } else {
        await rm(path.join(dir, project), { recursive: true, force: true });
      }
    },
  };
  return store;
}
