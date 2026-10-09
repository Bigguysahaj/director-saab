import { expect, test, type Locator, type Page } from "@playwright/test";
import { STAGE_LAYOUT_KEY } from "../../src/lib/stageSnapshots";

type Box = { x: number; y: number; width: number; height: number };

const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// A box is keyframable, so selecting it shows the readout and lifts the dock over the Timeline.
async function addBox(page: Page) {
  await page.getByRole("button", { name: "+ Add", exact: true }).click();
  await page.getByRole("button", { name: "+ Box", exact: true }).click();
  const readout = page.getByText("hold ctrl and drag to duplicate").locator("..");
  await expect(readout).toBeVisible();
  return { readout, toolbar: page.locator('[aria-label="Build"]').locator("..") };
}

async function boxes(readout: Locator, toolbar: Locator) {
  return { r: (await readout.boundingBox())!, t: (await toolbar.boundingBox())! };
}

test("readout clears the toolbar on a narrow window", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/stage");
  const { readout, toolbar } = await addBox(page);
  await page.screenshot({ path: "test-results/stage-readout-1024.png" });
  const { r, t } = await boxes(readout, toolbar);
  expect(intersects(r, t)).toBe(false);
});

test("readout rides the toolbar row with and without the Timeline", async ({ page }) => {
  // A light isn't keyframable, so selecting it shows the readout with the dock on the floor.
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify([{ id: 0, kind: "light", position: [0, 0, 0], rotation: [0, 0, 0] }]));
  }, STAGE_LAYOUT_KEY);
  await page.goto("/stage");
  const canvas = page.locator("canvas").first();
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1000); // let the scene draw before clicking into it
  const c = (await canvas.boundingBox())!;
  await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
  const toolbar = page.locator('[aria-label="Build"]').locator("..");
  const lightReadout = page.getByText(/^x -?\d/).locator("..");
  await expect(lightReadout).toBeVisible();
  await page.screenshot({ path: "test-results/stage-readout-light.png" });
  let { r, t } = await boxes(lightReadout, toolbar);
  expect(intersects(r, t)).toBe(false);
  // Bottom-aligned with the toolbar row, so it moves whenever the dock does.
  expect(Math.abs(r.y + r.height - (t.y + t.height))).toBeLessThan(12);

  const { readout } = await addBox(page);
  await expect(page.getByRole("button", { name: "+ Key", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/stage-readout-timeline.png" });
  ({ r, t } = await boxes(readout, toolbar));
  expect(intersects(r, t)).toBe(false);
  expect(Math.abs(r.y + r.height - (t.y + t.height))).toBeLessThan(12);
});

test("readout still clears the toolbar at a very narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 800 });
  await page.goto("/stage");
  const { readout, toolbar } = await addBox(page);
  await page.screenshot({ path: "test-results/stage-readout-800.png" });
  const { r, t } = await boxes(readout, toolbar);
  expect(intersects(r, t)).toBe(false);
});
