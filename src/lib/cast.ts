export type CastMemberShot = { image: string; cost: number };

export type CastMember = {
  id: string;
  name: string;
  photo: string; // reference photo, data URL
  shots: Record<string, CastMemberShot>; // shotId -> generated result
};

const KEY = "director.cast.v1";

export function loadCast(): CastMember[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CastMember[]) : [];
  } catch {
    return [];
  }
}

export function saveCast(cast: CastMember[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(cast));
}

export function upsertCastMember(cast: CastMember[], member: CastMember): CastMember[] {
  const idx = cast.findIndex((c) => c.id === member.id);
  if (idx === -1) return [...cast, member];
  const next = [...cast];
  next[idx] = member;
  return next;
}

export function removeCastMember(cast: CastMember[], id: string): CastMember[] {
  return cast.filter((c) => c.id !== id);
}
