"use client";

function dims(ratio: string): { w: number; h: number } {
  const [w, h] = ratio.split(":").map(Number);
  const scale = 18 / Math.max(w, h);
  return { w: Math.max(6, w * scale), h: Math.max(6, h * scale) };
}

export function AspectRatioSwatches({
  options,
  value,
  onChange,
  disabled,
}: {
  options: string[];
  value: string | undefined;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] tracking-[0.2em] text-fg-faint uppercase">
        Frame
      </span>
      <div
        className={`flex flex-wrap gap-1.5 rounded-sm border border-border bg-bg-panel p-1.5 ${
          disabled ? "opacity-40" : ""
        }`}
      >
        {options.map((ratio) => {
          const { w, h } = dims(ratio);
          const active = value === ratio;
          return (
            <button
              key={ratio}
              type="button"
              disabled={disabled}
              onClick={() => onChange(ratio)}
              title={ratio}
              className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-sm cursor-pointer transition-colors ${
                active ? "bg-accent-soft" : "hover:bg-bg-panel-hover"
              }`}
            >
              <span
                className="border"
                style={{
                  width: w,
                  height: h,
                  borderColor: active ? "var(--accent)" : "var(--fg-faint)",
                }}
              />
              <span
                className={`text-[10px] font-mono ${
                  active ? "text-accent" : "text-fg-dim"
                }`}
              >
                {ratio}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
