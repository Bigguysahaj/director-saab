/**
 * Prompt template for turning one reference photo into a same-person
 * character sheet (4 body angles + 5 expressions) via the model in
 * DEFAULT_IMAGE_MODEL_ID (imageModels.ts) unless the owner picks another.
 *
 * All 9 shots are generated together as a single GRID_SIZE x GRID_SIZE grid
 * image in one API call, then cropped into individual shots client-side —
 * far cheaper than one call per shot (image-gen billing is dominated by a
 * fixed per-call output-token budget, not prompt complexity, so a 9-panel
 * grid costs about the same as a single panel; see IMAGE_PRICE_PER_CALL in imageModels.ts).
 * The tradeoff is resolution: each cropped shot is roughly
 * (full image size / GRID_SIZE) per side. Generating all shots in one call
 * also means they're inherently consistent with each other (same
 * generation, not 9 independent ones), which was previously handled by
 * always regenerating from the original reference photo rather than
 * chaining off a prior shot (see the Kapwing character-sheet writeup this
 * was modeled on).
 */

type CharacterShotKind = "angle" | "expression";

export type CharacterShot = {
  id: string;
  kind: CharacterShotKind;
  label: string;
  instruction: string;
};

const STUDIO_SETTING =
  "Soft, even studio lighting against a plain light-gray seamless background.";

const IDENTITY_LOCK =
  "Preserve the exact facial identity, hairstyle, body proportions, skin " +
  "tone, clothing, shoes, and accessories from the reference photo in this " +
  "image. Do not alter the face shape, eye shape, nose, or jawline.";

export const CHARACTER_SHEET_SHOTS: CharacterShot[] = [
  {
    id: "angle-front",
    kind: "angle",
    label: "Front",
    instruction:
      "Full-body shot, facing the camera directly, relaxed neutral standing pose, arms at sides.",
  },
  {
    id: "angle-three-quarter",
    kind: "angle",
    label: "Three-Quarter",
    instruction:
      "Full-body shot from a three-quarter angle, same relaxed neutral standing pose, arms at sides.",
  },
  {
    id: "angle-profile",
    kind: "angle",
    label: "Profile",
    instruction:
      "Full-body shot from a direct side profile, same relaxed neutral standing pose, arms at sides.",
  },
  {
    id: "angle-back",
    kind: "angle",
    label: "Back",
    instruction:
      "Full-body shot from directly behind, same relaxed neutral standing pose, arms at sides.",
  },
  {
    id: "expression-neutral",
    kind: "expression",
    label: "Neutral",
    instruction: "Close-up head-and-shoulders portrait, calm neutral expression.",
  },
  {
    id: "expression-happy",
    kind: "expression",
    label: "Happy",
    instruction: "Close-up head-and-shoulders portrait, genuine happy smiling expression.",
  },
  {
    id: "expression-sad",
    kind: "expression",
    label: "Sad",
    instruction: "Close-up head-and-shoulders portrait, sad, downcast expression.",
  },
  {
    id: "expression-angry",
    kind: "expression",
    label: "Angry",
    instruction: "Close-up head-and-shoulders portrait, angry, intense expression.",
  },
  {
    id: "expression-surprised",
    kind: "expression",
    label: "Surprised",
    instruction: "Close-up head-and-shoulders portrait, wide-eyed surprised expression.",
  },
];

// CHARACTER_SHEET_SHOTS.length must be GRID_SIZE * GRID_SIZE — the grid
// prompt below lays panels out row-major in shot array order, and the
// client crops by that same row/col math.
export const GRID_SIZE = 3;

export function buildCharacterSheetGridPrompt(): string {
  const panels = CHARACTER_SHEET_SHOTS.map(
    (shot, i) => `Panel ${i + 1}: ${shot.instruction}`
  ).join(" ");
  return (
    `Create a single character reference sheet image, arranged as a strict ` +
    `${GRID_SIZE}x${GRID_SIZE} grid of ${CHARACTER_SHEET_SHOTS.length} equal-sized square panels ` +
    `(${GRID_SIZE} rows, ${GRID_SIZE} columns), separated by thin white gutters, no labels or ` +
    `text anywhere. ${IDENTITY_LOCK} Apply this in every panel. ${panels} ` +
    `${STUDIO_SETTING} All panels must be perfectly aligned in a uniform ` +
    `grid with consistent panel dimensions.`
  );
}
