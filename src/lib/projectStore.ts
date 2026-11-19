import "server-only";
import { mkdir, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { dataRoot } from "./dataRoot";
import { mediaStore, PROJECT_RE } from "./mediaStore";
import type { Project } from "./projects";
import { writeJson } from "./writeJson";

export { dataRoot };
export type { Project };

/**
 * Projects on disk under .data/projects/ (gitignored). projects.json holds
 * the list and which one is active; each project's cast lives in
 * projects/<id>/cast/ (see castStore.ts). The active project is kept on the
 * server rather than in the browser so /, /stage and /audition all agree on
 * it without passing it around.
 */


type ProjectsFile = { projects: Project[]; activeId: string };

const DEFAULT_PROJECT_ID = "default";

function projectsRoot(): string {
  return path.join(dataRoot(), "projects");
}

function projectsPath(): string {
  return path.join(projectsRoot(), "projects.json");
}

/** The project's folder; throws on any id that could step outside projects/. */
export function projectDir(id: string): string {
  if (!PROJECT_RE.test(id)) throw new Error(`Invalid project id: ${id}`);
  return path.join(projectsRoot(), id);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function exists(p: string): Promise<boolean> {
  return stat(p).then(
    () => true,
    () => false
  );
}

async function writeProjects(file: ProjectsFile): Promise<void> {
  await mkdir(projectsRoot(), { recursive: true });
  await writeJson(projectsPath(), file);
}

/**
 * First run creates Default and moves the pre-projects roster
 * (.data/cast/) into it as-is, so existing cast keeps its ids and files.
 */
export async function listProjects(): Promise<ProjectsFile> {
  try {
    return JSON.parse(await readFile(projectsPath(), "utf-8")) as ProjectsFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  const dir = projectDir(DEFAULT_PROJECT_ID);
  await mkdir(dir, { recursive: true });
  const legacyCast = path.join(dataRoot(), "cast");
  const target = path.join(dir, "cast");
  if ((await exists(legacyCast)) && !(await exists(target))) {
    await rename(legacyCast, target);
  }

  const file: ProjectsFile = {
    projects: [{ id: DEFAULT_PROJECT_ID, name: "Default", createdAt: Date.now() }],
    activeId: DEFAULT_PROJECT_ID,
  };
  await writeProjects(file);
  return file;
}

/** Creates a project and makes it the active one. */
export async function createProject(rawName: string): Promise<Project> {
  const name = rawName.trim();
  const slug = slugify(name);
  if (!name || !slug) throw new Error("Project name is required");

  const file = await listProjects();
  if (file.projects.some((p) => slugify(p.name) === slug)) {
    throw new Error(`A project called "${name}" already exists`);
  }
  // A renamed project keeps its old slug as id, so number the new one past it.
  let id = slug;
  for (let n = 2; file.projects.some((p) => p.id === id); n++) id = `${slug}-${n}`;

  const project: Project = { id, name, createdAt: Date.now() };
  await mkdir(projectDir(id), { recursive: true });
  await writeProjects({ projects: [...file.projects, project], activeId: id });
  return project;
}

export async function setActiveProject(id: string): Promise<Project> {
  const file = await listProjects();
  const project = file.projects.find((p) => p.id === id);
  if (!project) throw new ProjectNotFoundError(id);
  await writeProjects({ ...file, activeId: id });
  return project;
}

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Project ${id} not found`);
  }
}

/**
 * The project a request is about: the one named in ?project=, or the
 * active one when it's left out. Throws ProjectNotFoundError for an
 * unknown id.
 */
export async function resolveProjectId(requested: string | null): Promise<string> {
  const file = await listProjects();
  const id = requested ?? file.activeId;
  if (!file.projects.some((p) => p.id === id)) throw new ProjectNotFoundError(id);
  return id;
}

/** Runs a handler against the request's project, or answers 404 for an unknown one. */
export async function withProject(req: Request, handler: (projectId: string) => Promise<Response>): Promise<Response> {
  let projectId: string;
  try {
    projectId = await resolveProjectId(new URL(req.url).searchParams.get("project"));
  } catch (err) {
    if (err instanceof ProjectNotFoundError) return Response.json({ error: err.message }, { status: 404 });
    throw err;
  }
  return handler(projectId);
}

/** Renames the label only, preserving paths and take references. */
export async function renameProject(id: string, rawName: string): Promise<Project> {
  const file = await listProjects();
  const project = file.projects.find((p) => p.id === id);
  if (!project) throw new ProjectNotFoundError(id);
  const name = rawName.trim();
  const slug = slugify(name);
  if (!name || !slug) throw new Error("Project name is required");
  if (file.projects.some((p) => p.id !== id && slugify(p.name) === slug)) {
    throw new Error(`A project called "${name}" already exists`);
  }
  const renamed = { ...project, name };
  await writeProjects({ ...file, projects: file.projects.map((p) => p.id === id ? renamed : p) });
  return renamed;
}

/** Removes the project and its disk assets, then selects a surviving project. */
export async function deleteProject(id: string): Promise<ProjectsFile> {
  const file = await listProjects();
  if (!file.projects.some((p) => p.id === id)) throw new ProjectNotFoundError(id);

  // Reference media is public by URL, so it goes first: if the store fails,
  // the delete fails with the project untouched and can be retried.
  await mediaStore().deleteAll(id);

  // Take logs are stored separately, with the project ID in take.json.
  const takes = path.join(dataRoot(), "takes");
  const entries = await readdir(takes, { withFileTypes: true }).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return [];
    throw err;
  });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(takes, entry.name);
    // Skip a missing or broken take.json rather than block the delete on it.
    const take = await readFile(path.join(dir, "take.json"), "utf8").then(JSON.parse).catch(() => null);
    if (take?.project === id) await rm(dir, { recursive: true, force: true });
  }
  await rm(projectDir(id), { recursive: true, force: true });
  let projects = file.projects.filter((p) => p.id !== id);
  if (!projects.length) {
    projects = [{ id: DEFAULT_PROJECT_ID, name: "Default", createdAt: Date.now() }];
    await mkdir(projectDir(DEFAULT_PROJECT_ID), { recursive: true });
  }
  const activeId = file.activeId === id ? projects[0].id : file.activeId;
  const next = { projects, activeId };
  await writeProjects(next);
  return next;
}
