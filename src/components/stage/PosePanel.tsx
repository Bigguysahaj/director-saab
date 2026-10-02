import { DEFAULT_POSE, type JointKey, type MannequinPose, type Vec3 } from "./types";

import { JOINT_LABELS, resolvePose } from "../../lib/poses/model";
import { PoseLibrary } from "./PoseLibrary";
export { JOINT_LABELS } from "../../lib/poses/model";

export function PosePanel({ pose, joint, characterId, onSelect, onChange }: {
  pose?: MannequinPose; characterId?: string; joint: JointKey; onSelect: (joint: JointKey) => void;
  onChange: (pose: MannequinPose) => void;
}) {
  const resolved = resolvePose(pose);
  const button = "rounded border border-border px-2 py-1.5 text-xs hover:bg-accent hover:text-bg";
  return <section aria-label="Mannequin pose editor" className="absolute top-24 right-4 z-10 max-h-[calc(100%-12rem)] w-64 overflow-y-auto rounded-xl border border-border bg-bg-panel p-4 text-fg shadow-xl">
    <h2 className="text-sm font-medium">Pose mannequin</h2>
    <p className="mt-1 text-xs text-fg-dim">Click a body part or choose a joint. Drag its rotation rings, or adjust the angles below.</p>
    <PoseLibrary pose={resolved} characterId={characterId} onApply={onChange} />
    <label className="block text-xs">Joint
      <select className="mt-1 w-full rounded border border-border bg-bg-panel p-2" value={joint} onChange={(e) => onSelect(e.target.value as JointKey)}>
        {Object.entries(JOINT_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    {['Bend (X)', 'Twist (Y)', 'Spread (Z)'].map((label, axis) => {
      const degrees = Math.round(resolved[joint][axis] * 180 / Math.PI);
      function update(value: number) {
        const rotation: Vec3 = [...resolved[joint]];
        rotation[axis] = Math.max(-180, Math.min(180, value)) * Math.PI / 180;
        onChange({ ...resolved, [joint]: rotation });
      }
      return <label key={label} className="mt-3 block text-xs">
        <span className="flex items-center justify-between">{label}<span><input aria-label={`${label} degrees`} type="number" min={-180} max={180} value={degrees} onChange={(e) => update(Number(e.target.value))} className="w-14 rounded border border-border bg-bg-panel p-1 text-right" />°</span></span>
        <input aria-label={label} className="mt-2 w-full accent-amber-400" type="range" min={-180} max={180} value={degrees} onChange={(e) => update(Number(e.target.value))} />
      </label>;
    })}
    <div className="mt-3 flex gap-2">
      <button className={button} onClick={() => onChange({ ...resolved, [joint]: [...DEFAULT_POSE[joint]] })}>Reset joint</button>
      <button className={button} onClick={() => onChange(resolvePose())}>Reset pose</button>
    </div>
    <p className="mt-3 text-xs text-fg-dim">Poses save automatically. Joint poses are static across the timeline. Use Move to position a seated figure.</p>
  </section>;
}
