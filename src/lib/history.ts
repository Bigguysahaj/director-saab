import type { Take } from "./types";

const KEY = "director.dailies.v1";

// Default keeps the pre-projects key so its existing Dailies carry over.
function keyFor(projectId: string): string {
  return projectId === "default" ? KEY : `${KEY}:${projectId}`;
}

export function loadTakes(projectId: string): Take[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(projectId));
    return raw ? (JSON.parse(raw) as Take[]) : [];
  } catch {
    return [];
  }
}

export function saveTakes(projectId: string, takes: Take[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(keyFor(projectId), JSON.stringify(takes.slice(0, 60)));
}

export function upsertTake(takes: Take[], take: Take): Take[] {
  const idx = takes.findIndex((t) => t.id === take.id);
  if (idx === -1) return [take, ...takes];
  const next = [...takes];
  next[idx] = take;
  return next;
}

export function removeTake(takes: Take[], id: string): Take[] {
  return takes.filter((t) => t.id !== id);
}
