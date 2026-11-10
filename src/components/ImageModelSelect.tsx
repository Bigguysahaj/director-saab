import type { ImageModel } from "@/lib/types";

/** Image-model dropdown fed by /api/image-models; shared by Screen Test and the Cast page. */
export function ImageModelSelect({
  label,
  models,
  value,
  onChange,
  disabled,
}: {
  label: string;
  models: ImageModel[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const selected = models.find((m) => m.id === value);
  return (
    <div className="flex min-w-56 flex-col gap-2">
      <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || models.length === 0}
        className="rounded-full border border-border bg-transparent px-3 py-1.5 text-[10px] uppercase tracking-[0.15em] text-fg outline-none disabled:opacity-40"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id} className="bg-bg-panel normal-case tracking-normal">
            {m.provider} — {m.label}
          </option>
        ))}
      </select>
      {selected?.tagline && (
        <p className="text-[9px] uppercase tracking-[0.1em] text-fg-faint">{selected.tagline}</p>
      )}
    </div>
  );
}
