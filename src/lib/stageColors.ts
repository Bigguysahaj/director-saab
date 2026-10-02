/**
 * Single source of truth for the mannequin/prop color palette used on
 * /stage — shared with the Screen Test compositor (src/lib/screenTest.ts),
 * which needs human-readable color names (not hex) to describe "replace the
 * X mannequin with Y" in an image-gen prompt.
 */
export const STAGE_PALETTE: { hex: string; label: string }[] = [
  { hex: "#c65d3b", label: "burnt orange" },
  { hex: "#3b6b5c", label: "forest green" },
  { hex: "#c9a13b", label: "mustard gold" },
  { hex: "#4a5a7a", label: "slate blue" },
  { hex: "#a3432f", label: "brick red" },
];

// Fallback color for mannequins that predate the castId/color-coding
// convention (saved layouts from before this feature).
export const DEFAULT_MANNEQUIN_COLOR = "#c9b8a0";

export function colorLabel(hex: string): string {
  return STAGE_PALETTE.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.label ?? hex;
}
