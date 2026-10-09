import { expect, test } from "@playwright/test";

test("Screen Test has its own page", async ({ page }) => {
  await page.goto("/audition");
  await expect(page.getByRole("heading", { name: "Screen Test" })).toHaveCount(0);
  await page.getByRole("link", { name: "Screen Test" }).click();
  await expect(page).toHaveURL(/\/screen-test$/);
  await expect(page.getByRole("heading", { name: "Screen Test" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload stage photo" })).toBeVisible();
});
