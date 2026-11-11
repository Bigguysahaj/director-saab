"use client";

import { useEffect, useRef, useState } from "react";
import { CHARACTER_SHEET_MODEL, CHARACTER_SHEET_SHOTS, GRID_SIZE } from "@/lib/characterSheet";
import {
  blobToDataUrl,
  createMember,
  deleteMember,
  loadCast,
  transferMember,
  updateMember,
  urlToDataUrl,
  type CastMember,
  type CastMemberShot,
} from "@/lib/cast";
import { loadProjects, type Project } from "@/lib/projects";
import { AddFromSheetForm } from "@/components/cast/AddFromSheet";
import { ImageModelSelect } from "@/components/ImageModelSelect";
import { ImageViewer } from "@/components/ImageViewer";
import type { ImageModel } from "@/lib/types";
import { IMAGE_PRICE_PER_CALL } from "@/lib/imageModels";
import { CastColorMark } from "./CastColorMark";

const SHEET_MODEL_KEY = "director:cast-sheet-model";

function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

/**
 * Crops the single 3x3 grid image returned by the API into 9 individual
 * shots (row-major, matching CHARACTER_SHEET_SHOTS order), splitting the
 * one-call cost evenly across them so per-member "spent" totals still add
 * up to what was actually billed.
 */
function cropGrid(gridImage: string, cost: number, model?: string): Promise<Record<string, CastMemberShot>> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cellW = img.width / GRID_SIZE;
      const cellH = img.height / GRID_SIZE;
      const perShotCost = cost / CHARACTER_SHEET_SHOTS.length;
      const canvas = document.createElement("canvas");
      canvas.width = cellW;
      canvas.height = cellH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      const shots: Record<string, CastMemberShot> = {};
      CHARACTER_SHEET_SHOTS.forEach((shot, i) => {
        const col = i % GRID_SIZE;
        const row = Math.floor(i / GRID_SIZE);
        ctx.clearRect(0, 0, cellW, cellH);
        ctx.drawImage(img, col * cellW, row * cellH, cellW, cellH, 0, 0, cellW, cellH);
        shots[shot.id] = { image: canvas.toDataURL("image/jpeg", 0.92), cost: perShotCost, model };
      });
      resolve(shots);
    };
    img.onerror = () => reject(new Error("Failed to load generated grid image"));
    img.src = gridImage;
  });
}

/**
 * Full-page cast roster — reference photo + generated 9-shot character
 * sheet per member, persisted to disk (src/lib/castStore.ts) via /api/cast
 * so /stage can read the same roster and let a mannequin be assigned one
 * (see CastPanel.tsx there). Screen Test lives on its own page,
 * /screen-test (src/components/screen-test/ScreenTest.tsx).
 */

// One unreadable project shouldn't hide the rest, so each failure counts as no cast.
async function loadOtherCast(projects: Project[], activeId: string) {
  const lists = await Promise.all(projects.filter((p) => p.id !== activeId).map((project) =>
    loadCast(project.id).then((members) => members.map((member) => ({ project, member })), () => [])));
  return lists.flat();
}

