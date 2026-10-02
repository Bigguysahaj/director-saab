"use client";

import { useRef, useState } from "react";
import { POSE_LIBRARY_CHANGED, usePoseLibrary } from "../../lib/poses/usePoseLibrary";
import { BUILTIN_POSES } from "../../lib/poses/catalog";
import { resolvePose, type MannequinPose } from "../../lib/poses/model";
import { importPoses, loadLibrary, MAX_PACK_BYTES, posesForCharacter, saveLibrary, serializeLibrary, type PoseAsset } from "../../lib/poses/library";

export function PoseLibrary({ pose, characterId, onApply }: {
  pose: MannequinPose; characterId?: string; onApply: (pose: MannequinPose) => void;
}) {
  const { saved, ready, error: readError } = usePoseLibrary();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [scope, setScope] = useState("everyone");
  const [tab, setTab] = useState<"included" | "saved">("included");
  const [query, setQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  function persist(next: PoseAsset[]): boolean {
    try {
      saveLibrary(window.localStorage, next);
      window.dispatchEvent(new Event(POSE_LIBRARY_CHANGED));
      setError("");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save poses in this browser.");
      return false;
    }
  }
  const available = tab === "included" ? BUILTIN_POSES : posesForCharacter(saved, characterId);
  const filtered = available.filter((asset) => asset.name.toLowerCase().includes(query.toLowerCase()));
  const button = "rounded border border-border px-2 py-1.5 text-xs hover:bg-accent hover:text-bg disabled:opacity-40";
  return <div className="my-3 border-y border-border py-3">
    <h3 className="mb-2 text-xs font-medium">Pose library</h3>
    <div className="flex gap-2" role="tablist" aria-label="Pose collection">
      <button role="tab" aria-selected={tab === "included"} className={button} onClick={() => setTab("included")}>Included ({BUILTIN_POSES.length})</button>
      <button role="tab" aria-selected={tab === "saved"} className={button} onClick={() => setTab("saved")}>My poses</button>
    </div>
    <input aria-label="Search poses" placeholder="Search poses…" className="my-2 w-full rounded border border-border bg-bg-panel p-2 text-xs" value={query} onChange={(e) => setQuery(e.target.value)} />
    <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto" aria-label="Available poses">
      {filtered.map((asset) => <div className="flex gap-1" key={asset.id}>
        <button title={asset.characterId ? "Saved for this cast character" : undefined} className={`${button} flex-1`} onClick={() => { onApply(resolvePose(asset.pose)); setNotice(`Applied ${asset.name}.`); }}>{asset.name}{asset.characterId ? " ★" : ""}</button>
        {tab === "saved" && <button className={button} aria-label={`Delete ${asset.name}`} onClick={() => {
          if (persist(saved.filter((item) => item.id !== asset.id))) setNotice(`Deleted ${asset.name}.`);
        }}>×</button>}
      </div>)}
    </div>
    {!filtered.length && <p className="py-2 text-xs text-fg-dim">No matching poses. Save your current pose below.</p>}
    <form className="mt-3 space-y-2" onSubmit={(event) => {
      event.preventDefault();
      if (!ready || !name.trim()) return;
      const asset: PoseAsset = { id: crypto.randomUUID(), name: name.trim(), pose: resolvePose(pose),
        ...(scope === "character" && characterId ? { characterId } : {}) };
      if (persist([...saved, asset])) { setName(""); setTab("saved"); setQuery(""); setNotice(`Saved ${asset.name}.`); }
    }}>
      <input aria-label="Pose name" maxLength={60} placeholder="Name this pose" className="w-full rounded border border-border bg-bg-panel p-2 text-xs" value={name} onChange={(e) => setName(e.target.value)} />
      <select aria-label="Save pose for" className="w-full rounded border border-border bg-bg-panel p-2 text-xs" value={scope} onChange={(e) => setScope(e.target.value)}>
        <option value="everyone">All characters</option>
        <option value="character" disabled={!characterId}>This cast character</option>
      </select>
      <button type="submit" disabled={!ready || !name.trim()} className={`${button} w-full`}>Save current pose</button>
    </form>
    <div className="mt-2 flex gap-2">
      <button disabled={!ready} className={button} onClick={() => fileInput.current?.click()}>Import pack</button>
      <button disabled={!ready || !saved.length} className={button} onClick={() => {
        try {
          const url = URL.createObjectURL(new Blob([serializeLibrary(saved)], { type: "application/json" }));
          const link = document.createElement("a"); link.href = url; link.download = "director-poses.json";
          link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          setNotice("Exported all saved poses.");
        } catch { setError("Could not export the pose library."); }
      }}>Export saved</button>
      <input ref={fileInput} aria-label="Import pose pack" type="file" accept=".json,application/json" className="hidden" onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        try {
          if (file.size > MAX_PACK_BYTES) throw new Error("Pose pack is too large (maximum 1 MB).");
          const text = await file.text();
          // Re-read at commit time so a slow file read cannot overwrite newly saved poses.
          const next = importPoses(loadLibrary(window.localStorage), text, () => crypto.randomUUID());
          if (persist(next)) { setTab("saved"); setQuery(""); setNotice("Imported poses for all characters."); }
        } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import this pack."); }
      }} />
    </div>
    <p className="mt-2 text-[11px] text-fg-dim">Saved in this browser. Export a backup or import more poses later. Assign cast to save character-specific poses.</p>
    {(error || readError) && <p role="alert" className="mt-2 text-xs text-red-400">{error || readError}</p>}
    <p role="status" className="mt-1 text-xs text-fg-dim">{notice}</p>
  </div>;
}
