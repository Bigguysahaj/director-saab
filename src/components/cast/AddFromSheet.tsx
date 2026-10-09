"use client";

import { useState } from "react";
import { blobToDataUrl, createMember, deleteMember, updateMember, type CastMember } from "@/lib/cast";

/**
 * Adds a cast member whose character sheet (and optional close-up) already
 * exists, stored whole — no photo, no generation. Shared by the /stage cast
 * popover and /audition.
 */
export function AddFromSheetForm({
  onAdded,
  onCancel,
  className = "",
}: {
  onAdded: (member: CastMember) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [name, setName] = useState("");
  const [sheet, setSheet] = useState("");
  const [closeup, setCloseup] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setSaving(true);
    setError(null);
    try {
      const member = await createMember(name.trim());
      // Don't leave a sheetless member behind if the upload fails.
      const saved = await updateMember(member.id, { sheet, closeup: closeup || undefined }).catch((err) => {
        deleteMember(member.id);
        throw err;
      });
      onAdded(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add cast member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`flex flex-col gap-2 rounded-xl border border-border p-2 ${className}`}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        aria-label="Cast member name"
        className="rounded-full border border-border bg-transparent px-3 py-1.5 text-[11px] text-fg focus:border-accent focus:outline-none"
      />
      <SheetDrop label="Character sheet" value={sheet} onChange={setSheet} />
      <SheetDrop label="Close-up (optional)" value={closeup} onChange={setCloseup} />
      {error && <p role="alert" className="text-[10px] text-warn">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim hover:text-fg"
        >
          Cancel
        </button>
        <button
          onClick={add}
          disabled={!name.trim() || !sheet || saving}
          className="flex-1 rounded-full border border-accent px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-bg disabled:opacity-40"
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

// The types castStore saves under their real extension (and Seedance takes).
const SHEET_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Click-or-drop image picker; the image is kept whole as a data URL. */
function SheetDrop({ label, value, onChange }: { label: string; value: string; onChange: (dataUrl: string) => void }) {
  const [error, setError] = useState(false);
  const take = (file?: File) => {
    if (!file) return;
    setError(!SHEET_TYPES.includes(file.type));
    if (SHEET_TYPES.includes(file.type)) blobToDataUrl(file).then(onChange);
  };
  return (
    <label
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        take(e.dataTransfer.files[0]);
      }}
      className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border p-2 hover:border-accent"
    >
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt={label} className="h-10 w-10 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-10 w-10 shrink-0 rounded border border-border" />
      )}
      <span className="text-[10px] uppercase tracking-[0.15em] text-fg-dim">
        {label}
        {error && <span role="alert" className="block normal-case tracking-normal text-warn">PNG, JPEG or WebP only</span>}
      </span>
      <input type="file" accept={SHEET_TYPES.join(",")} aria-label={label} className="hidden" onChange={(e) => take(e.target.files?.[0])} />
    </label>
  );
}
