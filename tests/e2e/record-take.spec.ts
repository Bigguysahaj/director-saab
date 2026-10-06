import { expect, test } from "@playwright/test";

// Regression: stopping a "Record take" early used to leave its take flag set,
// so the next "Record clip" with the timeline paused stopped itself at once.
test.setTimeout(60_000);
test("a take stopped early doesn't cut off the next manual recording", async ({ page }) => {
  await page.goto("/stage");
  await expect(page.locator("canvas")).toBeVisible();
  const stop = page.getByRole("button", { name: "● Stop recording", exact: true });

  await page.getByRole("button", { name: "Record take", exact: true }).click();
  await expect(stop).toBeVisible();
  const takeClip = page.waitForEvent("download");
  await stop.click();
  expect((await takeClip).suggestedFilename()).toMatch(/^stage-clip-\d+\.webm$/);
  // Stopping the recording doesn't stop the take's playback; the bug only
  // bites once the timeline (TIMELINE_DURATION = 8s) has finished.
  await page.waitForTimeout(9000);

  await page.getByRole("button", { name: "Record clip", exact: true }).click();
  await expect(stop).toBeVisible();
  // Long enough for the old bug's effect to have stopped it.
  await page.waitForTimeout(1500);
  await expect(stop).toBeVisible();
  const manualClip = page.waitForEvent("download");
  await stop.click();
  expect((await manualClip).suggestedFilename()).toMatch(/^stage-clip-\d+\.webm$/);
});
