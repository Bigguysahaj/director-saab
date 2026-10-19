import type { ObjectKind } from "./types";

type AddKind = Extract<ObjectKind, "box" | "ball" | "purse" | "mannequin" | "wind">;

const GROUPS: [string, [AddKind, string][]][] = [
  ["Talent", [["mannequin", "Mannequin"]]],
  [
    "Props",
    [
      ["box", "Box"],
      ["ball", "Ball"],
      ["purse", "Purse"],
    ],
  ],
  ["SFX", [["wind", "Wind machine"]]],
];

export function Inventory({ onAdd }: { onAdd: (kind: AddKind) => void }) {
  return (
    <div className="flex flex-col gap-2">
      {GROUPS.map(([name, items]) => (
        <div key={name} role="group" aria-label={name} className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.2em] text-fg-faint">{name}</span>
          <div className="flex items-center gap-1">
            {items.map(([kind, label]) => (
              <button
                key={kind}
                onClick={() => onAdd(kind)}
                className="rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
