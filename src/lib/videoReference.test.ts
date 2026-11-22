// Acceptance spec for sending a /stage take to Seedance — see
// docs/handoffs/2026-10-07-seedance-video-reference.md. Written before the
// implementation: these fail until it lands.
import { describe, expect, it } from "vitest";
import { buildInputReferences, estimateVideoCost, fitAspect, pickRecorderMimeType, resolutionSize } from "./videoReference";

// OpenRouter catalog rates for bytedance/seedance-2.0-mini (2026-10-07), USD per token.
const MINI = { rate: 0.0000035, videoInputRate: 0.0000021 };

describe("estimateVideoCost", () => {
  it("matches the researched 480p / 720p numbers for Seedance 2.0 Mini with a video ref", () => {
    expect(estimateVideoCost({ width: 854, height: 480, outputSeconds: 5, referenceVideoSeconds: 5, ...MINI })).toBeCloseTo(0.2, 1);
    expect(estimateVideoCost({ width: 1280, height: 720, outputSeconds: 5, referenceVideoSeconds: 5, ...MINI })).toBeCloseTo(0.45, 1);
    expect(estimateVideoCost({ width: 1280, height: 720, outputSeconds: 10, referenceVideoSeconds: 10, ...MINI })).toBeCloseTo(0.91, 1);
  });

  it("uses the plain rate on output-only seconds when there is no video ref", () => {
    // 720p 5 s: 1280*720*24*5/1024 = 108000 tokens * 3.5e-6
    expect(estimateVideoCost({ width: 1280, height: 720, outputSeconds: 5, ...MINI })).toBeCloseTo(0.378, 3);
  });
});

describe("buildInputReferences", () => {
  const vid = { url: "data:video/mp4;base64,AAAA", seconds: 8 };
  const img = "data:image/png;base64,BBBB";
  const aud = { url: "data:audio/mpeg;base64,CCCC", seconds: 6 };

  it("emits OpenRouter input_references with video_url / image_url / audio_url parts", () => {
    expect(buildInputReferences({ video: vid, images: [img], audio: aud })).toEqual([
      { type: "video_url", video_url: { url: vid.url } },
      { type: "image_url", image_url: { url: img } },
      { type: "audio_url", audio_url: { url: aud.url } },
    ]);
  });

  it("enforces Seedance 2.x limits", () => {
    expect(() => buildInputReferences({ audio: aud })).toThrow(/audio/i); // audio needs an image or video
    expect(() => buildInputReferences({ video: { ...vid, url: "data:video/webm;base64,AAAA" } })).toThrow(/mp4|mov/i);
    expect(() => buildInputReferences({ video: { ...vid, seconds: 1 } })).toThrow(/2.*15|seconds/i);
    expect(() => buildInputReferences({ video: { ...vid, seconds: 16 } })).toThrow(/2.*15|seconds/i);
    expect(() => buildInputReferences({ video: { ...vid, seconds: Number.NaN } })).toThrow(/seconds/i);
    expect(() => buildInputReferences({ video: vid, audio: { ...aud, seconds: 0 } })).toThrow(/audio/i);
    expect(() => buildInputReferences({ video: vid, audio: { ...aud, seconds: 16 } })).toThrow(/audio/i);
    expect(() => buildInputReferences({ images: Array(10).fill(img) })).toThrow(/image/i);
  });

  it("accepts the 2s and 15s bounds, hosted URLs, and browser audio MIME aliases", () => {
    expect(buildInputReferences({
      video: { url: "https://cdn.example/clip.MOV?token=1", seconds: 2 },
      audio: { url: "https://cdn.example/line.wav#t=0", seconds: 15 },
    })).toEqual([
      { type: "video_url", video_url: { url: "https://cdn.example/clip.MOV?token=1" } },
      { type: "audio_url", audio_url: { url: "https://cdn.example/line.wav#t=0" } },
    ]);
    expect(() => buildInputReferences({ video: { url: "https://cdn.example/clip.webm?download=1", seconds: 8 } })).toThrow(/mp4|mov/i);
    for (const url of ["data:audio/x-wav;base64,CCCC", "data:audio/wave;base64,CCCC", "data:audio/mp3;base64,CCCC"]) {
      expect(buildInputReferences({ images: [img], audio: { url, seconds: 0.5 } })).toEqual([
        { type: "image_url", image_url: { url: img } },
        { type: "audio_url", audio_url: { url } },
      ]);
    }
  });
});

describe("pickRecorderMimeType", () => {
  it("prefers H.264 MP4, then plain MP4, and flags WebM as needing conversion", () => {
    expect(pickRecorderMimeType((t) => t.startsWith("video/mp4"))).toEqual({ mimeType: "video/mp4;codecs=avc1", ext: "mp4", seedanceReady: true });
    expect(pickRecorderMimeType((t) => t === "video/mp4")).toEqual({ mimeType: "video/mp4", ext: "mp4", seedanceReady: true });
    expect(pickRecorderMimeType((t) => t.startsWith("video/webm")).seedanceReady).toBe(false);
    expect(pickRecorderMimeType(() => false)).toEqual({ mimeType: "video/webm", ext: "webm", seedanceReady: false });
  });
});

describe("fitAspect", () => {
  it("centers the largest 9:16 frame inside the viewport", () => {
    expect(fitAspect(1600, 900, 9 / 16)).toEqual({ x: 546.875, y: 0, width: 506.25, height: 900 });
    expect(fitAspect(900, 3200, 9 / 16)).toEqual({ x: 0, y: 800, width: 900, height: 1600 });
  });
});

describe("resolutionSize", () => {
  it("reads p labels and the 2K / 4K names", () => {
    expect(resolutionSize("480p", "9:16")).toEqual({ width: 480, height: 854 });
    expect(resolutionSize("720p", "16:9")).toEqual({ width: 1280, height: 720 });
    expect(resolutionSize("2K", "16:9")).toEqual({ width: 2560, height: 1440 });
    expect(resolutionSize("4K", "16:9")).toEqual({ width: 3840, height: 2160 });
  });
});
