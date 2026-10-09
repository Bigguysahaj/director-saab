"use client";

import { useState } from "react";
import type { Project } from "@/lib/projects";

/** Header chip showing the active project, with a menu to switch or create one. */
export function ProjectPicker({
  projects,
  activeId,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
  deletingDisabled = false,
}: {
  projects: Project[];
  activeId: string | null;
  onSwitch: (id: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  deletingDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState<"create" | "rename" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const active = projects.find((p) => p.id === activeId);

  function close() {
    setOpen(false);
    setNaming(null);
    setDeleting(false);
    setName("");
    setError(null);
  }

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await action(); close(); }
    catch (err) { setError(err instanceof Error ? err.message : "Project update failed"); }
    finally { setBusy(false); }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    void act(() => naming === "rename" ? onRename(name) : onCreate(name));
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Switch project"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex items-center gap-1.5 rounded-full border border-accent-dim bg-accent-soft px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:border-accent"
      >
        <span data-testid="active-project" className="normal-case tracking-normal text-xs">
          {active?.name ?? "…"}
        </span>
        <span aria-hidden>▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-2 flex w-60 flex-col gap-1 rounded-2xl border border-border bg-bg-panel p-2"
        >
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void act(async () => { if (p.id !== activeId) await onSwitch(p.id); })}
              className={`rounded-lg px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent-soft ${
                p.id === activeId ? "bg-accent-soft text-fg" : "text-fg-dim"
              }`}
            >
              {p.name}
            </button>
          ))}

          {deleting ? (
            <div role="alertdialog" aria-label="Delete project" className="flex flex-col gap-3 border-t border-border p-2 text-xs text-fg">
              <p>Delete “{active?.name}”? Its cast, takes and videos will be permanently removed.</p>
              <button type="button" disabled={busy} onClick={() => void act(onDelete)} className="rounded-lg border border-warn px-3 py-2 text-warn">Delete permanently</button>
              <button type="button" disabled={busy} onClick={close}>Cancel</button>
            </div>
          ) : naming ? (
            <form onSubmit={save} className="flex flex-col gap-2 border-t border-border px-1 pt-2">
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.2em] text-fg-faint">
                Project name
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-sm border border-border bg-bg px-2 py-1 text-xs normal-case tracking-normal text-fg focus:border-border-strong focus:outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="self-end rounded-full border border-accent-dim px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-bg disabled:opacity-30"
              >
                {naming === "rename" ? "Save" : "Create"}
              </button>
            </form>
          ) : (
            <>
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => setNaming("create")}
              className="rounded-lg border-t border-border px-3 py-1.5 text-left text-xs text-accent hover:bg-accent-soft"
            >
              New project
            </button>
            <button type="button" role="menuitem" disabled={busy || !active} onClick={() => { setNaming("rename"); setName(active?.name ?? ""); }} className="rounded-lg px-3 py-1.5 text-left text-xs text-fg-dim hover:bg-accent-soft">Rename project</button>
            <button type="button" role="menuitem" disabled={busy || deletingDisabled || !active} onClick={() => setDeleting(true)} className="rounded-lg px-3 py-1.5 text-left text-xs text-warn hover:bg-accent-soft">Delete project</button>
            </>
          )}
          {error && <p role="alert" className="px-2 text-[11px] text-warn">{error}</p>}
        </div>
      )}
    </div>
  );
}
