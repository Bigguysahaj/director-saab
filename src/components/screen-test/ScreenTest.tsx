"use client";

import { useEffect, useRef, useState } from "react";
import { blobToDataUrl, loadCast, urlToDataUrl, type CastMember } from "@/lib/cast";
import { colorLabel } from "@/lib/stageColors";
import type { ScreenTestCastRef } from "@/lib/screenTest";
import type { ImageModel } from "@/lib/types";

type ScreenTestResult = { image: string; cost: number; createdAt: number };

/** /screen-test: the cast assigned on /stage composited into a stage photo. */
export function ScreenTest() {
  const [cast, setCast] = useState<CastMember[]>([]);
  const [stagePhoto, setStagePhoto] = useState<string | null>(null);
  const [screenTest, setScreenTest] = useState<ScreenTestResult | null>(null);
  const [screenTestBusy, setScreenTestBusy] = useState(false);
  const [screenTestError, setScreenTestError] = useState<string | null>(null);
  const [dopModels, setDopModels] = useState<ImageModel[]>([]);
  const [dopModel, setDopModel] = useState<string>("");

  useEffect(() => {
    // Fetched in an effect (not a lazy initializer) so the first client
    // render matches the server's empty markup — same as Audition.tsx.
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

  const assignedCast = cast.filter((c) => c.stageColor);

  async function handleStagePhoto(file: File | null) {
    if (!file) return;
    setStagePhoto(await blobToDataUrl(file));
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
          // it composites into a stage position far more reliably. Cast
          // added from a ready-made sheet has neither, so use the sheet.
          photo: await urlToDataUrl(c.shots["angle-front"]?.image ?? (c.photo || c.sheet)),
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
    <div>
      <h1 className="font-display text-2xl text-fg">Screen Test</h1>
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
