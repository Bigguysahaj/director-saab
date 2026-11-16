/** The one MIME / extension table and data: URL parser for everything stored on disk or in R2. */

const MIME_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
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

const DATA_URL_RE = /^data:([^;,]+)?(?:;[^,]*)?;base64,([\s\S]*)$/;

/** Content type for a filename or bare extension. */
export function contentType(filename: string): string {
  const ext = filename.split(".").pop()!.toLowerCase();
  return MIME_BY_EXT[ext === "jpeg" ? "jpg" : ext] ?? "application/octet-stream";
}

/** null when `url` isn't a base64 data URL; `fallbackExt` names a type the table doesn't know. */
export function parseDataUrl(url: string, fallbackExt: string): { mime: string; ext: string; buffer: Buffer } | null {
  const match = DATA_URL_RE.exec(url);
  if (!match) return null;
  const [, mime = "application/octet-stream", base64] = match;
  return { mime, ext: EXT_BY_MIME[mime.toLowerCase()] ?? fallbackExt, buffer: Buffer.from(base64, "base64") };
}
