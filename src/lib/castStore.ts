import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectDir } from "./projectStore";

/**
 * Cast persistence on disk under .data/projects/<project>/cast/ (gitignored;
 * see projectStore.ts), not the browser —
 * reference photos and generated character-sheet shots are real image
 * files, not something to keep re-encoding into localStorage/IndexedDB.
 * roster.json holds metadata (name, filenames, per-shot cost); each
 * member's images live in their own subfolder.
 */

export type StoredShot = { file: string; cost: number };

export type StoredCastMember = {
  id: string;
  name: string;
  photo: string | null; // filename within the member's folder, e.g. "photo.png"
  shots: Record<string, StoredShot>; // shotId -> filename + cost
  stageColor?: string | null; // hex of the /stage mannequin this member is currently assigned to, if any
  // Ready-made sheets added whole (no cropping) and sent as take references.
  sheet?: string | null;
  closeup?: string | null;
};

function castDir(projectId: string): string {
  return path.join(projectDir(projectId), "cast");
}

function rosterPath(projectId: string): string {
  return path.join(castDir(projectId), "roster.json");
}

// Member ids and filenames end up in paths, and both can arrive from a URL.
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function safeSegment(kind: string, value: string): string {
  if (!SAFE_SEGMENT.test(value) || value.includes("..")) throw new Error(`Invalid ${kind}: ${value}`);
  return value;
}

function memberDir(projectId: string, id: string): string {
  return path.join(castDir(projectId), safeSegment("cast member id", id));
}

export async function readRoster(projectId: string): Promise<StoredCastMember[]> {
  try {
    const raw = await readFile(rosterPath(projectId), "utf-8");
    return JSON.parse(raw) as StoredCastMember[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeRoster(projectId: string, roster: StoredCastMember[]): Promise<void> {
  await mkdir(castDir(projectId), { recursive: true });
  await writeFile(rosterPath(projectId), JSON.stringify(roster, null, 2));
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function parseDataUrl(dataUrl: string): { buffer: Buffer; ext: string } {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) throw new Error("Not a base64 data URL");
  const [, mime, base64] = match;
  return { buffer: Buffer.from(base64, "base64"), ext: EXT_BY_MIME[mime] ?? "jpg" };
}

async function saveMemberImage(projectId: string, id: string, baseName: string, dataUrl: string): Promise<string> {
  const { buffer, ext } = parseDataUrl(dataUrl);
  const dir = memberDir(projectId, id);
  await mkdir(dir, { recursive: true });
  const filename = safeSegment("filename", `${baseName}.${ext}`);
  await writeFile(path.join(dir, filename), buffer);
  return filename;
}

export async function createMember(projectId: string, name: string): Promise<StoredCastMember> {
  const roster = await readRoster(projectId);
  const member: StoredCastMember = {
    id: `cast-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name,
    photo: null,
    shots: {},
    stageColor: null,
  };
  await writeRoster(projectId, [...roster, member]);
  return member;
}

/**
 * Setting a new photo clears any previously generated shots — they were
 * generated from the old photo, so they'd no longer match.
 */
export async function updateMember(
  projectId: string,
  id: string,
  patch: {
    name?: string;
    photoDataUrl?: string;
    shots?: Record<string, { image: string; cost: number }>;
    stageColor?: string | null;
    sheetDataUrl?: string;
    closeupDataUrl?: string;
  }
): Promise<StoredCastMember> {
  const roster = await readRoster(projectId);
  const idx = roster.findIndex((m) => m.id === id);
  if (idx === -1) throw new Error(`Cast member ${id} not found`);
  const member = { ...roster[idx] };

  if (patch.name !== undefined) member.name = patch.name;

  if (patch.photoDataUrl !== undefined) {
    const oldPhoto = member.photo;
    member.photo = await saveMemberImage(projectId, id, "photo", patch.photoDataUrl);
    // A re-upload with a different extension (png -> jpg, say) writes a new
    // filename rather than overwriting the old one — clean it up so it
    // doesn't just sit there unreferenced.
    if (oldPhoto && oldPhoto !== member.photo) {
      await rm(path.join(memberDir(projectId, id), oldPhoto), { force: true });
    }
    // Old shots were generated from the photo being replaced, so they're
    // being invalidated (member.shots = {} below) — remove their files too
    // rather than leaving them orphaned on disk.
    await Promise.all(
      Object.values(member.shots).map((shot) =>
        rm(path.join(memberDir(projectId, id), shot.file), { force: true })
      )
    );
    member.shots = {};
  }

  if (patch.shots) {
    const shots: Record<string, StoredShot> = {};
    for (const [shotId, shot] of Object.entries(patch.shots)) {
      shots[shotId] = { file: await saveMemberImage(projectId, id, shotId, shot.image), cost: shot.cost };
    }
    member.shots = shots;
  }

  if (patch.stageColor !== undefined) member.stageColor = patch.stageColor;

  for (const key of ["sheet", "closeup"] as const) {
    const dataUrl = patch[`${key}DataUrl`];
    if (dataUrl === undefined) continue;
    const old = member[key];
    member[key] = await saveMemberImage(projectId, id, key, dataUrl);
    if (old && old !== member[key]) await rm(path.join(memberDir(projectId, id), old), { force: true });
  }

  roster[idx] = member;
  await writeRoster(projectId, roster);
  return member;
}

export async function deleteMember(projectId: string, id: string): Promise<void> {
  const roster = await readRoster(projectId);
  await writeRoster(projectId, roster.filter((m) => m.id !== id));
  await rm(memberDir(projectId, id), { recursive: true, force: true });
}

export async function readMemberFile(projectId: string, id: string, filename: string): Promise<Buffer> {
  return readFile(path.join(memberDir(projectId, id), safeSegment("filename", filename)));
}

/** Maps a stored member (filenames on disk) to the client-facing shape (servable URLs). */
export function toClientMember(projectId: string, m: StoredCastMember) {
  // Image URLs name their project, so they keep working after a switch.
  const file = (name: string) => `/api/cast/${m.id}/file/${name}?project=${projectId}`;
  return {
    id: m.id,
    name: m.name,
    photo: m.photo ? file(m.photo) : "",
    shots: Object.fromEntries(
      Object.entries(m.shots).map(([shotId, s]) => [
        shotId,
        { image: file(s.file), cost: s.cost },
      ])
    ),
    stageColor: m.stageColor ?? null,
    sheet: m.sheet ? file(m.sheet) : "",
    closeup: m.closeup ? file(m.closeup) : "",
  };
}
