import { parsePose, type MannequinPose } from "./model";

export const POSE_LIBRARY_KEY = "director-pose-library-v1";
export const RIG_ID = "director-mannequin-v1";
export const MAX_POSES = 200;
export const MAX_PACK_BYTES = 1_000_000;
export type PoseAsset = { id: string; name: string; pose: MannequinPose; characterId?: string };
export type PosePack = { version: 1; rig: typeof RIG_ID; poses: PoseAsset[] };
export type PoseStorage = Pick<Storage, "getItem" | "setItem">;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid pose pack.");
  return value as Record<string, unknown>;
}
function nonempty(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit;
}

export function parsePack(text: string): PosePack {
  if (new TextEncoder().encode(text).length > MAX_PACK_BYTES) throw new Error("Pose pack is too large (maximum 1 MB).");
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("Pose pack must be valid JSON."); }
  const data = record(parsed);
  if (data.version !== 1 || data.rig !== RIG_ID) throw new Error("This pose pack uses an unsupported version or rig.");
  if (!Array.isArray(data.poses) || data.poses.length > MAX_POSES) throw new Error(`A library can contain up to ${MAX_POSES} poses.`);
  const ids = new Set<string>();
  const poses = data.poses.map((item): PoseAsset => {
    const asset = record(item);
    if (!nonempty(asset.id, 160) || ids.has(asset.id)) throw new Error("Pose IDs must be unique and nonempty.");
    if (!nonempty(asset.name, 60)) throw new Error("Pose names must contain 1–60 characters.");
    if (asset.characterId !== undefined && !nonempty(asset.characterId, 160)) throw new Error("Invalid character assignment.");
    ids.add(asset.id);
    return { id: asset.id, name: asset.name.trim(), pose: parsePose(asset.pose),
      ...(asset.characterId ? { characterId: asset.characterId as string } : {}) };
  });
  return { version: 1, rig: RIG_ID, poses };
}

export function serializeLibrary(poses: PoseAsset[]): string {
  const text = JSON.stringify({ version: 1, rig: RIG_ID, poses }, null, 2);
  // Validate writes as well as reads; callers cannot store an unreadable library.
  parsePack(text);
  return text;
}
export function loadLibrary(storage: PoseStorage): PoseAsset[] {
  const text = storage.getItem(POSE_LIBRARY_KEY);
  return text === null ? [] : parsePack(text).poses;
}
export function saveLibrary(storage: PoseStorage, poses: PoseAsset[]): void {
  storage.setItem(POSE_LIBRARY_KEY, serializeLibrary(poses));
}

/** An imported pack cannot overwrite an existing pose or retain foreign cast IDs. */
export function importPoses(existing: PoseAsset[], text: string, newId: () => string): PoseAsset[] {
  const imported = parsePack(text).poses.map(({ name, pose }) => ({ id: newId(), name, pose }));
  const combined = [...existing, ...imported];
  parsePack(serializeLibrary(combined));
  return combined;
}
export function posesForCharacter(poses: PoseAsset[], characterId?: string): PoseAsset[] {
  return poses.filter((pose) => !pose.characterId || pose.characterId === characterId);
}
