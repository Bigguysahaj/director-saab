"use client";

import type { GenerationStatus } from "@/lib/types";

export function Viewer({
  aspectRatio,
  status,
  videoUrl,
  error,
  prompt,
}: {
  aspectRatio: string;
  status: GenerationStatus | "idle";
  videoUrl: string | null;
  error: string | null;
  prompt: string;
}) {
  const [w, h] = aspectRatio.split(":").map(Number);
  const rolling = status === "pending" || status === "in_progress";

  return (
    <div
      className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-sm border border-border bg-black"
      style={{ aspectRatio: `${w || 16} / ${h || 9}` }}
    >
      {status === "completed" && videoUrl ? (
        <video
          key={videoUrl}
          src={videoUrl}
          controls
          autoPlay
          loop
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 text-center">
          {rolling && (
            <div className="absolute inset-0 overflow-hidden">
              <div className="animate-scan absolute inset-x-0 h-1/3 bg-gradient-to-b from-transparent via-accent-soft to-transparent" />
            </div>
          )}
          {status === "failed" || status === "cancelled" || status === "expired" ? (
            <>
              <span className="text-[10px] tracking-[0.2em] uppercase text-warn">
                Cut — {status}
              </span>
              <p className="max-w-sm text-xs text-fg-dim">
                {error ?? "The take didn't complete."}
              </p>
            </>
          ) : rolling ? (
            <>
              <span className="h-2 w-2 animate-tally rounded-full bg-accent" />
              <span className="text-[10px] tracking-[0.3em] uppercase text-fg-dim">
                Rolling
              </span>
              <p className="max-w-sm text-xs text-fg-faint font-mono line-clamp-3">
                {prompt}
              </p>
            </>
          ) : (
            <>
              <span className="font-display italic text-2xl text-fg-faint">
                Scene 1, Take 1
              </span>
              <p className="text-[11px] text-fg-faint">
                Write the shot below and call action.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
