import Link from "next/link";
import { Audition } from "@/components/audition/Audition";

export default function AuditionPage() {
  return (
    <div className="relative min-h-dvh w-full">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg/90 px-6 py-4 backdrop-blur">
        <Link
          href="/"
          className="rounded-full border border-border bg-bg-panel px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
        >
          ← Director
        </Link>
        <Link
          href="/stage"
          className="rounded-full border border-border bg-bg-panel px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
        >
          Stage →
        </Link>
      </div>
      <Audition />
    </div>
  );
}
