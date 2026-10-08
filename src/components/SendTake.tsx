"use client";

import { useEffect, useRef, useState } from "react";
import { loadCast, type CastMember } from "@/lib/cast";
import type { GenerateRequest, VideoModel } from "@/lib/types";
import { buildInputReferences, estimateVideoCost, resolutionSize } from "@/lib/videoReference";

const DEFAULT_MODEL = "bytedance/seedance-2.0-mini";
const MAX_CHARACTER_IMAGES = 3;
const ASPECT = "9:16";

type Media = { name: string; previewUrl: string; dataUrl: string; seconds: number };
type Picture = { name: string; dataUrl: string };

export type SubmittedTake = {
  prompt: string;
  model: VideoModel;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
};

// Some OSes hand .mov/.mp3 files over with an empty File.type, which would
// turn into an application/octet-stream data URL that the MP4/MOV check
// (rightly) rejects. The extension is the next best signal.
const TYPE_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      const type = file.type || TYPE_BY_EXT[file.name.split(".").pop()?.toLowerCase() ?? ""];
      resolve(type ? url.replace(/^data:[^;,]*/, `data:${type}`) : url);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't load that character sheet.");
  return readDataUrl(new File([await res.blob()], ""));
}

/** Length of an audio/video file in seconds. MediaRecorder output often has
 * no duration in its header (reads as Infinity) until the element seeks to
 * the end, so we nudge it there. */
function readSeconds(url: string, kind: "video" | "audio"): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(kind);
    el.preload = "metadata";
    el.muted = true;
    const done = (seconds: number) => {
      el.removeAttribute("src");
      resolve(seconds);
    };
    el.onloadedmetadata = () => {
      if (Number.isFinite(el.duration)) return done(el.duration);
      el.ontimeupdate = () => {
        el.ontimeupdate = null;
        done(el.duration);
      };
      el.currentTime = 1e9;
    };
    el.onerror = () => reject(new Error(`Couldn't read this ${kind} file's length.`));
    el.src = url;
  });
}

async function loadMedia(file: File, kind: "video" | "audio"): Promise<Media> {
  const previewUrl = URL.createObjectURL(file);
  const [dataUrl, seconds] = await Promise.all([readDataUrl(file), readSeconds(previewUrl, kind)]);
  return { name: file.name, previewUrl, dataUrl, seconds };
}

function promptHint(hasImages: boolean, hasAudio: boolean): string {
  const parts = ["Use @Video1 for camera motion and blocking"];
  if (hasImages) parts.push("@Image1 for the character");
  if (hasAudio) parts.push("@Audio1 for the voice line");
  return `${parts.join(", ")}.`;
}

function pickDuration(options: number[], seconds?: number): number | undefined {
  if (!options.length) return undefined;
  if (seconds === undefined) return options[0];
  return options.find((d) => d >= Math.round(seconds)) ?? options[options.length - 1];
}

const LABEL = "text-[10px] tracking-[0.2em] text-fg-faint uppercase";
const FIELD = "rounded-sm border border-border bg-bg-panel px-2 py-1 text-xs text-fg";

/**
 * Sends a recorded /stage take (plus character images and an optional voice
 * line) to a Seedance 2.x model as references. A preview with the cost
 * estimate always comes first: nothing is sent until "Confirm & generate".
 */
