"use client";

import { useEffect, useRef, useState } from "react";
import { blobToDataUrl, loadCast, urlToDataUrl, type CastMember } from "@/lib/cast";
import { colorLabel } from "@/lib/stageColors";
import { IMAGE_PRICE_PER_CALL } from "@/lib/imageModels";
import type { ImageModel } from "@/lib/types";
import { ImageModelSelect } from "@/components/ImageModelSelect";
import { ImageViewer } from "@/components/ImageViewer";
import { CastImageTicks, castImageOptions, defaultCastImages } from "@/components/CastImageTicks";

type ScreenTestEntry = {
  id: string;
  image: string;
  cost: number | null;
  createdAt: number;
  prompt: string;
  model: string;
  inputs: { kind: "edit" | "cast" | "stage"; cast: string[]; image: boolean };
};

const pill = "rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors disabled:opacity-40";

/**
 * /screen-test: one paid image from any mix of a dropped image, cast members
 * and a prompt. Ticking "This is a /stage photo" runs the mannequin swap
 * (screenTest.ts) with the cast assigned on /stage. Every result is kept in
 * the history below.
 */
export function ScreenTest() {
  const [cast, setCast] = useState<CastMember[]>([]);
  const [image, setImage] = useState<string | null>(null);
  const [isStage, setIsStage] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [ticks, setTicks] = useState<Record<string, string[]>>({});
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState<ImageModel[]>([]);
  const [model, setModel] = useState("");
  const [history, setHistory] = useState<ScreenTestEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ src: string; label: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Fetched in an effect (not a lazy initializer) so the first client
    // render matches the server's empty markup — same as Audition.tsx.
    let cancelled = false;
    loadCast().then((loaded) => {
      if (!cancelled) setCast(loaded);
    });
    fetch("/api/screen-test")
      .then((res) => (res.ok ? res.json() : []))
      .then((loaded: ScreenTestEntry[]) => {
        if (!cancelled && Array.isArray(loaded)) setHistory(loaded);
      })
      .catch(() => {});
    fetch("/api/image-models")
      .then((res) => res.json())
      .then((data: { models: ImageModel[]; default: string }) => {
        if (cancelled) return;
        setModels(data.models);
        setModel(data.default);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const stageMode = isStage && !!image;
  const chosen = stageMode ? cast.filter((c) => c.stageColor) : cast.filter((c) => picked.includes(c.id));
  const memberImages = (c: CastMember) => ticks[c.id] ?? defaultCastImages(c);
  // A member with nothing ticked is left out of the run.
  const sending = chosen.filter((c) => memberImages(c).length > 0);
  const imageCount = (image ? 1 : 0) + sending.reduce((n, c) => n + memberImages(c).length, 0);
  const cap = models.find((m) => m.id === model)?.maxInputReferences;
  const overCap = cap !== undefined && imageCount > cap;
  const ready = stageMode ? sending.length > 0 : !!prompt.trim() && (!!image || sending.length > 0);
  const estimate = IMAGE_PRICE_PER_CALL[model];

  async function takeFile(file: File | null | undefined) {
    if (file) setImage(await blobToDataUrl(file));
  }

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  async function generate() {
    if (!ready || overCap || busy) return;
    setBusy(true);
    setError(null);
    try {
      const castRefs = await Promise.all(
        sending.map(async (c) => ({
          name: c.name,
          ...(stageMode ? { colorLabel: colorLabel(c.stageColor as string) } : {}),
          images: await Promise.all(memberImages(c).map(urlToDataUrl)),
        }))
      );
      const body = stageMode
        ? { stagePhoto: image, cast: castRefs, prompt: prompt.trim() || undefined, model: model || undefined }
        : { image: image ?? undefined, cast: castRefs.length ? castRefs : undefined, prompt: prompt.trim(), model: model || undefined };
      const res = await fetch("/api/screen-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) setHistory((prev) => [data, ...prev]);
      else setError(data.error ?? "Screen test failed");
    } catch {
      setError("Screen test failed");
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="font-display text-2xl text-fg">Screen Test</h1>
      <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-fg-dim">
        Drop an image, pick cast, say what you want — one image per run
      </p>

      <div className="mt-5 flex flex-wrap items-start gap-6">
        <div className="flex flex-col gap-2">
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop an image"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void takeFile(e.dataTransfer.files?.[0]);
            }}
            className="flex h-32 w-48 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border text-center text-[9px] uppercase tracking-[0.15em] text-fg-faint hover:border-accent"
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Dropped image" className="h-full w-full object-cover" />
            ) : (
              "Drop an image or click"
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void takeFile(e.target.files?.[0])} />
          {image && (
            <div className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-fg-dim">
                <input type="checkbox" checked={isStage} onChange={(e) => setIsStage(e.target.checked)} />
                This is a /stage photo
              </label>
              <button type="button" onClick={() => { setImage(null); setIsStage(false); }} className={`w-fit border-border text-fg-dim hover:text-fg ${pill}`}>
                Remove image
              </button>
            </div>
          )}
        </div>

        <div className="flex min-w-48 flex-col gap-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            {stageMode ? "Cast assigned on stage" : "Cast"}
          </span>
          {cast.length === 0 && <p className="text-[10px] uppercase tracking-[0.15em] text-fg-faint">No cast yet — add some on the Cast page.</p>}
          <div className="flex flex-wrap gap-2">
            {cast.map((c) => {
              const on = chosen.includes(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  disabled={stageMode || castImageOptions(c).length === 0}
                  onClick={() => toggle(c.id)}
                  className={`flex items-center gap-2 ${pill} ${on ? "border-accent text-accent" : "border-border text-fg-dim hover:text-fg"}`}
                >
                  {c.stageColor && <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-border" style={{ backgroundColor: c.stageColor }} />}
                  {c.name}
                </button>
              );
            })}
          </div>
          {chosen.map((c) => (
            <div key={c.id} className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.15em] text-fg-faint">{c.name}</span>
              <CastImageTicks member={c} onChange={(urls) => setTicks((prev) => ({ ...prev, [c.id]: urls }))} />
            </div>
          ))}
          {stageMode && chosen.length === 0 && (
            <p className="text-[10px] uppercase tracking-[0.15em] text-fg-faint">Assign cast to mannequins on /stage first.</p>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <textarea
          aria-label="Prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={stageMode ? "Optional note, e.g. make it dusk" : "What should the shot be? e.g. make it night, Ana hands Ben a letter"}
          rows={2}
          className="min-w-72 flex-1 rounded-lg border border-border bg-bg p-2 text-sm text-fg outline-none"
        />
        <ImageModelSelect label="DoP — Director of Photography" models={models} value={model} onChange={setModel} />
        <span className="text-[10px] uppercase tracking-[0.2em] text-fg-faint">
          {estimate === undefined ? "est. unknown" : `est. $${estimate.toFixed(3)}`}
        </span>
        <button
          onClick={() => void generate()}
          disabled={!ready || overCap || busy}
          className={`h-fit border-accent px-4 py-2 text-accent hover:bg-accent hover:text-bg ${pill}`}
        >
          {busy ? "Generating…" : "Generate screen test"}
        </button>
      </div>

      {overCap && (
        <p role="alert" className="mt-3 text-[10px] uppercase tracking-[0.15em] text-warn">
          {imageCount} images — this model takes {cap}. Pick fewer cast or another model.
        </p>
      )}
      {error && <p role="alert" className="mt-3 text-[10px] uppercase tracking-[0.15em] text-accent">{error}</p>}

      {history.length > 0 && (
        <section aria-label="History" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {history.map((h) => {
            const label = `Screen test: ${h.prompt || h.inputs.kind}`;
            return (
              <figure key={h.id} className="flex flex-col gap-2 rounded-xl border border-border bg-bg-panel p-3">
                <button type="button" onClick={() => setViewing({ src: h.image, label })} className="cursor-zoom-in">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={h.image} alt={label} className="w-full rounded-lg object-contain" />
                </button>
                <figcaption className="flex flex-col gap-1 text-[10px] text-fg-dim">
                  {h.prompt && <span className="text-sm text-fg">{h.prompt}</span>}
                  {h.inputs.cast.length > 0 && <span>Cast: {h.inputs.cast.join(", ")}</span>}
                  <span className="flex flex-wrap gap-2 uppercase tracking-[0.15em] text-fg-faint">
                    {h.model && <span>{h.model}</span>}
                    <span>{h.cost === null ? "cost unknown" : `$${h.cost.toFixed(3)}`}</span>
                    <span>{new Date(h.createdAt).toLocaleString()}</span>
                  </span>
                </figcaption>
              </figure>
            );
          })}
        </section>
      )}

      {viewing && <ImageViewer {...viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
