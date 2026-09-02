"use client";

import { useEffect, useRef, useState } from "react";
import { CHARACTER_SHEET_COST, CHARACTER_SHEET_SHOTS, type CharacterShot } from "@/lib/characterSheet";
import { loadCast, saveCast, removeCastMember, type CastMember, type CastMemberShot } from "@/lib/cast";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function newMemberId(): string {
  return `cast-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function generateShot(photo: string, shot: CharacterShot): Promise<CastMemberShot | null> {
  try {
    const res = await fetch("/api/character-sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo, shotId: shot.id }),
    });
    const data = await res.json();
    return res.ok ? { image: data.image, cost: data.cost } : null;
  } catch {
    return null;
  }
}

/**
 * Full-page cast roster — reference photo + generated 9-shot character
 * sheet per member, persisted to localStorage so /stage can read the same
 * roster and let a mannequin be assigned one (see CastPanel.tsx there).
 */
export function Audition() {
  const [cast, setCast] = useState<CastMember[]>([]);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);

  useEffect(() => {
    // Matches Studio.tsx's `takes` load: the roster renders visible DOM, so
    // the first client render has to match the server's (empty) markup —
    // only an effect, not a lazy useState initializer, avoids a hydration
    // mismatch here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCast(loadCast());
  }, []);

  function persist(next: CastMember[]) {
    setCast(next);
    saveCast(next);
  }

  function addMember() {
    const member: CastMember = { id: newMemberId(), name: `Cast ${cast.length + 1}`, photo: "", shots: {} };
    persist([...cast, member]);
  }

  function updateMember(id: string, patch: Partial<CastMember>) {
    persist(cast.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function handlePhoto(id: string, file: File | null) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    updateMember(id, { photo: dataUrl, shots: {} });
  }

  async function generateSheet(member: CastMember) {
    if (!member.photo || generatingId) return;
    setGeneratingId(member.id);
    // Sequential, not Promise.all — image generation is billed per call, so
    // this keeps the "generating <label>" status meaningful, avoids firing
    // 9 requests at once against whatever rate limit the provider has, and
    // persists after every shot so a failure partway through doesn't lose
    // the ones that already succeeded.
    for (const shot of CHARACTER_SHEET_SHOTS) {
      setCurrentLabel(shot.label);
      const result = await generateShot(member.photo, shot);
      if (result) {
        setCast((prev) => {
          const next = prev.map((c) => (c.id === member.id ? { ...c, shots: { ...c.shots, [shot.id]: result } } : c));
          saveCast(next);
          return next;
        });
      }
    }
    setGeneratingId(null);
    setCurrentLabel(null);
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
            currentLabel={generatingId === member.id ? currentLabel : null}
            onRename={(name) => updateMember(member.id, { name })}
            onPhoto={(file) => handlePhoto(member.id, file)}
            onGenerate={() => generateSheet(member)}
            onDelete={() => persist(removeCastMember(cast, member.id))}
          />
        ))}
      </div>
    </div>
  );
}

function CastCard({
  member,
  generating,
  currentLabel,
  onRename,
  onPhoto,
  onGenerate,
  onDelete,
}: {
  member: CastMember;
  generating: boolean;
  currentLabel: string | null;
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
          {generating ? `Generating — ${currentLabel ?? "…"}` : hasShots ? "Regenerate sheet" : "Generate character sheet"}
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