export function SendTake({
  models,
  disabled,
  onSubmit,
}: {
  // Already filtered to models that accept a video reference.
  models: VideoModel[];
  disabled?: boolean;
  onSubmit: (body: GenerateRequest, take: SubmittedTake) => void;
}) {
  const [video, setVideo] = useState<Media | null>(null);
  const [uploads, setUploads] = useState<Picture[]>([]);
  const [castImages, setCastImages] = useState<Picture[]>([]);
  // Cast sheets lead so the sheet stays @Image1; uploads follow.
  const images = [...castImages, ...uploads];
  const [audio, setAudio] = useState<Media | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string>();
  const [resolution, setResolution] = useState<string>();
  const [duration, setDuration] = useState<number>();
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetCast, setSheetCast] = useState<CastMember[]>([]);
  // Latest dropdown pick, so a slower earlier load can't attach its sheets.
  const pickedCastId = useRef("");

  useEffect(() => {
    let cancelled = false;
    loadCast().then((cast) => {
      if (!cancelled) setSheetCast(cast.filter((m) => m.sheet));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const model = models.find((m) => m.id === modelId) ?? models.find((m) => m.id === DEFAULT_MODEL) ?? models[0];
  const resolutions = model?.supported_resolutions ?? [];
  const activeResolution = resolution && resolutions.includes(resolution) ? resolution : resolutions.includes("480p") ? "480p" : resolutions[0];
  const durations = model?.supported_durations ?? [];
  const activeDuration = duration !== undefined && durations.includes(duration) ? duration : pickDuration(durations, video?.seconds);
  const aspectRatio = model?.supported_aspect_ratios.includes(ASPECT) || !model?.supported_aspect_ratios.length ? ASPECT : model.supported_aspect_ratios[0];
  const prompt = editedPrompt ?? promptHint(images.length > 0, Boolean(audio));

  if (!models.length) return null;

  function edit() {
    setPreviewing(false);
    setError(null);
  }

  async function pick<T>(load: () => Promise<T>, apply: (v: T) => void) {
    edit();
    try {
      apply(await load());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  }

  function buildRequest(): GenerateRequest {
    if (!model || !video) throw new Error("Pick a recorded take (MP4) first.");
    if (!prompt.trim()) throw new Error("Add a prompt.");
    return {
      model: model.id,
      prompt: prompt.trim(),
      duration: activeDuration,
      resolution: activeResolution,
      aspect_ratio: aspectRatio,
      generate_audio: model.supports_audio ? true : undefined,
      input_references: buildInputReferences({
        video: { url: video.dataUrl, seconds: video.seconds },
        images: images.map((i) => i.dataUrl),
        audio: audio ? { url: audio.dataUrl, seconds: audio.seconds } : undefined,
      }),
    };
  }

  function preview() {
    try {
      buildRequest();
      setError(null);
      setPreviewing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Can't build this request.");
    }
  }

  function confirm() {
    if (!model) return;
    try {
      onSubmit(buildRequest(), { prompt: prompt.trim(), model, duration: activeDuration, resolution: activeResolution, aspectRatio });
      setPreviewing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Can't build this request.");
    }
  }

  const size = activeResolution ? resolutionSize(activeResolution, aspectRatio) : null;
  const cost =
    size && activeDuration && video && model?.token_rate !== undefined && model.video_input_token_rate !== undefined
      ? estimateVideoCost({
          ...size,
          outputSeconds: activeDuration,
          referenceVideoSeconds: video.seconds,
          rate: model.token_rate,
          videoInputRate: model.video_input_token_rate,
        })
      : null;

  return (
    <details className="rounded-sm border border-border bg-bg-raised px-4 py-3">
      <summary className={`${LABEL} cursor-pointer`}>Send a stage take</summary>

      <div className="mt-4 flex flex-col gap-4" aria-label="Send a stage take">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Take (MP4)</span>
            <input
              type="file"
              accept="video/mp4,video/quicktime,.mp4,.mov"
              aria-label="Take video"
              disabled={disabled}
              className="text-[11px] text-fg-dim"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return setVideo(null);
                pick(() => loadMedia(file, "video"), setVideo);
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Character images (≤{MAX_CHARACTER_IMAGES})</span>
            <input
              type="file"
              accept="image/*"
              multiple
              aria-label="Character images"
              disabled={disabled}
              className="text-[11px] text-fg-dim"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []).slice(0, MAX_CHARACTER_IMAGES);
                pick(() => Promise.all(files.map(async (f) => ({ name: f.name, dataUrl: await readDataUrl(f) }))), setUploads);
              }}
            />
          </label>
          {sheetCast.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Or cast from sheet</span>
              <select
                aria-label="Cast from sheet"
                defaultValue=""
                disabled={disabled}
                className={FIELD}
                onChange={(e) => {
                  pickedCastId.current = e.target.value;
                  setCastImages([]);
                  const member = sheetCast.find((m) => m.id === e.target.value);
                  if (!member) return;
                  // Both sheets go as-is, sheet first so it's @Image1.
                  const urls = [member.sheet, member.closeup].filter(Boolean);
                  pick(
                    () => Promise.all(urls.map(async (url, i) => ({ name: i ? "close-up" : "sheet", dataUrl: await urlToDataUrl(url) }))),
                    (imgs) => {
                      if (pickedCastId.current === member.id) setCastImages(imgs);
                    },
                  );
                }}
              >
                <option value="">—</option>
                {sheetCast.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Voice line (MP3/WAV, optional)</span>
            <input
              type="file"
              accept="audio/mpeg,audio/wav,.mp3,.wav"
              aria-label="Voice line"
              disabled={disabled}
              className="text-[11px] text-fg-dim"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return setAudio(null);
                pick(() => loadMedia(file, "audio"), setAudio);
              }}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className={LABEL}>Prompt</span>
          <textarea
            value={prompt}
            aria-label="Take prompt"
            disabled={disabled}
            rows={3}
            onChange={(e) => {
              edit();
              setEditedPrompt(e.target.value);
            }}
            className="w-full resize-none rounded-sm border border-border bg-bg-panel px-3 py-2 text-sm text-fg focus:border-border-strong focus:outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="Take model" value={model?.id} disabled={disabled} className={FIELD} onChange={(e) => { edit(); setModelId(e.target.value); }}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          <select aria-label="Take resolution" value={activeResolution} disabled={disabled} className={FIELD} onChange={(e) => { edit(); setResolution(e.target.value); }}>
            {resolutions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select aria-label="Take duration" value={activeDuration} disabled={disabled} className={FIELD} onChange={(e) => { edit(); setDuration(Number(e.target.value)); }}>
            {durations.map((d) => (
              <option key={d} value={d}>{d} s</option>
            ))}
          </select>
          <span className="text-[11px] text-fg-faint">{aspectRatio}</span>
          <button
            type="button"
            onClick={preview}
            disabled={disabled || !video}
            className="ml-auto rounded-sm border border-border px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-fg-dim hover:border-accent hover:text-fg disabled:opacity-30"
          >
            Preview
          </button>
        </div>

        {error && <p role="alert" className="text-xs text-warn">{error}</p>}

        {previewing && video && (
          <section aria-label="Take preview" className="flex flex-col gap-3 rounded-sm border border-accent-dim p-3">
            <div className="flex flex-wrap items-start gap-3">
              <video src={video.previewUrl} controls muted playsInline aria-label="Reference take" className="h-48 rounded-sm bg-black" />
              <div className="flex flex-col gap-2">
                {images.length > 0 && (
                  <div className="flex gap-2">
                    {images.map((img, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={img.dataUrl} alt={`@Image${i + 1}`} className="h-16 w-16 rounded-sm object-cover" />
                    ))}
                  </div>
                )}
                {audio && <audio src={audio.previewUrl} controls aria-label="Voice line preview" className="h-8" />}
                <p className="text-[11px] text-fg-dim">
                  {model?.label} · {activeResolution} · {activeDuration} s out · {video.seconds.toFixed(1)} s reference
                </p>
                <p className="text-sm text-fg" data-testid="take-cost">
                  {cost !== null ? `Estimated cost: $${cost.toFixed(2)}` : "Estimated cost: unknown for this model"}
                </p>
              </div>
            </div>
            <div className="flex gap-2 self-end">
              <button type="button" onClick={edit} className="rounded-sm px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-fg-dim hover:text-fg">
                Back
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={disabled}
                className="rounded-sm border border-accent-dim bg-accent-soft px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-accent hover:bg-accent hover:text-bg disabled:opacity-30"
              >
                Confirm & generate
              </button>
            </div>
          </section>
        )}
      </div>
    </details>
  );
}
