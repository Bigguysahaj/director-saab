/**
 * Prompt templates for turning one reference photo into a same-person
 * character sheet (4 body angles + 5 expressions) via the model in
 * CHARACTER_SHEET_MODEL below.
 *
 * Anti-drift rule: every shot is generated from the *original* reference
 * photo, never from a previously generated shot — chaining generations off
 * each other is how identity drifts across a sheet (see the Kapwing
 * character-sheet writeup this was modeled on). Callers must always pass
 * the same source photo to every shot request.
 */

export type CharacterShotKind = "angle" | "expression";

export type CharacterShot = {
  id: string;
  kind: CharacterShotKind;
  label: string;
  instruction: string;
};

// meta/muse-image (Meta's would-be cheapest option) 403s "not available in
// your region" from this dev IP (India) as of Sept 2026, retested
// 2026-09-25 with no change — it's also dropped out of OpenRouter's general
// /models listing, though its endpoint still resolves directly. Using
// google/gemini-3.1-flash-lite-image ("Nano Banana 2 Lite") instead: same
// OpenRouter source, no region issues observed, and the cheapest working
// image-gen model as of this test. Re-check pricing/region access
// periodically — OpenRouter's catalog turns over fast.
export const CHARACTER_SHEET_MODEL = "google/gemini-3.1-flash-lite-image";

// Real billed cost from a live test call (2026-09-25), not the nominal
// per-token rate — image generation burns thousands of completion tokens,
// so the listed prompt/completion prices alone understate it a lot. Image
// generation is all-or-nothing billing, so this is close to exact per
// successful shot, not an estimate — but re-check via a live call if it's
// been a while, since providers do reprice.
export const CHARACTER_SHEET_COST_PER_IMAGE = 0.034;

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

export const CHARACTER_SHEET_COST =
  CHARACTER_SHEET_SHOTS.length * CHARACTER_SHEET_COST_PER_IMAGE;

export function getCharacterShot(id: string): CharacterShot | undefined {
  return CHARACTER_SHEET_SHOTS.find((shot) => shot.id === id);
}

export function buildCharacterShotPrompt(shot: CharacterShot): string {
  return `${STUDIO_SETTING} ${IDENTITY_LOCK} ${shot.instruction}`;
}
