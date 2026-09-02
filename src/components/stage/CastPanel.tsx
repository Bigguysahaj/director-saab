"use client";

import { useRef, useState } from "react";
import { CHARACTER_SHEET_COST, CHARACTER_SHEET_SHOTS, type CharacterShot } from "@/lib/characterSheet";

type ShotResult = { image: string; cost: number } | { error: string };

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * "+ Cast" popover: upload one reference photo, generate the full 9-shot
 * character sheet (4 angles + 5 expressions) via /api/character-sheet, one
 * request per shot so a failed or re-rolled shot doesn't cost or redo the
 * rest. Purely a reference-sheet browser for now — results aren't attached
 * to a mannequin or persisted across reloads (see TODO.md).
 */
export function CastPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const [photo, setPhoto] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ShotResult>>({});
  const [generating, setGenerating] = useState(false);
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    setPhoto(dataUrl);
    setResults({});
  }

  async function generateShot(shot: CharacterShot, referencePhoto: string) {
    setCurrentLabel(shot.label);
    try {
      const res = await fetch("/api/character-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: referencePhoto, shotId: shot.id }),
      });
      const data = await res.json();
      setResults((prev) => ({
        ...prev,
        [shot.id]: res.ok ? { image: data.image, cost: data.cost } : { error: data.error ?? "Generation failed" },
      }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [shot.id]: { error: err instanceof Error ? err.message : "Network error" },
      }));
    }
  }

  async function generateAll() {
    if (!photo || generating) return;
    setGenerating(true);
    // Sequential, not Promise.all — image generation is billed per call, so
    // this keeps the "generating <label>" status meaningful and avoids
    // firing 9 requests at once against whatever rate limit the provider has.
    for (const shot of CHARACTER_SHEET_SHOTS) {
      await generateShot(shot, photo);
    }
    setGenerating(false);
    setCurrentLabel(null);
  }

  const spent = Object.values(results).reduce((sum, r) => ("cost" in r ? sum + r.cost : sum), 0);
  const hasResults = Object.keys(results).length > 0;

  return (
    <div className="relative">
      {open && (
        <div className="absolute bottom-full left-0 mb-2 flex w-[420px] flex-col gap-3 rounded-2xl border border-border bg-bg-panel p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">Cast — character sheet</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-fg-faint">
              est. ${CHARACTER_SHEET_COST.toFixed(2)}
            </span>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex items-center gap-3">
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Reference" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
            )}
            <button
              onClick={() => fileRef.current?.click()}
              className="flex-1 rounded-full border border-dashed border-border px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
            >
              {photo ? "Change reference photo" : "Upload reference photo"}
            </button>
          </div>

          {photo && (
            <button
              onClick={generateAll}
              disabled={generating}
              className="rounded-full border border-accent px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-bg disabled:opacity-40"
            >
              {generating ? `Generating — ${currentLabel ?? "…"}` : hasResults ? "Regenerate sheet" : "Generate character sheet"}
            </button>
          )}

          {hasResults && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {CHARACTER_SHEET_SHOTS.map((shot) => {
                  const result = results[shot.id];
                  return (
                    <div key={shot.id} className="flex flex-col items-center gap-1">
                      <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-bg">
                        {result && "image" in result ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={result.image} alt={shot.label} className="h-full w-full object-cover" />
                        ) : result && "error" in result ? (
                          <span title={result.error} className="px-1 text-center text-[9px] text-fg-faint">
                            error
                          </span>
                        ) : (
                          <span className="text-[9px] text-fg-faint">—</span>
                        )}
                      </div>
                      <span className="text-[9px] uppercase tracking-[0.1em] text-fg-faint">{shot.label}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-right text-[10px] uppercase tracking-[0.15em] text-fg-faint">
                spent ${spent.toFixed(2)}
              </p>
            </>
          )}
        </div>
      )}
      <button
        onClick={onToggle}
        className={`rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.2em] transition-colors ${
          open ? "border-accent bg-accent text-bg" : "border-border bg-bg-panel text-fg-dim hover:border-accent hover:text-fg"
        }`}
      >
        {open ? "× Cast" : "+ Cast"}
      </button>
    </div>
  );
}
