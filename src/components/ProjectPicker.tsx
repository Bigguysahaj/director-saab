"use client";

import { useState } from "react";
import type { Project } from "@/lib/projects";

/** Header chip showing the active project, with a menu to switch or create one. */
export function ProjectPicker({
  projects,
  activeId,
  onSwitch,
  onCreate,
}: {
  projects: Project[];
  activeId: string | null;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const active = projects.find((p) => p.id === activeId);

  function close() {
    setOpen(false);
    setNaming(false);
    setName("");
    setError(null);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await onCreate(name);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the project");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Switch project"
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
              onClick={() => {
                close();
                if (p.id !== activeId) onSwitch(p.id);
              }}
              className={`rounded-lg px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent-soft ${
                p.id === activeId ? "bg-accent-soft text-fg" : "text-fg-dim"
              }`}
            >
              {p.name}
            </button>
          ))}

          {naming ? (
            <form onSubmit={create} className="flex flex-col gap-2 border-t border-border px-1 pt-2">
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.2em] text-fg-faint">
                Project name
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-sm border border-border bg-bg px-2 py-1 text-xs normal-case tracking-normal text-fg focus:border-border-strong focus:outline-none"
                />
              </label>
              {error && <p className="text-[11px] text-warn">{error}</p>}
              <button
                type="submit"
                disabled={!name.trim()}
                className="self-end rounded-full border border-accent-dim px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-accent transition-colors hover:bg-accent hover:text-bg disabled:opacity-30"
              >
                Create
              </button>
            </form>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => setNaming(true)}
              className="rounded-lg border-t border-border px-3 py-1.5 text-left text-xs text-accent hover:bg-accent-soft"
            >
              New project
            </button>
          )}
        </div>
      )}
    </div>
  );
}
