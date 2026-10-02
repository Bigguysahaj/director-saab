import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Cast persistence on disk under .data/cast/ (gitignored), not the browser —
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
};

const DATA_DIR = path.join(process.cwd(), ".data", "cast");
const ROSTER_PATH = path.join(DATA_DIR, "roster.json");

function memberDir(id: string): string {
  return path.join(DATA_DIR, id);
}

export async function readRoster(): Promise<StoredCastMember[]> {
  try {
    const raw = await readFile(ROSTER_PATH, "utf-8");
    return JSON.parse(raw) as StoredCastMember[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function writeRoster(roster: StoredCastMember[]): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(ROSTER_PATH, JSON.stringify(roster, null, 2));
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

async function saveMemberImage(id: string, baseName: string, dataUrl: string): Promise<string> {
  const { buffer, ext } = parseDataUrl(dataUrl);
  await mkdir(memberDir(id), { recursive: true });
  const filename = `${baseName}.${ext}`;
  await writeFile(path.join(memberDir(id), filename), buffer);
  return filename;
}

export async function createMember(name: string): Promise<StoredCastMember> {
  const roster = await readRoster();
  const member: StoredCastMember = {
    id: `cast-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name,
    photo: null,
    shots: {},
    stageColor: null,
  };
  await writeRoster([...roster, member]);
  return member;
}

/**
 * Setting a new photo clears any previously generated shots — they were
 * generated from the old photo, so they'd no longer match.
 */
export async function updateMember(
  id: string,
  patch: {
    name?: string;
    photoDataUrl?: string;
    shots?: Record<string, { image: string; cost: number }>;
    stageColor?: string | null;
  }
): Promise<StoredCastMember> {
  const roster = await readRoster();
  const idx = roster.findIndex((m) => m.id === id);
  if (idx === -1) throw new Error(`Cast member ${id} not found`);
  const member = { ...roster[idx] };

  if (patch.name !== undefined) member.name = patch.name;

  if (patch.photoDataUrl !== undefined) {
    const oldPhoto = member.photo;
    member.photo = await saveMemberImage(id, "photo", patch.photoDataUrl);
    // A re-upload with a different extension (png -> jpg, say) writes a new
    // filename rather than overwriting the old one — clean it up so it
    // doesn't just sit there unreferenced.
    if (oldPhoto && oldPhoto !== member.photo) {
      await rm(path.join(memberDir(id), oldPhoto), { force: true });
    }
    // Old shots were generated from the photo being replaced, so they're
    // being invalidated (member.shots = {} below) — remove their files too
    // rather than leaving them orphaned on disk.
    await Promise.all(
      Object.values(member.shots).map((shot) =>
        rm(path.join(memberDir(id), shot.file), { force: true })
      )
    );
    member.shots = {};
  }

  if (patch.shots) {
    const shots: Record<string, StoredShot> = {};
    for (const [shotId, shot] of Object.entries(patch.shots)) {
      shots[shotId] = { file: await saveMemberImage(id, shotId, shot.image), cost: shot.cost };
    }
    member.shots = shots;
  }

  if (patch.stageColor !== undefined) member.stageColor = patch.stageColor;

  roster[idx] = member;
  await writeRoster(roster);
  return member;
}

export async function deleteMember(id: string): Promise<void> {
  const roster = await readRoster();
  await writeRoster(roster.filter((m) => m.id !== id));
  await rm(memberDir(id), { recursive: true, force: true });
}

export async function readMemberFile(id: string, filename: string): Promise<Buffer> {
  return readFile(path.join(memberDir(id), filename));
}

/** Maps a stored member (filenames on disk) to the client-facing shape (servable URLs). */
export function toClientMember(m: StoredCastMember) {
  return {
    id: m.id,
    name: m.name,
    photo: m.photo ? `/api/cast/${m.id}/file/${m.photo}` : "",
    shots: Object.fromEntries(
      Object.entries(m.shots).map(([shotId, s]) => [
        shotId,
        { image: `/api/cast/${m.id}/file/${s.file}`, cost: s.cost },
      ])
    ),
    stageColor: m.stageColor ?? null,
  };
}
