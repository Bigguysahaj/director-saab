import { colorLabel } from "@/lib/stageColors";

// One loop with a wobble and an overshoot past the start, plus a faint second
// pass slightly off-axis, so it reads as a quick pen circle rather than a
// perfect CSS ring.
const MAIN_STROKE =
  "M9.5 6.2C14 3.4 23.5 4.1 27 10.5C30.2 16.6 27.4 25.2 19.8 27.6C12.6 29.8 4.9 25.6 4.3 17.8C3.8 11.6 8.4 6.4 14.6 5.3C16.8 4.9 18.6 5.2 20.2 5.9";
const SECOND_PASS = "M21.5 5.4C25.8 7.6 28.6 12.4 27.9 17.6C27.1 23.4 22.4 27.1 16.9 27.2";

/**
 * Hand-drawn circle in the color of the /stage mannequin a cast member is
 * assigned to (`stageColor`, set by CastPanel.tsx). Renders nothing when the
 * member isn't assigned.
 */
export function CastColorMark({ color }: { color: string | null | undefined }) {
  if (!color) return null;
  const label = `On stage: ${colorLabel(color)} mannequin`;
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label={label} className="h-8 w-8 shrink-0" fill="none">
      <title>{label}</title>
      <path d={MAIN_STROKE} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={SECOND_PASS} stroke={color} strokeWidth={1.2} strokeLinecap="round" opacity={0.55} />
    </svg>
  );
}
