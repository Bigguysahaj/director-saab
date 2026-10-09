"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadCast, updateMember, type CastMember } from "@/lib/cast";
import { AddFromSheetForm } from "@/components/cast/AddFromSheet";

/**
 * "+ Cast" popover on Stage: pick from the roster built at /audition to
 * assign a likeness to the selected mannequin. Assigning also copies the
 * mannequin's color-code onto the cast member's `stageColor` (cleared on
 * unassign) — that's what /screen-test reads to know
 * which cast member goes in which mannequin's spot. Generating cast members
 * happens on /audition; "Add from sheet" (also on /audition) adds one whose
 * character sheet (and optional close-up) already exists, stored whole.
 */
export function CastPanel({
  open,
  onToggle,
  canAssign,
  assignedId,
  mannequinColor,
  onAssign,
}: {
  open: boolean;
  onToggle: () => void;
  canAssign: boolean;
  assignedId: string | null;
  mannequinColor: string;
  onAssign: (id: string | null) => void;
}) {
  const [cast, setCast] = useState<CastMember[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Fetches /api/cast, so — same reasoning as Audition.tsx's own load — this
    // has to be an effect, not a lazy initializer or a render-time read.
    let cancelled = false;
    loadCast().then((loaded) => {
      if (!cancelled) setCast(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <div className="relative">
      {open && (
        <div className="absolute bottom-full left-0 mb-2 flex w-64 flex-col gap-2 rounded-2xl border border-border bg-bg-panel p-3">
          <span className="text-[10px] uppercase tracking-[0.2em] text-fg-dim">
            {canAssign ? "Assign to selected mannequin" : "Select a mannequin to assign"}
          </span>

          {cast.length === 0 ? (
            <p className="text-[10px] uppercase tracking-[0.15em] text-fg-faint">
              No cast yet — build one in Audition.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {cast.map((member) => {
                const thumb = Object.values(member.shots)[0]?.image ?? (member.photo || member.sheet);
                const isAssigned = assignedId === member.id;
                return (
                  <button
                    key={member.id}
                    disabled={!canAssign}
                    onClick={() => {
                      const nextId = isAssigned ? null : member.id;
                      onAssign(nextId);
                      // Best-effort — a failed write here just means the
                      // Screen Test won't see this assignment until
                      // it's retried; the stage assignment itself (above)
                      // already succeeded regardless.
                      updateMember(member.id, { stageColor: nextId ? mannequinColor : null }).catch(() => {});
                    }}
                    className={`flex items-center gap-2 rounded-full border px-2 py-1.5 text-left transition-colors disabled:opacity-40 ${
                      isAssigned ? "border-accent bg-accent-soft" : "border-border hover:border-accent"
                    }`}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={member.name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="h-8 w-8 shrink-0 rounded-full border border-dashed border-border" />
                    )}
                    <span className="truncate text-[10px] uppercase tracking-[0.15em] text-fg-dim">{member.name}</span>
                    {isAssigned && <span className="ml-auto text-[9px] text-accent">✓</span>}
                  </button>
                );
              })}
            </div>
          )}

          {adding ? (
            <AddFromSheetForm
              onAdded={(member) => {
                setCast((prev) => [...prev, member]);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
            >
              + Add from sheet
            </button>
          )}

          <Link
            href="/audition"
            className="rounded-full border border-border px-3 py-1.5 text-center text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
          >
            Open Audition →
          </Link>
        </div>
      )}
      <button
        onClick={onToggle}
        className={`rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.2em] transition-colors ${
          open ? "border-accent bg-accent text-bg" : "border-border bg-bg-panel text-fg-dim hover:border-accent hover:text-fg"
        }`}
      >
        {open ? "× Cast" : "+ Cast"}
      </button>
    </div>
  );
}
