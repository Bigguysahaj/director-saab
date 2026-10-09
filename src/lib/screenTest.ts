/**
 * Prompt template for compositing a captured /stage photo (color-coded
 * mannequins standing in blocked-out positions/poses) with the reference
 * photo of whichever cast member is assigned to each mannequin's color —
 * see CastPanel.tsx (assignment copies the mannequin's color onto the cast
 * member's `stageColor`) and /screen-test (ScreenTest.tsx) (reads that
 * field to build the request this prompt describes).
 *
 * The stage photo is the physics: the mannequins' blocking (position, pose,
 * spacing, scale, orientation, ground contact) was deliberately staged on
 * /stage and is not up for reinterpretation. First real test (2026-09-25)
 * showed the model treating that as loose inspiration instead — two
 * separately-positioned mannequins came back as a single embracing couple.
 * The instructions below exist specifically to kill that failure mode:
 * every physical fact from reference image 1 is stated as non-negotiable,
 * and the "don't invent contact/proximity" line is there because that's
 * the exact thing that went wrong.
 */

// Fallback estimate when a model's actual billed cost isn't reported back
// by the API (see /api/screen-test) — real cost varies per model chosen.
// The model itself is chosen at generation time via the "DoP" picker in
// ScreenTest.tsx (src/lib/imageModels.ts has the default and the catalog).
export const SCREEN_TEST_COST_PER_IMAGE = 0.034;

export type ScreenTestCastRef = {
  name: string;
  colorLabel: string; // human-readable mannequin color, e.g. "burnt orange" — see stageColors.ts
};

// "For now" per the user's own framing — a fixed backdrop swap. A later
// pass could make this a per-shot choice (see studio-room-inspo memory for
// a candidate for the next backdrop option).
const GARDEN_BACKGROUND =
  "outdoor garden — lush greenery, flowering plants, a stone or gravel path, dappled natural daylight";

export function buildScreenTestPrompt(cast: ScreenTestCastRef[]): string {
  const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

  const assignments = cast
    .map(
      (c, i) =>
        `- The ${c.colorLabel} mannequin becomes ${c.name} (the ${ordinal(i + 1)} reference person, ` +
        `shown in reference image ${i + 2}). Copy that person's face, hair, skin tone, and exact ` +
        `outfit from their reference photo onto this mannequin's body — nothing else about this ` +
        `mannequin's placement changes.`
    )
    .join("\n");

  return (
    `TASK: turn reference image 1 — a photo of a physically staged miniature set, with color-coded ` +
    `mannequins standing in deliberately blocked positions and poses — into a photoreal shot, by ` +
    `replacing specific mannequins with specific people and swapping the backdrop. Nothing else ` +
    `about the staging is a suggestion; treat it as measured, physical fact, not a rough sketch.\n\n` +
    `CAST:\n${assignments}\n\n` +
    `Any mannequin in reference image 1 not listed above stays a mannequin exactly as photographed — ` +
    `do not turn it into a person, move it, or remove it.\n\n` +
    `NON-NEGOTIABLE PHYSICAL MATCH — copy these from reference image 1 exactly, per person, with zero ` +
    `artistic adjustment:\n` +
    `- Position: each person's feet land on the exact same ground point their mannequin occupied. Do not ` +
    `shift, center, or re-block anyone.\n` +
    `- Distance and gap: the physical space between people matches reference image 1 to the same scale — ` +
    `if their mannequins stood apart, the people stand apart by the same amount. Do not add, remove, or ` +
    `alter physical contact between people (no embracing, touching, arm-in-arm, or leaning together) unless ` +
    `their mannequins were already touching in exactly that way in reference image 1.\n` +
    `- Pose: copy each mannequin's stance joint-for-joint — spine lean, head tilt and facing direction, ` +
    `shoulder line, arm and elbow angles, hand position, hip rotation, leg stance and weight distribution. ` +
    `A relaxed neutral mannequin pose becomes a relaxed neutral human standing pose at the same angles, not ` +
    `a posed portrait stance.\n` +
    `- Scale and perspective: each person's height and apparent size match their mannequin's exactly, ` +
    `accounting for their distance from camera and reference image 1's lens perspective — nearer mannequins ` +
    `read as nearer, farther ones as farther, with no one enlarged, shrunk, or flattened toward the same size.\n` +
    `- Orientation: each person faces the exact direction their mannequin faced relative to camera and to ` +
    `each other — do not turn anyone to face the camera or another person unless their mannequin already did.\n` +
    `- Occlusion: whichever mannequin was in front stays in front; preserve exactly which body parts overlap ` +
    `or are hidden behind another person or a prop.\n` +
    `- Camera: keep the exact camera framing, focal length/field of view, composition, and crop from ` +
    `reference image 1 — do not reframe, re-center, or zoom.\n\n` +
    `BACKGROUND: replace only the studio backdrop with a sunlit ${GARDEN_BACKGROUND}. Keep every prop ` +
    `(lights, stands, boxes, balls, cameras) from reference image 1 in its exact original position, scale, ` +
    `and orientation — only its surroundings and the ambient light color change.\n\n` +
    `LIGHTING AND REALISM (this is physics, not decoration): light the people consistently with the new ` +
    `garden's sun direction and color temperature — cast a real contact shadow from each person's feet onto ` +
    `the ground at the correct length and direction for that light, and match rim light, skin tone response, ` +
    `and ambient bounce from foliage accordingly. Preserve reference image 1's overall camera height, tilt, ` +
    `and depth of field. Skin, fabric, and hair must respond to the new light like real materials — no flat, ` +
    `pasted-on-looking cutouts.\n\n` +
    `Self-check before finishing: for every person, does their standing position, pose, spacing from the ` +
    `next person, scale, and facing direction match their mannequin in reference image 1 exactly, with no ` +
    `invented touching or repositioning? If not, fix it before returning the image.`
  );
}
