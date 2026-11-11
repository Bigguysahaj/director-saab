"use client";

import { useEffect } from "react";

/** Full-size image popup with Download; Esc, Close or a click outside closes it. */
export function ImageViewer({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={label} onClick={onClose} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} onClick={(e) => e.stopPropagation()} className="max-h-[80vh] max-w-full rounded-xl object-contain" />
      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
        <a href={src} download={label.replace(/[^\w-]+/g, "-")} className="rounded-full border border-accent px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-accent hover:bg-accent hover:text-bg">Download</a>
        <button type="button" onClick={onClose} className="rounded-full border border-border px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim hover:text-fg">Close</button>
      </div>
    </div>
  );
}
