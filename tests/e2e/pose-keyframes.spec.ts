import { expect, test, type Page } from "@playwright/test";
import { TIMELINE_DURATION } from "../../src/components/stage/types";

// The timeline track has no accessible handle, so scrub by clicking at the
// fraction of its width that maps to `seconds`.
async function scrubTo(page: Page, seconds: number) {
  const box = (await page.locator("div.touch-none.cursor-pointer").boundingBox())!;
  // 1 px in so 0 s still lands on the track rather than its edge.
  await page.mouse.click(box.x + Math.max(1, (box.width * seconds) / TIMELINE_DURATION), box.y + box.height / 2);
  await expect(page.getByText(`${seconds.toFixed(1)}s`, { exact: true })).toBeVisible();
}

test("pose keys interpolate: Bow at 0 s, Neutral auto-keyed at 4 s, halfway bend at 2 s", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/stage");
  await page.getByRole("button", { name: "+ Inventory", exact: true }).click();
  await page.getByRole("button", { name: "+ Mannequin", exact: true }).click();
  await page.getByRole("button", { name: "Pose", exact: true }).click();
  const panel = page.getByRole("region", { name: "Mannequin pose editor" });
  const bend = panel.getByRole("spinbutton", { name: "Bend (X) degrees", exact: true });

  await panel.getByRole("button", { name: "Bow", exact: true }).click();
  await panel.getByRole("combobox", { name: "Joint", exact: true }).selectOption("spine");
  await expect(bend).toHaveValue("37");
  await page.getByRole("button", { name: "+ Key", exact: true }).click();
  await page.screenshot({ path: "test-results/stage-pose-keyframes-0s.png" });

  // The figure now has a pose key, so applying a pose elsewhere keys it there.
  await scrubTo(page, 4);
  await expect(bend).toHaveValue("37"); // holds the only key's pose past it
  await panel.getByRole("button", { name: "Neutral", exact: true }).click();
  await expect(bend).toHaveValue("0");
  await page.screenshot({ path: "test-results/stage-pose-keyframes-4s.png" });

  await scrubTo(page, 2);
  const mid = Number(await bend.inputValue());
  expect(mid).toBeGreaterThan(0);
  expect(mid).toBeLessThan(37);
  await page.screenshot({ path: "test-results/stage-pose-keyframes-2s.png" });

  // Back at 0 s the Bow key is untouched by the Neutral edit.
  await scrubTo(page, 0);
  await expect(bend).toHaveValue("37");
  expect(errors).toEqual([]);
});
