"use client";

import type { Take } from "@/lib/types";

function Sprockets() {
  return (
    <div className="flex shrink-0 flex-col justify-around px-1.5 py-1">
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="h-1 w-1.5 rounded-[1px] bg-bg" />
      ))}
    </div>
  );
}

export function Dailies({
  takes,
  onSelect,
  onRemove,
}: {
  takes: Take[];
  onSelect: (take: Take) => void;
  onRemove: (id: string) => void;
}) {
  if (takes.length === 0) return null;

  return (
    <div className="border-t border-border bg-bg-raised">
      <div className="flex items-center gap-2 px-6 pt-3">
        <span className="text-[10px] tracking-[0.2em] text-fg-faint uppercase">
          Dailies
        </span>
        <span className="text-[10px] text-fg-faint">({takes.length})</span>
      </div>
      <div className="flex gap-3 overflow-x-auto px-6 py-3">
        {takes.map((take) => (
          <div
            key={take.id}
            className="group relative flex shrink-0 items-stretch overflow-hidden rounded-sm border border-border bg-black"
          >
            <Sprockets />
            <button
              type="button"
              onClick={() => onSelect(take)}
              className="flex w-36 cursor-pointer flex-col justify-between p-2 text-left"
            >
              <span
                className={`text-[9px] uppercase tracking-wider ${
                  take.status === "completed"
                    ? "text-ok"
                    : take.status === "failed"
                    ? "text-warn"
                    : "text-fg-dim"
                }`}
              >
                {take.status}
              </span>
              <span className="line-clamp-2 font-mono text-[11px] text-fg-dim">
                {take.prompt}
              </span>
              <span className="text-[9px] text-fg-faint">{take.modelLabel}</span>
            </button>
            <Sprockets />
            <button
              type="button"
              onClick={() => onRemove(take.id)}
              className="absolute right-1 top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-bg-raised text-[10px] text-fg-dim hover:text-accent group-hover:flex cursor-pointer"
              aria-label="Remove take"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
