"use client";

import { useEffect, useRef, useState } from "react";
import { CHARACTER_SHEET_COST, CHARACTER_SHEET_SHOTS, GRID_SIZE } from "@/lib/characterSheet";
import { createMember, deleteMember, loadCast, updateMember, type CastMember, type CastMemberShot } from "@/lib/cast";
import { colorLabel } from "@/lib/stageColors";
import type { ScreenTestCastRef } from "@/lib/screenTest";
import type { ImageModel } from "@/lib/types";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read blob"));
    reader.readAsDataURL(blob);
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return blobToDataUrl(file);
}

// member.photo is a URL served from disk (see src/lib/cast.ts), not a data
// URL — but /api/character-sheet forwards it straight to the image-gen
// provider as input_references, which needs either a data URL or a
// publicly reachable one. Re-fetching it as a data URL keeps that route
// provider-agnostic instead of teaching it about our on-disk file layout.
async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  return blobToDataUrl(await res.blob());
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
 * (see CastPanel.tsx there).
 */
type ScreenTestResult = { image: string; cost: number; createdAt: number };

export function Audition() {
  const [cast, setCast] = useState<CastMember[]>([]);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [stagePhoto, setStagePhoto] = useState<string | null>(null);
  const [screenTest, setScreenTest] = useState<ScreenTestResult | null>(null);
  const [screenTestBusy, setScreenTestBusy] = useState(false);
  const [screenTestError, setScreenTestError] = useState<string | null>(null);
  const [dopModels, setDopModels] = useState<ImageModel[]>([]);
  const [dopModel, setDopModel] = useState<string>("");

  useEffect(() => {
    // Matches Studio.tsx's `takes` load: the roster renders visible DOM, so
    // the first client render has to match the server's (empty) markup —
    // only an effect, not a lazy useState initializer, avoids a hydration
    // mismatch here.
    let cancelled = false;
    loadCast().then((loaded) => {
      if (!cancelled) setCast(loaded);
    });
    fetch("/api/screen-test")
      .then((res) => (res.ok ? res.json() : null))
      .then((loaded) => {
        if (!cancelled && loaded) setScreenTest(loaded);
      })
      .catch(() => {});
    // "DoP" picker — which OpenRouter image model generates the screen
    // test. Fetched live so the catalog doesn't go stale in this file.
    fetch("/api/image-models")
      .then((res) => res.json())
      .then((data: { models: ImageModel[]; default: string }) => {
        if (cancelled) return;
        setDopModels(data.models);
        setDopModel(data.default);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function addMember() {
    const member = await createMember(`Cast ${cast.length + 1}`);
    setCast((prev) => [...prev, member]);
  }

  async function patchMember(
    id: string,
    patch: { name?: string; photo?: string; shots?: Record<string, CastMemberShot> }
  ) {
    const updated = await updateMember(id, patch);
    setCast((prev) => prev.map((c) => (c.id === id ? updated : c)));
  }

  async function handlePhoto(id: string, file: File | null) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    await patchMember(id, { photo: dataUrl });
  }

  async function handleDelete(id: string) {
    await deleteMember(id);
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

  const assignedCast = cast.filter((c) => c.stageColor);

  async function handleStagePhoto(file: File | null) {
    if (!file) return;
    setStagePhoto(await fileToDataUrl(file));
  }

  async function generateScreenTest() {
    if (!stagePhoto || assignedCast.length === 0 || screenTestBusy) return;
    setScreenTestBusy(true);
    setScreenTestError(null);
    try {
      const castRefs: (ScreenTestCastRef & { photo: string })[] = await Promise.all(
        assignedCast.map(async (c) => ({
          name: c.name,
          colorLabel: colorLabel(c.stageColor as string),
          // Prefer the character sheet's front-angle shot (full-body,
          // neutral pose) over the raw reference photo when one exists —
          // it composites into a stage position far more reliably.
          photo: await urlToDataUrl(c.shots["angle-front"]?.image ?? c.photo),
        }))
      );
      const res = await fetch("/api/screen-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stagePhoto, cast: castRefs, model: dopModel || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setScreenTest(data);
      } else {
        setScreenTestError(data.error ?? "Screen test failed");
      }
    } catch {
      setScreenTestError("Screen test failed");
    }
    setScreenTestBusy(false);
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
        <button
          onClick={addMember}
          className="rounded-full border border-accent px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-bg"
        >
          + New cast member
        </button>
      </div>

      {cast.length === 0 && (
        <p className="text-[11px] uppercase tracking-[0.2em] text-fg-faint">No cast yet — add one to get started.</p>
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
          />
        ))}
      </div>

      <ScreenTestSection
        assignedCast={assignedCast}
        stagePhoto={stagePhoto}
        onStagePhoto={handleStagePhoto}
        busy={screenTestBusy}
        error={screenTestError}
        result={screenTest}
        onGenerate={generateScreenTest}
        dopModels={dopModels}
        dopModel={dopModel}
        onDopModel={setDopModel}
      />
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
}: {
  member: CastMember;
  generating: boolean;
  onRename: (name: string) => void;
  onPhoto: (file: File | null) => void;
  onGenerate: () => void;
  onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const spent = Object.values(member.shots).reduce((sum, s) => sum + s.cost, 0);
  const hasShots = Object.keys(member.shots).length > 0;

  return (
    <div className="rounded-2xl border border-border bg-bg-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {member.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photo} alt={member.name} className="h-20 w-20 rounded-xl object-cover" />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-center text-[9px] uppercase tracking-[0.15em] text-fg-faint">
              no photo
            </div>
          )}
          <div className="flex flex-col gap-2">
            <input
              value={member.name}
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
              className="w-fit rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
            >
              {member.photo ? "Change photo" : "Upload photo"}
            </button>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-fg-faint">
            est. ${CHARACTER_SHEET_COST.toFixed(2)}
          </span>
          <button
            onClick={onDelete}
            className="text-[10px] uppercase tracking-[0.2em] text-fg-faint transition-colors hover:text-accent"
          >
            Remove
          </button>
        </div>
      </div>

      {member.photo && (
        <button
          onClick={onGenerate}
          disabled={generating}
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

/**
 * Composites a captured /stage photo with whichever cast members are
 * currently assigned to a color-coded mannequin there (assignment happens
 * in CastPanel.tsx on /stage, which copies the mannequin's color onto the
 * cast member's `stageColor`). "Capture photo" on /stage downloads a PNG of
 * the current camera view — for now, screen test needs that file re-
 * uploaded here rather than grabbing the live canvas directly.
 */
function ScreenTestSection({
  assignedCast,
  stagePhoto,
  onStagePhoto,
  busy,
  error,
  result,
  onGenerate,
  dopModels,
  dopModel,
  onDopModel,
}: {
  assignedCast: CastMember[];
  stagePhoto: string | null;
  onStagePhoto: (file: File | null) => void;
  busy: boolean;
  error: string | null;
  result: ScreenTestResult | null;
  onGenerate: () => void;
  dopModels: ImageModel[];
  dopModel: string;
  onDopModel: (id: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canGenerate = !!stagePhoto && assignedCast.length > 0 && !busy;
  const selectedDop = dopModels.find((m) => m.id === dopModel);

  return (
    <div className="mt-10 border-t border-border pt-8">
      <h2 className="font-display text-xl text-fg">Screen Test</h2>
      <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-fg-dim">
        Upload a captured /stage photo — its color-coded mannequins get swapped for whichever cast is assigned to that color
      </p>

      <div className="mt-5 flex flex-wrap items-start gap-6">
        <div className="flex flex-col gap-2">
          {stagePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={stagePhoto} alt="Captured stage" className="h-32 w-48 rounded-xl object-cover" />
          ) : (
            <div className="flex h-32 w-48 items-center justify-center rounded-xl border border-dashed border-border text-center text-[9px] uppercase tracking-[0.15em] text-fg-faint">
              no stage photo
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onStagePhoto(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-fit rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
          >
            {stagePhoto ? "Change stage photo" : "Upload stage photo"}
          </button>
        </div>

        <div className="flex min-w-48 flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            {assignedCast.length === 0 ? "No cast assigned on stage" : "Cast assigned on stage"}
          </span>
          {assignedCast.length === 0 ? (
            <p className="text-[10px] uppercase tracking-[0.15em] text-fg-faint">
              Assign cast to mannequins on /stage to enable a screen test.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {assignedCast.map((member) => (
                <span key={member.id} className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-fg-dim">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: member.stageColor ?? undefined }}
                  />
                  {member.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-56 flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">DoP — Director of Photography</span>
          <select
            value={dopModel}
            onChange={(e) => onDopModel(e.target.value)}
            disabled={dopModels.length === 0}
            className="rounded-full border border-border bg-transparent px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-fg outline-none disabled:opacity-40"
          >
            {dopModels.map((m) => (
              <option key={m.id} value={m.id} className="bg-bg-panel normal-case tracking-normal">
                {m.provider} — {m.label}
              </option>
            ))}
          </select>
          {selectedDop?.tagline && (
            <p className="text-[9px] uppercase tracking-[0.1em] text-fg-faint">{selectedDop.tagline}</p>
          )}
        </div>

        <button
          onClick={onGenerate}
          disabled={!canGenerate}
          className="h-fit rounded-full border border-accent px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-bg disabled:opacity-40"
        >
          {busy ? "Generating…" : "Generate screen test"}
        </button>
      </div>

      {error && <p className="mt-3 text-[10px] uppercase tracking-[0.15em] text-accent">{error}</p>}

      {result && (
        <div className="mt-6 flex flex-col items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={result.image} alt="Screen test composite" className="max-w-xl rounded-xl border border-border" />
          <p className="text-[10px] uppercase tracking-[0.15em] text-fg-faint">
            cost ${result.cost.toFixed(2)} · {new Date(result.createdAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
