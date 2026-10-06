import { JOINTS, resolvePose } from "../../lib/poses/model";
import { TIMELINE_DURATION, type MannequinPose, type SceneObject, type Vec3 } from "./types";

export const SCENE_SCHEMA = "director-stage-scene/v1";
const SCENE_KINDS: SceneObject["kind"][] = ["box", "ball", "purse", "light", "camera", "mannequin"];

const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));

/** Accepts `{ schema, objects }` or a bare objects array; checks the fields
 * the renderer relies on and leaves the rest to the per-kind defaults. */
export function parseScene(data: unknown): SceneObject[] {
  const objects = Array.isArray(data) ? data : (data as { objects?: unknown })?.objects;
  if (!Array.isArray(objects) || objects.length === 0) throw new Error("no objects array");
  const ids = new Set<number>();
  objects.forEach((o, i) => {
    const where = `object ${i}`;
    if (typeof o?.id !== "number" || ids.has(o.id)) throw new Error(`${where}: missing or duplicate id`);
    ids.add(o.id);
    if (!SCENE_KINDS.includes(o.kind)) throw new Error(`${where}: unknown kind "${o.kind}"`);
    if (!isVec3(o.position) || !isVec3(o.rotation)) throw new Error(`${where}: position/rotation must be [x, y, z]`);
    for (const k of o.keyframes ?? []) {
      if (typeof k?.time !== "number" || k.time < 0 || k.time > TIMELINE_DURATION || !isVec3(k.position) || !isVec3(k.rotation)) {
        throw new Error(`${where}: bad keyframe (time 0-${TIMELINE_DURATION}s, position/rotation [x, y, z])`);
      }
      if (k.pose !== undefined) {
        if (!k.pose || typeof k.pose !== "object" || Array.isArray(k.pose)) throw new Error(`${where}: keyframe pose must map joint names to [x, y, z]`);
        for (const [joint, value] of Object.entries(k.pose)) {
          if (!JOINTS.includes(joint as (typeof JOINTS)[number])) throw new Error(`${where}: keyframe pose has unknown joint "${joint}"`);
          if (!isVec3(value)) throw new Error(`${where}: keyframe pose joint "${joint}" must be [x, y, z]`);
        }
      }
    }
  });
  if (objects.filter((o) => o.kind === "camera").length > 1) throw new Error("only one camera is supported");
  // Scene files may key only the joints that move; fill the rest from
  // DEFAULT_POSE so every keyframe pose is a whole MannequinPose in memory.
  return objects.map((o) =>
    o.keyframes ? { ...o, keyframes: o.keyframes.map((k: { pose?: Partial<MannequinPose> }) => (k.pose ? { ...k, pose: resolvePose(k.pose) } : k)) } : o
  ) as SceneObject[];
}
