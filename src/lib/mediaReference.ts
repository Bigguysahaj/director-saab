import "server-only";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { dataRoot } from "./projectStore";
import { mediaStore, PROJECT_RE } from "./mediaStore";
export { MediaConfigError } from "./mediaStore";
import type { GenerateRequest, InputReference } from "./types";

/**
 * OpenRouter only takes https reference URLs, so data: URLs from the browser
 * go to R2 when R2_* are set, else .data/media/ served from
 * /api/media/<project>/<file> at PUBLIC_MEDIA_BASE_URL (see README).
 * shortcut: files are never cleaned up automatically; manual deletion is
 * tracked in ENG-027 (issue #52, storage page).
 */

export const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};
const EXT_BY_MIME: Record<string, string> = {
  ...Object.fromEntries(Object.entries(MIME_BY_EXT).map(([ext, mime]) => [mime, ext])),
  "audio/mp3": "mp3",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
};

export const MEDIA_FILE_RE = /^[0-9a-f-]{36}\.[a-z0-9]+$/;
const DATA_URL_RE = /^data:([^;,]+)?(?:;[^,]*)?;base64,([\s\S]*)$/;

function mediaDir(): string {
  return path.join(dataRoot(), "media");
}

async function publish(url: string, project: string, store: ReturnType<typeof mediaStore>): Promise<string> {
  const match = DATA_URL_RE.exec(url);
  if (!match) return url;
  const [, mime = "application/octet-stream", data] = match;
  const filename = `${randomUUID()}.${EXT_BY_MIME[mime.toLowerCase()] ?? "bin"}`;
  const stored = await store.put(project, filename, Buffer.from(data, "base64"), mime);
  return stored.url;
}

function urlOf(ref: InputReference): string {
  return ref.type === "video_url" ? ref.video_url.url : ref.type === "audio_url" ? ref.audio_url.url : ref.image_url.url;
}

/** A copy of the request with every data: reference swapped for an https URL. */
export async function publishDataReferences(request: GenerateRequest, project?: string | null): Promise<GenerateRequest> {
  const refs = request.input_references ?? [];
  const frames = request.frame_images ?? [];
  const hasData = [...refs.map(urlOf), ...frames.map((f) => f.image_url.url)].some((u) => u.startsWith("data:"));
  if (!hasData) return request;

  const store = mediaStore();

  const input_references = await Promise.all(
    refs.map(async (ref): Promise<InputReference> => {
      const url = await publish(urlOf(ref), project ?? "untitled", store);
      return ref.type === "video_url"
        ? { type: ref.type, video_url: { url } }
        : ref.type === "audio_url"
          ? { type: ref.type, audio_url: { url } }
          : { type: ref.type, image_url: { url } };
    })
  );
  const frame_images = await Promise.all(
    frames.map(async (f) => ({ ...f, image_url: { url: await publish(f.image_url.url, project ?? "untitled", store) } }))
  );
  return {
    ...request,
    ...(request.input_references && { input_references }),
    ...(request.frame_images && { frame_images }),
  };
}

export async function readMediaFile(project: string, filename: string): Promise<Buffer> {
  if (!PROJECT_RE.test(project)) throw new Error(`Invalid media project: ${project}`);
  if (!MEDIA_FILE_RE.test(filename)) throw new Error(`Invalid media file: ${filename}`);
  return readFile(path.join(mediaDir(), project, filename));
}
