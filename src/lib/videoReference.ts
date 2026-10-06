// Pure helpers for sending a /stage take to Seedance 2.x as a video
// reference. Limits and pricing come from the research in
// docs/handoffs/2026-10-07-seedance-video-reference.md.
import type { InputReference } from "./types";

/**
 * Seedance bills tokens = w × h × 24 × (output s + reference-video s) / 1024.
 * A video ref both adds its seconds and switches the whole call onto the
 * (cheaper per token) video-input rate. Rates are USD per token.
 */
export function estimateVideoCost({
  width,
  height,
  outputSeconds,
  referenceVideoSeconds = 0,
  rate,
  videoInputRate,
}: {
  width: number;
  height: number;
  outputSeconds: number;
  referenceVideoSeconds?: number;
  rate: number;
  videoInputRate: number;
}): number {
  const tokens = (width * height * 24 * (outputSeconds + referenceVideoSeconds)) / 1024;
  return tokens * (referenceVideoSeconds > 0 ? videoInputRate : rate);
}

export type TimedMedia = { url: string; seconds: number };

export const SEEDANCE_LIMITS = {
  videoMinSeconds: 2,
  videoMaxSeconds: 15,
  audioMaxSeconds: 15,
  maxImages: 9,
};

// Data URLs carry a MIME type; hosted URLs only an extension. Either is
// enough to catch the WebM the browser recorder falls back to.
function mediaType(url: string): string {
  const data = /^data:([^;,]+)/.exec(url);
  if (data) return data[1].toLowerCase();
  const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url)?.[1]?.toLowerCase();
  return ext ?? "";
}

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "mp4", "mov"];
const AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "mp3", "wav"];

/**
 * The one place reference URLs become OpenRouter `input_references`, so a
 * hosted-upload URL can replace data URLs later without touching callers.
 * Throws with a user-facing message when a Seedance 2.x limit is broken.
 */
export function buildInputReferences({
  video,
  images = [],
  audio,
}: {
  video?: TimedMedia;
  images?: string[];
  audio?: TimedMedia;
}): InputReference[] {
  const { videoMinSeconds, videoMaxSeconds, audioMaxSeconds, maxImages } = SEEDANCE_LIMITS;
  const refs: InputReference[] = [];

  if (video) {
    if (!VIDEO_TYPES.includes(mediaType(video.url))) {
      throw new Error("Reference video must be MP4 or MOV (WebM isn't accepted); convert it first.");
    }
    if (!(video.seconds >= videoMinSeconds && video.seconds <= videoMaxSeconds)) {
      throw new Error(`Reference video must be ${videoMinSeconds}–${videoMaxSeconds} seconds long (got ${video.seconds.toFixed(1)} s).`);
    }
    refs.push({ type: "video_url", video_url: { url: video.url } });
  }

  if (images.length > maxImages) {
    throw new Error(`At most ${maxImages} reference images (got ${images.length}).`);
  }
  for (const url of images) refs.push({ type: "image_url", image_url: { url } });

  if (audio) {
    if (!video && images.length === 0) {
      throw new Error("A voice/audio reference needs at least one image or video reference.");
    }
    if (!AUDIO_TYPES.includes(mediaType(audio.url))) {
      throw new Error("Reference audio must be MP3 or WAV.");
    }
    if (!(audio.seconds > 0 && audio.seconds <= audioMaxSeconds)) {
      throw new Error(`Reference audio must be at most ${audioMaxSeconds} seconds (got ${audio.seconds.toFixed(1)} s).`);
    }
    refs.push({ type: "audio_url", audio_url: { url: audio.url } });
  }

  return refs;
}

export type RecorderFormat = { mimeType: string; ext: "mp4" | "webm"; seedanceReady: boolean };

// MP4 first: Seedance only takes MP4/MOV. H.264 is the safest MP4 codec for
// it; plain video/mp4 lets the browser pick (Chromium may use VP9 in MP4).
const RECORDER_FORMATS: RecorderFormat[] = [
  { mimeType: "video/mp4;codecs=avc1", ext: "mp4", seedanceReady: true },
  { mimeType: "video/mp4", ext: "mp4", seedanceReady: true },
  { mimeType: "video/webm;codecs=vp9", ext: "webm", seedanceReady: false },
  { mimeType: "video/webm", ext: "webm", seedanceReady: false },
];

export function pickRecorderMimeType(isTypeSupported: (type: string) => boolean): RecorderFormat {
  return RECORDER_FORMATS.find((f) => isTypeSupported(f.mimeType)) ?? RECORDER_FORMATS[RECORDER_FORMATS.length - 1];
}

/** The largest centred rectangle of the given width/height ratio inside w × h. */
export function fitAspect(w: number, h: number, aspect: number) {
  const width = Math.min(w, h * aspect);
  const height = width / aspect;
  return { x: (w - width) / 2, y: (h - height) / 2, width, height };
}

/** Output pixel size for a Seedance resolution label in portrait/landscape. */
export function resolutionSize(resolution: string, aspectRatio: string): { width: number; height: number } {
  const short = Number.parseInt(resolution, 10) || 480;
  // ceil: 480p is 854 wide, not 853.
  const long = Math.ceil((short * 16) / 9);
  return aspectRatio === "9:16" ? { width: short, height: long } : { width: long, height: short };
}
