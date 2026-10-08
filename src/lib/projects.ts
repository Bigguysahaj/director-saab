export type Project = { id: string; name: string; createdAt: number };
export type ProjectList = { projects: Project[]; activeId: string };

/**
 * Projects live on disk (see src/lib/projectStore.ts). The active one is
 * stored server-side, so /api/cast calls without ?project= follow it.
 */

export async function loadProjects(): Promise<ProjectList> {
  const res = await fetch("/api/projects", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load projects");
  return res.json();
}

export async function createProject(name: string): Promise<Project> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to create project");
  return data;
}

export async function setActiveProject(id: string): Promise<Project> {
  const res = await fetch("/api/projects", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activeId: id }),
  });
  if (!res.ok) throw new Error("Failed to switch project");
  return res.json();
}
