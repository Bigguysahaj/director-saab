"use client";

export function Slate({ live, takeCount }: { live: boolean; takeCount: number }) {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <div className="flex items-baseline gap-3">
        <h1 className="font-display italic text-lg tracking-tight">Director</h1>
        <span className="text-[10px] tracking-[0.2em] text-fg-faint uppercase">
          Take {String(takeCount + 1).padStart(2, "0")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            live ? "bg-accent animate-tally" : "bg-warn"
          }`}
        />
        <span className="text-[10px] tracking-[0.2em] uppercase text-fg-dim">
          {live ? "Live" : "Demo mode"}
        </span>
      </div>
    </header>
  );
}
