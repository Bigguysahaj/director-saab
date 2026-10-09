export type CastMemberShot = { image: string; cost: number };

export type CastMember = {
  id: string;
  name: string;
  photo: string; // URL served from /api/cast/[id]/file/[filename], "" if none
  shots: Record<string, CastMemberShot>; // shotId -> generated result
  stageColor: string | null; // hex of the mannequin this member is currently assigned to on /stage, if any (see CastPanel.tsx)
  sheet: string; // ready-made character sheet URL, "" if none
  closeup: string; // optional close-up detail sheet URL, "" if none
};

/**
 * Cast roster lives on disk (see src/lib/castStore.ts), served through
 * /api/cast — not in the browser at all, so reference photos and generated
 * shots don't bloat localStorage/IndexedDB and are easy to inspect/back up
 * directly as files.
 */

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read blob"));
    reader.readAsDataURL(blob);
  });
}

// Cast images are URLs served from disk, not data URLs — but the image-gen
// routes forward them straight to the provider as input_references, which
// needs either a data URL or a publicly reachable one. Re-fetching as a data
// URL keeps those routes provider-agnostic instead of teaching them about
// our on-disk file layout.
export async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  return blobToDataUrl(await res.blob());
}

export async function loadCast(): Promise<CastMember[]> {
  const res = await fetch("/api/cast");
  if (!res.ok) return [];
  return res.json();
}

export async function createMember(name: string): Promise<CastMember> {
  const res = await fetch("/api/cast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Failed to create cast member");
  return res.json();
}

export async function updateMember(
  id: string,
  patch: {
    name?: string;
    photo?: string;
    shots?: Record<string, CastMemberShot>;
    stageColor?: string | null;
    sheet?: string; // data URL
    closeup?: string; // data URL
  }
): Promise<CastMember> {
  const res = await fetch(`/api/cast/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to update cast member");
  return res.json();
}

export async function deleteMember(id: string): Promise<void> {
  await fetch(`/api/cast/${id}`, { method: "DELETE" });
}
