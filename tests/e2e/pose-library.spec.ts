import { expect, test } from "@playwright/test";

test("save, reload, apply, and delete a pose through the stage UI", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/stage");
  await page.getByRole("button", { name: "+ Inventory", exact: true }).click();
  await page.getByRole("button", { name: "+ Mannequin", exact: true }).click();
  await page.getByRole("button", { name: "Pose", exact: true }).click();
  const panel = page.getByRole("region", { name: "Mannequin pose editor" });
  await panel.getByRole("button", { name: "Wave", exact: true }).click();
  await panel.getByRole("combobox", { name: "Joint", exact: true }).selectOption("rightArm");
  await expect(panel.getByRole("spinbutton", { name: "Spread (Z) degrees", exact: true })).toHaveValue("126");
  await panel.getByRole("textbox", { name: "Pose name" }).fill("My greeting");
  await panel.getByRole("button", { name: "Save current pose" }).click();
  await expect(panel.getByRole("status")).toHaveText("Saved My greeting.");
  await page.reload();
  // Add a different figure: the library must survive and be reusable across figures.
  await page.getByRole("button", { name: "+ Inventory", exact: true }).click();
  await page.getByRole("button", { name: "+ Mannequin", exact: true }).click();
  await page.getByRole("button", { name: "Pose", exact: true }).click();
  await panel.getByRole("tab", { name: "My poses" }).click();
  await panel.getByRole("button", { name: "My greeting", exact: true }).click();
  await panel.getByRole("combobox", { name: "Joint", exact: true }).selectOption("rightArm");
  await expect(panel.getByRole("spinbutton", { name: "Spread (Z) degrees", exact: true })).toHaveValue("126");
  const downloadPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Export saved" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("director-poses.json");
  await page.screenshot({ path: "test-results/stage-pose-library.png" });
  await panel.getByRole("button", { name: "Delete My greeting" }).click();
  await expect(panel.getByRole("button", { name: "My greeting", exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("rejects incompatible packs and accepts valid packs without losing the figure", async ({ page }) => {
  await page.goto("/stage");
  await page.getByRole("button", { name: "+ Inventory", exact: true }).click();
  await page.getByRole("button", { name: "+ Mannequin", exact: true }).click();
  await page.getByRole("button", { name: "Pose", exact: true }).click();
  await page.getByLabel("Import pose pack", { exact: true }).setInputFiles({
    name: "invalid.json", mimeType: "application/json", buffer: Buffer.from('{"version":99,"rig":"other","poses":[]}'),
  });
  await expect(page.locator("p[role=alert]")).toContainText("unsupported version or rig");
  await expect(page.getByRole("spinbutton", { name: "Spread (Z) degrees", exact: true })).toHaveValue("-9");
  await page.getByLabel("Import pose pack", { exact: true }).setInputFiles({
    name: "greeting.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({
      version: 1, rig: "director-mannequin-v1", poses: [{ id: "pack-pose", name: "Imported greeting", pose: { leftArm: [0, 0, -1] } }],
    })),
  });
  await expect(page.locator("p[role=alert]")).toHaveCount(0);
  await page.getByRole("button", { name: "Imported greeting", exact: true }).click();
  await expect(page.getByRole("spinbutton", { name: "Spread (Z) degrees", exact: true })).toHaveValue("-57");
});
