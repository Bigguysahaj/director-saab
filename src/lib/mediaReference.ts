import "server-only";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDataUrl } from "./dataUrl";
import { MEDIA_FILE_RE, mediaDir, mediaStore, PROJECT_RE } from "./mediaStore";
export { MediaConfigError } from "./mediaStore";
import type { GenerateRequest, InputReference } from "./types";

/**
 * OpenRouter only takes https reference URLs, so data: URLs from the browser
 * go to R2 when R2_* are set, else .data/media/ served from
 * /api/media/<project>/<file> at PUBLIC_MEDIA_BASE_URL (see README).
 * shortcut: files are never cleaned up automatically; manual deletion is
 * tracked in ENG-027 (issue #52, storage page).
 */

async function publish(url: string, project: string, store: ReturnType<typeof mediaStore>): Promise<string> {
  const parsed = parseDataUrl(url, "bin");
  if (!parsed) return url;
  const stored = await store.put(project, `${randomUUID()}.${parsed.ext}`, parsed.buffer, parsed.mime);
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
