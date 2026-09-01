import Link from "next/link";
import { StageScene } from "@/components/stage/StageScene";

export default function StagePage() {
  return (
    <div className="relative h-dvh w-full">
      <Link
        href="/"
        className="absolute left-6 top-6 z-10 rounded-full border border-border bg-bg-panel px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-fg-dim transition-colors hover:border-accent hover:text-fg"
      >
        ← Director
      </Link>
      <StageScene />
    </div>
  );
}
