/**
 * Prompt templates for turning one reference photo into a same-person
 * character sheet (4 body angles + 5 expressions) via Muse Image.
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

// As of Sept 2026, Meta rejects this model with 403 "not available in your
// region" from at least some regions (observed from an India-based dev IP;
// untested elsewhere). Request/response shape was verified independently
// against google/gemini-2.5-flash-image with an identical payload, so a
// 403 here means the region, not a bug in the request. Since this route
// runs server-side, production availability depends on where it's
// deployed, not on any client's location — re-test after deploying before
// assuming this model works.
export const MUSE_IMAGE_MODEL = "meta/muse-image";

// OpenRouter's listed price as of Sept 2026. Image generation is
// all-or-nothing billing, so this is exact per successful shot, not an
// estimate — but re-check openrouter.ai/meta/muse-image if it's been a
// while, since providers do reprice.
export const MUSE_IMAGE_COST_PER_IMAGE = 0.01;

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
  CHARACTER_SHEET_SHOTS.length * MUSE_IMAGE_COST_PER_IMAGE;

export function getCharacterShot(id: string): CharacterShot | undefined {
  return CHARACTER_SHEET_SHOTS.find((shot) => shot.id === id);
}

export function buildCharacterShotPrompt(shot: CharacterShot): string {
  return `${STUDIO_SETTING} ${IDENTITY_LOCK} ${shot.instruction}`;
}
