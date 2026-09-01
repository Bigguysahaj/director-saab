"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoModel } from "@/lib/types";

export function ModelPicker({
  models,
  value,
  onChange,
  disabled,
}: {
  models: VideoModel[];
  value: VideoModel | undefined;
  onChange: (m: VideoModel) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const groups = models.reduce<Record<string, VideoModel[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-1.5 relative" ref={ref}>
      <span className="text-[10px] tracking-[0.2em] text-fg-faint uppercase">
        Stock
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-3 rounded-sm border border-border bg-bg-panel px-3 py-2 text-left hover:border-border-strong transition-colors cursor-pointer disabled:opacity-40"
      >
        <span className="flex flex-col">
          <span className="text-sm font-display italic">
            {value?.label ?? "Select a model"}
          </span>
          {value?.tagline && (
            <span className="text-[11px] text-fg-dim">{value.tagline}</span>
          )}
        </span>
        {value?.price_per_second != null && (
          <span className="text-[10px] font-mono text-fg-faint whitespace-nowrap">
            from ${value.price_per_second.toFixed(4)}/s
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-72 max-h-80 overflow-y-auto rounded-sm border border-border-strong bg-bg-raised shadow-2xl z-20">
          {Object.entries(groups).map(([provider, list]) => (
            <div key={provider}>
              <div className="px-3 pt-2.5 pb-1 text-[10px] tracking-[0.2em] text-fg-faint uppercase">
                {provider}
              </div>
              {list.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onChange(m);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-bg-panel-hover transition-colors cursor-pointer ${
                    value?.id === m.id ? "bg-accent-soft" : ""
                  }`}
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-display italic">{m.label}</span>
                    {m.tagline && (
                      <span className="text-[11px] text-fg-dim">{m.tagline}</span>
                    )}
                  </span>
                  {m.price_per_second != null && (
                    <span className="text-[10px] font-mono text-fg-faint whitespace-nowrap">
                      from ${m.price_per_second.toFixed(4)}/s
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
