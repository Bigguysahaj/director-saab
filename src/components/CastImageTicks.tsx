"use client";

import { useEffect, useState } from "react";
import type { CastMember } from "@/lib/cast";
import { ImageViewer } from "@/components/ImageViewer";

/** A member's sendable images in send order: sheet, close-up, candidates; without a sheet, the front shot or photo. */
export function castImageOptions(m: CastMember): { url: string; label: string; ticked: boolean }[] {
  if (!m.sheet) {
    const url = m.shots["angle-front"]?.image ?? m.photo;
    return url ? [{ url, label: "photo", ticked: true }] : [];
  }
  return [
    { url: m.sheet, label: "sheet", ticked: true },
    ...(m.closeup ? [{ url: m.closeup, label: "close-up", ticked: true }] : []),
    ...(m.candidates ?? []).map((url, i) => ({ url, label: `candidate ${i + 1}`, ticked: false })),
  ];
}

/** The images ticked by default (what was sent before ticks existed). */
export const defaultCastImages = (m: CastMember) => castImageOptions(m).filter((o) => o.ticked).map((o) => o.url);

/**
 * Thumbnails of a cast member's images with a tick each; reports the ticked
 * URLs in strip order (once on mount with the defaults). Any image can be unticked.
 */
export function CastImageTicks({ member, onChange, disabled }: { member: CastMember; onChange: (urls: string[]) => void; disabled?: boolean }) {
  const options = castImageOptions(member);
  const [ticked, setTicked] = useState(() => defaultCastImages(member));
  const [viewing, setViewing] = useState<{ src: string; label: string } | null>(null);

  // Report the defaults once so the parent starts in sync.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onChange(ticked), []);

  function toggle(url: string) {
    const next = options.map((o) => o.url).filter((u) => (u === url ? !ticked.includes(u) : ticked.includes(u)));
    setTicked(next);
    onChange(next);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const label = `${member.name} ${o.label}`;
        return (
          <div key={o.url} className="flex flex-col items-center gap-1">
            <button type="button" aria-label={`View ${label}`} onClick={() => setViewing({ src: o.url, label })} className="cursor-zoom-in">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.url} alt="" className={`h-14 w-14 rounded-sm object-cover ${ticked.includes(o.url) ? "" : "opacity-40"}`} />
            </button>
            <label className="flex items-center gap-1 text-[10px] text-fg-dim">
              <input type="checkbox" aria-label={`Send ${label}`} checked={ticked.includes(o.url)} disabled={disabled} onChange={() => toggle(o.url)} />
              {o.label}
            </label>
          </div>
        );
      })}
      {viewing && <ImageViewer {...viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
