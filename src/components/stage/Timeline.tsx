import { useRef } from "react";

type TimelineProps = {
  duration: number;
  playheadTime: number;
  onScrub: (time: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  keyframeTimes: number[];
  canKeyframe: boolean;
  hasKeyframeAtPlayhead: boolean;
  onAddKey: () => void;
  onDeleteKey: () => void;
};

function timeFromPointer(e: { clientX: number }, el: HTMLElement, duration: number): number {
  const rect = el.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  return Math.round(ratio * duration * 10) / 10;
}

/** Bottom-center timeline bar: scrub track with tick marks and keyframe
 * markers for whatever's selected, play/pause, and +Key/−Key. Purely
 * presentational — all state lives in StageScene. */
export function Timeline({
  duration,
  playheadTime,
  onScrub,
  isPlaying,
  onTogglePlay,
  keyframeTimes,
  canKeyframe,
  hasKeyframeAtPlayhead,
  onAddKey,
  onDeleteKey,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = trackRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragging.current = true;
    onScrub(timeFromPointer(e, el, duration));
  }
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = trackRef.current;
    if (!el || !dragging.current) return;
    onScrub(timeFromPointer(e, el, duration));
  }
  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = false;
    trackRef.current?.releasePointerCapture(e.pointerId);
  }

  const playheadPct = (playheadTime / duration) * 100;
  const ticks = Array.from({ length: duration + 1 }, (_, i) => i);

  return (
    <div className="absolute inset-x-6 bottom-4 flex items-center gap-3 rounded-full border border-border bg-bg-panel px-3 py-2">
      <button
        onClick={onTogglePlay}
        className={`rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors ${
          isPlaying ? "bg-accent text-bg font-medium" : "text-fg-dim hover:text-fg"
        }`}
      >
        {isPlaying ? "❚❚ Pause" : "▶ Play"}
      </button>

      <span className="w-10 shrink-0 text-[10px] uppercase tracking-[0.15em] text-fg-faint">
        {playheadTime.toFixed(1)}s
      </span>

      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative h-6 flex-1 cursor-pointer touch-none"
      >
        {/* track line */}
        <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        {/* tick marks */}
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-border"
            style={{ left: `${(t / duration) * 100}%` }}
          />
        ))}
        {/* keyframe markers for the selected object */}
        {keyframeTimes.map((t, i) => (
          <div
            key={`${t}-${i}`}
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-accent bg-bg-panel"
            style={{ left: `${(t / duration) * 100}%` }}
          />
        ))}
        {/* playhead */}
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
          style={{ left: `${playheadPct}%` }}
        />
      </div>

      {canKeyframe && (
        <div className="flex items-center gap-1">
          <button
            onClick={onAddKey}
            title="Set a keyframe at the current time from this object's live pose"
            className="rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg transition-colors hover:border-accent"
          >
            + Key
          </button>
          <button
            onClick={onDeleteKey}
            disabled={!hasKeyframeAtPlayhead}
            className="rounded-full border border-border px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-fg transition-colors hover:border-accent disabled:opacity-30 disabled:hover:border-border"
          >
            − Key
          </button>
        </div>
      )}
    </div>
  );
}
