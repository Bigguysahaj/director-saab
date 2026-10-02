export type CastMemberShot = { image: string; cost: number };

export type CastMember = {
  id: string;
  name: string;
  photo: string; // URL served from /api/cast/[id]/file/[filename], "" if none
  shots: Record<string, CastMemberShot>; // shotId -> generated result
  stageColor: string | null; // hex of the mannequin this member is currently assigned to on /stage, if any (see CastPanel.tsx)
};

/**
 * Cast roster lives on disk (see src/lib/castStore.ts), served through
 * /api/cast — not in the browser at all, so reference photos and generated
 * shots don't bloat localStorage/IndexedDB and are easy to inspect/back up
 * directly as files.
 */

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
  patch: { name?: string; photo?: string; shots?: Record<string, CastMemberShot>; stageColor?: string | null }
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
