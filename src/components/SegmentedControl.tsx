"use client";

type Props<T extends string | number> = {
  label: string;
  options: T[];
  value: T | undefined;
  onChange: (value: T) => void;
  format?: (value: T) => string;
  disabled?: boolean;
};

export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  format,
  disabled,
}: Props<T>) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] tracking-[0.2em] text-fg-faint uppercase">
        {label}
      </span>
      <div
        className={`flex flex-wrap gap-1 rounded-sm border border-border bg-bg-panel p-1 ${
          disabled ? "opacity-40" : ""
        }`}
      >
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt)}
            className={`px-2.5 py-1 text-xs rounded-sm transition-colors cursor-pointer ${
              value === opt
                ? "bg-accent text-bg font-medium"
                : "text-fg-dim hover:text-fg hover:bg-bg-panel-hover"
            }`}
          >
            {format ? format(opt) : opt}
          </button>
        ))}
      </div>
    </div>
  );
}
