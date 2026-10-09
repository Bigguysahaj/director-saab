"use client";

import { useEffect, useRef, useState } from "react";
import { CHARACTER_SHEET_COST, CHARACTER_SHEET_SHOTS, GRID_SIZE } from "@/lib/characterSheet";
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
import { CastColorMark } from "./CastColorMark";

function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

/**
 * Crops the single 3x3 grid image returned by the API into 9 individual
 * shots (row-major, matching CHARACTER_SHEET_SHOTS order), splitting the
 * one-call cost evenly across them so per-member "spent" totals still add
 * up to what was actually billed.
 */
function cropGrid(gridImage: string, cost: number): Promise<Record<string, CastMemberShot>> {
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
        shots[shot.id] = { image: canvas.toDataURL("image/jpeg", 0.92), cost: perShotCost };
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
    patch: { name?: string; photo?: string; shots?: Record<string, CastMemberShot> }
  ) {
    const updated = await updateMember(id, patch, projectId ?? undefined);
    setCast((prev) => prev.map((c) => (c.id === id ? updated : c)));
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
        body: JSON.stringify({ photo: photoDataUrl }),
      });
      const data = await res.json();
      if (res.ok) {
        const shots = await cropGrid(data.image, data.cost);
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
  const fileRef = useRef<HTMLInputElement | null>(null);
  const spent = Object.values(member.shots).reduce((sum, s) => sum + s.cost, 0);
  const hasShots = Object.keys(member.shots).length > 0;

  return (
    <div className="rounded-2xl border border-border bg-bg-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {member.photo || member.sheet ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photo || member.sheet} alt={member.name} className="h-20 w-20 rounded-xl object-cover" />
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
            <button
              onClick={() => fileRef.current?.click()}
              disabled={transferBusy}
              className="w-fit rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
            >
              {member.photo ? "Change photo" : "Upload photo"}
            </button>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <CastColorMark color={member.stageColor} />
          <span className="text-[10px] uppercase tracking-[0.2em] text-fg-faint">
            est. ${CHARACTER_SHEET_COST.toFixed(2)}
          </span>
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
      {member.photo && (
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
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={result.image} alt={shot.label} className="h-full w-full object-cover" />
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
    </div>
  );
}
