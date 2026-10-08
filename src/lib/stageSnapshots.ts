import { SCENE_SCHEMA } from "@/components/stage/scene";

/**
 * The /stage layout as it was when each clip was recorded, kept in the
 * browser keyed by the clip's timestamp (`stage-clip-<ts>.mp4`). Send take
 * looks the clip up by filename, so the logged stage spec matches what was
 * filmed even if the stage was edited afterwards.
 */

export const STAGE_LAYOUT_KEY = "director-stage-layout-v3";
const SNAPSHOTS_KEY = "director-stage-snapshots-v1";
export const MAX_SNAPSHOTS = 20;

type Snapshot = { ts: number; objects: unknown[] };
export type StageSpec = { schema: string; objects: unknown[] };

function readSnapshots(storage: Storage): Snapshot[] {
  try {
    const parsed = JSON.parse(storage.getItem(SNAPSHOTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveStageSnapshot(storage: Storage, ts: number, objects: unknown[]): void {
  const next = [{ ts, objects }, ...readSnapshots(storage).filter((s) => s.ts !== ts)].slice(0, MAX_SNAPSHOTS);
  try {
    storage.setItem(SNAPSHOTS_KEY, JSON.stringify(next));
  } catch {
    // storage full or unavailable: the take just won't carry a stage spec
  }
}

export function stageSpecForClip(
  storage: Storage,
  filename: string
): { stage: StageSpec | null; warning: string | null } {
  const ts = Number(/^stage-clip-(\d+)\./.exec(filename)?.[1]);
  const snapshot = readSnapshots(storage).find((s) => s.ts === ts);
  if (!snapshot) return { stage: null, warning: "No stage spec for this clip." };

  const current = storage.getItem(STAGE_LAYOUT_KEY);
  const changed = current !== null && current !== JSON.stringify(snapshot.objects);
  return {
    stage: { schema: SCENE_SCHEMA, objects: snapshot.objects },
    warning: changed ? "Stage changed since this take was recorded." : null,
  };
}