export function Audition() {
  const [cast, setCast] = useState<CastMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [available, setAvailable] = useState<{ project: Project; member: CastMember }[]>([]);
  const [transferBusy, setTransferBusy] = useState(false);
  const [castError, setCastError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [addingFromSheet, setAddingFromSheet] = useState(false);
  const [sheetModels, setSheetModels] = useState<ImageModel[]>([]);
  const [sheetModel, setSheetModel] = useState(CHARACTER_SHEET_MODEL);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/image-models")
      .then((res) => res.json())
      .then((data: { models: ImageModel[] }) => {
        if (cancelled) return;
        setSheetModels(data.models);
        let saved: string | null = null;
        try { saved = localStorage.getItem(SHEET_MODEL_KEY); } catch {}
        if (saved && data.models.some((m) => m.id === saved)) setSheetModel(saved);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function pickSheetModel(id: string) {
    setSheetModel(id);
    try { localStorage.setItem(SHEET_MODEL_KEY, id); } catch {}
  }

  useEffect(() => {
    // Matches Studio.tsx's `takes` load: the roster renders visible DOM, so
    // the first client render has to match the server's (empty) markup —
    // only an effect, not a lazy useState initializer, avoids a hydration
    // mismatch here.
    let cancelled = false;
    loadProjects().then(async ({ projects, activeId }) => {
      const loaded = await loadCast(activeId);
      if (cancelled) return;
      setProjects(projects);
      setProjectId(activeId);
      setCast(loaded);
      const others = await loadOtherCast(projects, activeId);
      if (!cancelled) setAvailable(others);
    }).catch((err) => { if (!cancelled) setCastError(err instanceof Error ? err.message : "Couldn't load cast"); });
    return () => {
      cancelled = true;
    };
  }, []);

  async function addMember() {
    if (!projectId) return;
    const member = await createMember(`Cast ${cast.length + 1}`, projectId);
    setCast((prev) => [...prev, member]);
  }

  async function patchMember(
    id: string,
    patch: Parameters<typeof updateMember>[1]
  ) {
    const updated = await updateMember(id, patch, projectId ?? undefined);
    setCast((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }

  async function handlePhoto(id: string, file: File | null) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    await patchMember(id, { photo: dataUrl });
  }

  async function handleDelete(id: string) {
    await deleteMember(id, projectId ?? undefined);
    setCast((prev) => prev.filter((c) => c.id !== id));
  }

  async function generateSheet(member: CastMember) {
    if (!member.photo || generatingId) return;
    setGeneratingId(member.id);
    try {
      const photoDataUrl = await urlToDataUrl(member.photo);
      const res = await fetch("/api/character-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: photoDataUrl, model: sheetModel }),
      });
      const data = await res.json();
      if (res.ok) {
        const shots = await cropGrid(data.image, data.cost, data.model);
        await patchMember(member.id, { shots });
      }
    } catch {
      // Leave the member's shots unchanged on failure.
    }
    setGeneratingId(null);
  }

  async function handleTransfer(sourceId: string, memberId: string, targetId: string, mode: "copy" | "move") {
    if (!projectId || transferBusy) return;
    setTransferBusy(true);
    setCastError(null);
    try {
      await transferMember(sourceId, memberId, targetId, mode);
      setCast(await loadCast(projectId));
      setAvailable(await loadOtherCast(projects, projectId));
    } catch (err) { setCastError(err instanceof Error ? err.message : "Transfer failed"); }
    finally { setTransferBusy(false); }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-fg">Audition</h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-fg-dim">
            Build your cast — one reference photo per member, a 9-shot character sheet each
          </p>
        </div>
        <div className="flex shrink-0 gap-2 whitespace-nowrap">
          <button
            onClick={() => setAddingFromSheet(true)}
            disabled={!projectId || transferBusy}
            className="rounded-full border border-border px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
          >
            + Add from sheet
          </button>
          <button
            onClick={addMember}
            disabled={!projectId || transferBusy}
            className="rounded-full border border-accent px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-bg"
          >
            + New cast member
          </button>
        </div>
      </div>

      {addingFromSheet && (
        <AddFromSheetForm
          className="mb-6 max-w-sm"
          onAdded={(member) => {
            setCast((prev) => [...prev, member]);
            setAddingFromSheet(false);
          }}
          onCancel={() => setAddingFromSheet(false)}
        />
      )}

      <div className="mb-6">
        <ImageModelSelect label="Image model" models={sheetModels} value={sheetModel} onChange={pickSheetModel} disabled={generatingId !== null} />
      </div>

      {castError && <p role="alert" className="mb-4 text-sm text-warn">{castError}</p>}
      {projectId && cast.length === 0 && !addingFromSheet && (
        <p className="text-[11px] uppercase tracking-[0.2em] text-fg-faint">No cast yet — add one to get started.</p>
      )}

      {projectId && cast.length === 0 && !addingFromSheet && available.length > 0 && (
        <section aria-label="Cast from other projects" className="my-6 flex flex-col gap-3">
          <h2 className="text-sm text-fg">Bring cast from another project</h2>
          {available.map(({ project, member }) => (
            <div key={`${project.id}-${member.id}`} data-testid="available-cast" className="flex items-center gap-4 rounded-xl border border-border bg-bg-panel p-4">
              {(member.photo || member.sheet) && <img src={member.photo || member.sheet} alt={member.name} className="h-12 w-12 rounded-lg object-cover" /> /* eslint-disable-line @next/next/no-img-element */}
              <div className="flex-1 text-sm text-fg">{member.name}<p className="text-xs text-fg-dim">{project.name}</p></div>
              <button type="button" disabled={transferBusy} onClick={() => void handleTransfer(project.id, member.id, projectId, "copy")} className="rounded-full border border-accent px-3 py-2 text-xs text-accent disabled:opacity-40">Bring in</button>
            </div>
          ))}
        </section>
      )}
      <div className="flex flex-col gap-6">
        {cast.map((member) => (
          <CastCard
            key={member.id}
            member={member}
            estimate={IMAGE_PRICE_PER_CALL[sheetModel]}
            models={sheetModels}
            model={sheetModel}
            onModel={pickSheetModel}
            onPatch={(patch) => patchMember(member.id, patch)}
            generating={generatingId === member.id}
            onRename={(name) => patchMember(member.id, { name })}
            onPhoto={(file) => handlePhoto(member.id, file)}
            onGenerate={() => generateSheet(member)}
            onDelete={() => handleDelete(member.id)}
            destinations={projects.filter((p) => p.id !== projectId)}
            transferBusy={transferBusy || generatingId !== null || addingFromSheet}
            onTransfer={(targetId, mode) => projectId ? handleTransfer(projectId, member.id, targetId, mode) : Promise.resolve()}
          />
        ))}
      </div>
    </div>
  );
}

function CastCard({
  member,
  estimate,
  models,
  model,
  onModel,
  onPatch,
  generating,
  onRename,
  onPhoto,
  onGenerate,
  onDelete,
  destinations,
  transferBusy,
  onTransfer,
}: {
  member: CastMember;
  estimate: number | undefined;
  models: ImageModel[];
  model: string;
  onModel: (id: string) => void;
  onPatch: (patch: Parameters<typeof updateMember>[1]) => Promise<CastMember>;
  generating: boolean;
  onRename: (name: string) => void;
  onPhoto: (file: File | null) => void;
  onGenerate: () => void;
  onDelete: () => void;
  destinations: Project[];
  transferBusy: boolean;
  onTransfer: (targetId: string, mode: "copy" | "move") => Promise<void>;
}) {
  const [targetId, setTargetId] = useState("");
  const [viewing, setViewing] = useState<{ src: string; label: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const spent = Object.values(member.shots).reduce((sum, s) => sum + s.cost, 0);
  const hasShots = Object.keys(member.shots).length > 0;
  // A supplied sheet is the member's reference, so the card works with it instead of asking to generate.
  const hasSheet = !!member.sheet;

  return (
    <div className="rounded-2xl border border-border bg-bg-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {hasSheet ? null : member.photo ? (
            <button type="button" onClick={() => setViewing({ src: member.photo, label: member.name })} className="shrink-0 cursor-zoom-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={member.photo} alt={member.name} className="h-20 w-20 rounded-xl object-cover" />
            </button>
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-center text-[9px] uppercase tracking-[0.15em] text-fg-faint">
              no photo
            </div>
          )}
          <div className="flex flex-col gap-2">
            <input
              value={member.name}
              disabled={transferBusy}
              onChange={(e) => onRename(e.target.value)}
              className="bg-transparent text-sm text-fg outline-none"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPhoto(e.target.files?.[0] ?? null)}
            />
            {!hasSheet && (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={transferBusy}
                className="w-fit rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
              >
                {member.photo ? "Change photo" : "Upload photo"}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <CastColorMark color={member.stageColor} />
          {!hasSheet && (
            <span className="text-[10px] uppercase tracking-[0.2em] text-fg-faint">
              {formatEstimate(estimate)}
            </span>
          )}
          <button
            onClick={onDelete}
            disabled={transferBusy}
            className="text-[10px] uppercase tracking-[0.2em] text-fg-faint transition-colors hover:text-accent"
          >
            Remove
          </button>
        </div>
      </div>

      {destinations.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-fg-dim">
          <label className="flex items-center gap-2">Destination project
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} disabled={transferBusy} className="rounded-lg border border-border bg-bg px-2 py-2 text-fg">
              <option value="">Choose project</option>
              {destinations.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <button type="button" disabled={!targetId || transferBusy} onClick={() => void onTransfer(targetId, "copy")} className="rounded-full border border-border px-3 py-2 disabled:opacity-40">Copy to project</button>
          <button type="button" disabled={!targetId || transferBusy} onClick={() => void onTransfer(targetId, "move")} className="rounded-full border border-border px-3 py-2 disabled:opacity-40">Move to project</button>
        </div>
      )}
      {hasSheet && (
        <SheetPanel member={member} models={models} model={model} onModel={onModel} onPatch={onPatch} onView={setViewing} busy={transferBusy} />
      )}
      {member.photo && !hasSheet && (
        <button
          onClick={onGenerate}
          disabled={generating || transferBusy}
          className="mt-4 rounded-full border border-accent px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-bg disabled:opacity-40"
        >
          {generating ? "Generating…" : hasShots ? "Regenerate sheet" : "Generate character sheet"}
        </button>
      )}

      {hasShots && (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-9">
            {CHARACTER_SHEET_SHOTS.map((shot) => {
              const result = member.shots[shot.id];
              return (
                <div key={shot.id} className="flex flex-col items-center gap-1">
                  <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-bg">
                    {result ? (
                      <button type="button" onClick={() => setViewing({ src: result.image, label: shot.label })} className="h-full w-full cursor-zoom-in">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={result.image} alt={shot.label} className="h-full w-full object-cover" />
                      </button>
                    ) : (
                      <span className="text-[9px] text-fg-faint">—</span>
                    )}
                  </div>
                  <span className="text-center text-[8px] uppercase tracking-[0.1em] text-fg-faint">{shot.label}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-right text-[10px] uppercase tracking-[0.15em] text-fg-faint">
            spent ${spent.toFixed(2)}
          </p>
        </>
      )}
      {viewing && <ImageViewer {...viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function formatEstimate(estimate: number | undefined) {
  return estimate === undefined ? "est. unknown" : `est. $${estimate.toFixed(3)}`;
}

const candidateFilename = (url: string) => decodeURIComponent(new URL(url, "http://x").pathname.split("/").pop() ?? "");

const smallButton = "rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg disabled:opacity-40";

/**
 * Main sheet + close-up + candidates, and the edit flow. Every paid edit is
 * saved as a candidate as soon as it returns, so leaving the page loses nothing;
 * Discard deletes it, Replace main promotes it.
 */
function SheetPanel({
  member,
  models,
  model,
  onModel,
  onPatch,
  onView,
  busy,
}: {
  member: CastMember;
  models: ImageModel[];
  model: string;
  onModel: (id: string) => void;
  onPatch: (patch: Parameters<typeof updateMember>[1]) => Promise<CastMember>;
  onView: (v: { src: string; label: string }) => void;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null); // URL of the saved candidate
  const [error, setError] = useState<string | null>(null);
  const candidates = member.candidates ?? [];
  const disabled = busy || running;

  async function runEdit() {
    setRunning(true);
    setError(null);
    try {
      const image = await urlToDataUrl(member.sheet);
      const res = await fetch("/api/image-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, prompt, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Edit failed");
      const updated = await onPatch({ addCandidate: data.image });
      setResult(updated.candidates.at(-1) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Edit failed");
    } finally {
      setRunning(false);
    }
  }

  function closeEdit() {
    setResult(null);
    setEditing(false);
    setPrompt("");
  }

  async function save(patch: Parameters<typeof updateMember>[1]) {
    setRunning(true);
    setError(null);
    try {
      await onPatch(patch);
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setRunning(false);
    }
  }

  const thumb = (src: string, label: string, className = "h-40") => (
    <button type="button" onClick={() => onView({ src, label })} className="cursor-zoom-in">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} className={`${className} rounded-xl border border-border object-contain`} />
    </button>
  );

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        {thumb(member.sheet, `${member.name} sheet`)}
        {member.closeup && thumb(member.closeup, `${member.name} close-up`)}
      </div>

      {candidates.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">Candidates</span>
          <div className="flex flex-wrap gap-3">
            {candidates.map((url, i) => (
              <div key={url} className="flex flex-col items-center gap-1">
                {thumb(url, `${member.name} candidate ${i + 1}`, "h-20")}
                <div className="flex gap-1">
                  <button type="button" disabled={disabled} onClick={() => void save({ promoteCandidate: candidateFilename(url) })} className={smallButton}>Make main</button>
                  <button type="button" aria-label="Delete candidate" disabled={disabled} onClick={() => void save({ deleteCandidate: candidateFilename(url) })} className={smallButton}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!editing ? (
        <button type="button" disabled={busy} onClick={() => setEditing(true)} className={`w-fit ${smallButton}`}>Edit sheet</button>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <textarea
            aria-label="Edit prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should change? e.g. make the jacket red"
            rows={2}
            className="rounded-lg border border-border bg-bg p-2 text-sm text-fg outline-none"
          />
          <div className="flex flex-wrap items-end gap-3">
            <ImageModelSelect label="Edit model" models={models} value={model} onChange={onModel} disabled={disabled} />
            <span className="text-[10px] uppercase tracking-[0.2em] text-fg-faint">{formatEstimate(IMAGE_PRICE_PER_CALL[model])}</span>
            <button type="button" disabled={disabled || !prompt.trim()} onClick={() => void runEdit()} className="rounded-full border border-accent px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-bg disabled:opacity-40">
              {running && !result ? "Editing…" : "Run edit"}
            </button>
            {!result && <button type="button" disabled={running} onClick={closeEdit} className={smallButton}>Cancel</button>}
          </div>
          {error && <p role="alert" className="text-sm text-warn">{error}</p>}
          {result && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-3">
                <figure className="flex flex-col gap-1">
                  {thumb(member.sheet, "Current sheet")}
                  <figcaption className="text-[9px] uppercase tracking-[0.15em] text-fg-faint">Current</figcaption>
                </figure>
                <figure className="flex flex-col gap-1">
                  {thumb(result, "Edited sheet")}
                  <figcaption className="text-[9px] uppercase tracking-[0.15em] text-fg-faint">Edited</figcaption>
                </figure>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={disabled} onClick={() => void save({ deleteCandidate: candidateFilename(result) })} className={smallButton}>Discard</button>
                <button type="button" disabled={disabled} onClick={() => void save({ promoteCandidate: candidateFilename(result) })} className={smallButton}>Replace main</button>
                <button type="button" disabled={disabled} onClick={closeEdit} className={smallButton}>Keep as candidate</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
