import { expect, test } from "@playwright/test";

// Regression: stopping a "Record take" early used to leave its take flag set,
// so the next "Record clip" with the timeline paused stopped itself at once.
test.setTimeout(120_000);
test("a take stopped early doesn't cut off the next manual recording", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/stage");
  // The server-rendered <canvas> shows up before the renderer exists; three.js
  // stamps data-engine on it once created, which is when recording can work.
  await expect(page.locator("canvas[data-engine]")).toBeVisible({ timeout: 30_000 });
  const stop = page.getByRole("button", { name: "● Stop recording", exact: true });
  // Recording starts after camera view renders a few frames; slow under
  // CI's software WebGL.
  const STARTS = { timeout: 30_000 };

  await page.getByRole("button", { name: "Record take", exact: true }).click();
  await expect(stop).toBeVisible(STARTS);
  const takeClip = page.waitForEvent("download");
  await stop.click();
  expect((await takeClip).suggestedFilename()).toMatch(/^stage-clip-\d+\.webm$/);
  // Stopping the recording doesn't stop the take's playback; the bug only
  // bites once the timeline (TIMELINE_DURATION = 8s) has finished.
  await page.waitForTimeout(9000);

  await page.getByRole("button", { name: "Record clip", exact: true }).click();
  await expect(stop).toBeVisible(STARTS);
  // Long enough for the old bug's effect to have stopped it.
  await page.waitForTimeout(1500);
  await expect(stop).toBeVisible();
  const manualClip = page.waitForEvent("download");
  await stop.click();
  expect((await manualClip).suggestedFilename()).toMatch(/^stage-clip-\d+\.webm$/);
  expect(errors).toEqual([]);
});
