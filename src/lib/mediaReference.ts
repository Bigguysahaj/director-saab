import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataRoot } from "./projectStore";
import type { GenerateRequest, InputReference } from "./types";

/**
 * OpenRouter only takes https reference URLs, so data: URLs from the browser
 * are stored under .data/media/ and served from /api/media/<file> at
 * PUBLIC_MEDIA_BASE_URL (an ngrok tunnel in dev; see README).
 * shortcut: files are never cleaned up, add a sweep once storage matters.
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

export class MediaConfigError extends Error {}

async function publish(url: string, base: string): Promise<string> {
  const match = DATA_URL_RE.exec(url);
  if (!match) return url;
  const [, mime = "", data] = match;
  const filename = `${randomUUID()}.${EXT_BY_MIME[mime.toLowerCase()] ?? "bin"}`;
  await mkdir(mediaDir(), { recursive: true });
  await writeFile(path.join(mediaDir(), filename), Buffer.from(data, "base64"));
  return `${base}/api/media/${filename}`;
}

function urlOf(ref: InputReference): string {
  return ref.type === "video_url" ? ref.video_url.url : ref.type === "audio_url" ? ref.audio_url.url : ref.image_url.url;
}

/** A copy of the request with every data: reference swapped for an https URL. */
export async function publishDataReferences(request: GenerateRequest): Promise<GenerateRequest> {
  const refs = request.input_references ?? [];
  const frames = request.frame_images ?? [];
  const hasData = [...refs.map(urlOf), ...frames.map((f) => f.image_url.url)].some((u) => u.startsWith("data:"));
  if (!hasData) return request;

  const base = (process.env.PUBLIC_MEDIA_BASE_URL ?? "").replace(/\/+$/, "");
  if (!base.startsWith("https://")) {
    throw new MediaConfigError(
      "PUBLIC_MEDIA_BASE_URL must be set to a public https URL (e.g. an ngrok tunnel) to send reference media; OpenRouter only accepts https URLs."
    );
  }

  const input_references = await Promise.all(
    refs.map(async (ref): Promise<InputReference> => {
      const url = await publish(urlOf(ref), base);
      return ref.type === "video_url"
        ? { type: ref.type, video_url: { url } }
        : ref.type === "audio_url"
          ? { type: ref.type, audio_url: { url } }
          : { type: ref.type, image_url: { url } };
    })
  );
  const frame_images = await Promise.all(
    frames.map(async (f) => ({ ...f, image_url: { url: await publish(f.image_url.url, base) } }))
  );
  return {
    ...request,
    ...(request.input_references && { input_references }),
    ...(request.frame_images && { frame_images }),
  };
}

export async function readMediaFile(filename: string): Promise<Buffer> {
  if (!MEDIA_FILE_RE.test(filename)) throw new Error(`Invalid media file: ${filename}`);
  return readFile(path.join(mediaDir(), filename));
}
