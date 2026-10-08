import "server-only";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataRoot } from "./projectStore";
import type { GenerateRequest, GenerationStatus } from "./types";

/**
 * Every take sent to a video model, on disk under .data/takes/<jobId>/
 * (gitignored): take.json with the prompt, settings, status and kept flag,
 * the reference media and stage spec as real files, and output.mp4 once the
 * job completes. These are the (spec, proxy clip, output, kept?) pairs any
 * later model work would train on, so they're kept even if Dailies is cleared.
 */

type LoggedReference = { type: string; file: string };

export type LoggedTake = {
  id: string;
  project: string | null; // the project the take was sent from
  createdAt: number;
  model: string;
  prompt: string;
  settings: {
    duration?: number;
    resolution?: string;
    aspect_ratio?: string;
    seed?: number;
    generate_audio?: boolean;
  };
  references: LoggedReference[];
  frameImages: (LoggedReference & { frame_type: string })[];
  stage: string | null; // "stage.json" when a stage spec came with the take
  status: GenerationStatus;
  cost: number | null;
  error: string | null;
  output: string | null; // "output.mp4" once saved
  kept: boolean | null;
};

const ID_RE = /^[A-Za-z0-9_-]+$/;

function takeDir(id: string): string {
  if (!ID_RE.test(id)) throw new Error(`Invalid take id: ${id}`);
  return path.join(dataRoot(), "takes", id);
}

const EXT_BY_MIME: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Writes a data URL out as a file; a plain https URL is kept as-is in the
 * record instead (nothing to save locally). */
async function saveMedia(dir: string, baseName: string, url: string): Promise<string> {
  const match = /^data:([^;,]+)?(?:;[^,]*)?;base64,([\s\S]*)$/.exec(url);
  if (!match) return url;
  const [, mime, base64] = match;
  const filename = `${baseName}.${EXT_BY_MIME[mime ?? ""] ?? "bin"}`;
  await writeFile(path.join(dir, filename), Buffer.from(base64, "base64"));
  return filename;
}

export async function logSubmittedTake({
  id,
  request,
  stage,
  project = null,
}: {
  id: string;
  request: GenerateRequest;
  stage?: unknown;
  project?: string | null;
}): Promise<void> {
  const dir = takeDir(id);
  await mkdir(dir, { recursive: true });

  const references: LoggedReference[] = [];
  for (const [i, ref] of (request.input_references ?? []).entries()) {
    const url =
      ref.type === "video_url" ? ref.video_url.url : ref.type === "audio_url" ? ref.audio_url.url : ref.image_url.url;
    references.push({ type: ref.type, file: await saveMedia(dir, `ref-${i + 1}-${ref.type.replace("_url", "")}`, url) });
  }
  const frameImages: LoggedTake["frameImages"] = [];
  for (const frame of request.frame_images ?? []) {
    frameImages.push({ type: frame.type, frame_type: frame.frame_type, file: await saveMedia(dir, frame.frame_type, frame.image_url.url) });
  }

  if (stage != null) await writeFile(path.join(dir, "stage.json"), JSON.stringify(stage, null, 2));

  const take: LoggedTake = {
    id,
    project,
    createdAt: Date.now(),
    model: request.model,
    prompt: request.prompt,
    settings: {
      duration: request.duration,
      resolution: request.resolution,
      aspect_ratio: request.aspect_ratio,
      seed: request.seed,
      generate_audio: request.generate_audio,
    },
    references,
    frameImages,
    stage: stage != null ? "stage.json" : null,
    status: "pending",
    cost: null,
    error: null,
    output: null,
    kept: null,
  };
  await writeTake(take);
}

export async function readTake(id: string): Promise<LoggedTake> {
  return JSON.parse(await readFile(path.join(takeDir(id), "take.json"), "utf-8")) as LoggedTake;
}

async function writeTake(take: LoggedTake): Promise<void> {
  await writeFile(path.join(takeDir(take.id), "take.json"), JSON.stringify(take, null, 2));
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

// Output downloads in progress, by take id, so two "completed" polls that
// arrive together share one download instead of racing.
const savingOutput = new Map<string, Promise<void>>();

async function saveOutput(outputPath: string, fetchOutput: () => Promise<Response>): Promise<void> {
  // Written under a temp name and renamed into place, so a half-written
  // video never sits at output.mp4.
  const tmp = `${outputPath}.${process.pid}.tmp`;
  try {
    const res = await fetchOutput();
    await writeFile(tmp, Buffer.from(await res.arrayBuffer()));
    await rename(tmp, outputPath);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/** Records a job's final status. On completion the rendered video is saved
 * once; polling the same finished job again doesn't download it twice. */
export async function recordTakeResult(
  id: string,
  result: { status: GenerationStatus; cost?: number; error?: string },
  fetchOutput: () => Promise<Response>
): Promise<void> {
  const take = await readTake(id);
  const outputPath = path.join(takeDir(id), "output.mp4");
  let output = take.output;
  if (result.status === "completed" && !(await exists(outputPath))) {
    let saving = savingOutput.get(id);
    if (!saving) {
      saving = saveOutput(outputPath, fetchOutput).finally(() => savingOutput.delete(id));
      savingOutput.set(id, saving);
    }
    await saving;
    output = "output.mp4";
  }
  await writeTake({
    ...take,
    status: result.status,
    cost: result.cost ?? take.cost,
    error: result.error ?? null,
    output,
  });
}

export async function setKept(id: string, kept: boolean): Promise<void> {
  const take = await readTake(id);
  await writeTake({ ...take, kept });
}
