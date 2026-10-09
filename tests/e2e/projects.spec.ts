import { rm } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The dev server for e2e runs with DIRECTOR_DATA_DIR=.data-e2e (see
// playwright.config.ts), so these tests never touch the real .data/.
const DATA = path.join(__dirname, "..", "..", ".data-e2e", "projects");

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  await rm(DATA, { recursive: true, force: true });
  // An existing cast member in Default, standing in for today's roster.
  const res = await request.post("/api/cast?project=default", { data: { name: "Asha" } });
  expect(res.ok()).toBe(true);
});

// Audition shows each member's name in an editable text box.
function castNames(page: Page) {
  return page.locator("input:not([type=file])").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
}

// "No cast yet" also shows before the roster loads, so wait for the real
// response. CI's dev server can take a while when other specs are compiling.
async function openAudition(page: Page) {
  const loaded = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/cast" && r.ok(), { timeout: 30_000 });
  await page.goto("/audition");
  await loaded;
}

async function switchTo(page: Page, name: string) {
  await page.getByRole("button", { name: "Switch project" }).click();
  await page.getByRole("menuitem", { name }).click();
  await expect(page.getByTestId("active-project")).toHaveText(name);
}

test("create Gini-first-vid and it becomes the active project", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("active-project")).toHaveText("Default");
  await page.getByRole("button", { name: "Switch project" }).click();
  await page.getByRole("menuitem", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Gini-first-vid");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("active-project")).toHaveText("Gini-first-vid");
  await page.screenshot({ path: "test-results/projects-picker.png" });
});

test("Gini-first-vid has an empty cast while Default keeps the old one", async ({ page }) => {
  await openAudition(page);
  await expect(page.getByText("No cast yet — add one to get started.")).toBeVisible();
  expect(await castNames(page)).not.toContain("Asha");

  await page.goto("/");
  await switchTo(page, "Default");
  await openAudition(page);
  await expect.poll(() => castNames(page), { timeout: 30_000 }).toContain("Asha");

  await page.goto("/");
  await switchTo(page, "Gini-first-vid");
});

test("the active project survives a reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("active-project")).toHaveText("Gini-first-vid");
  await page.reload();
  await expect(page.getByTestId("active-project")).toHaveText("Gini-first-vid");
});

test("a take sent in Gini-first-vid only shows in its own Dailies", async ({ page }) => {
  // Mocked: never reach the real (paid) endpoint.
  await page.route(
    (url) => url.pathname === "/api/generate",
    (route) => route.fulfill({ status: 202, json: { id: "job-gini", polling_url: "", status: "pending" } })
  );
  await page.route("**/api/generate/job-gini", (route) =>
    route.fulfill({ json: { id: "job-gini", status: "completed", usage: { cost: 0.01 } } })
  );

  await page.goto("/");
  await expect(page.getByTestId("active-project")).toHaveText("Gini-first-vid");
  await page.getByPlaceholder(/A lone figure walks/).fill("Gini walks into frame");
  await page.getByRole("button", { name: "Action" }).click();
  await expect(page.getByRole("button", { name: /Gini walks into frame/ })).toBeVisible();

  await switchTo(page, "Default");
  await expect(page.getByRole("button", { name: /Gini walks into frame/ })).toHaveCount(0);

  await switchTo(page, "Gini-first-vid");
  await expect(page.getByRole("button", { name: /Gini walks into frame/ })).toBeVisible();
});

// Last in the sequence: it gives Gini-first-vid a cast member.
test("Audition adds Gini to Gini-first-vid from a ready-made sheet", async ({ page, request }) => {
  await openAudition(page);
  await page.getByRole("button", { name: "+ Add from sheet" }).click();
  await page.getByLabel("Cast member name").fill("Gini");
  await page.getByLabel("Character sheet").setInputFiles({
    name: "sheet.png",
    mimeType: "image/png",
    // 1×1 transparent PNG, standing in for a character sheet.
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"),
  });
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByRole("img", { name: "Gini" })).toBeVisible();
  const roster = await (await request.get("/api/cast?project=gini-first-vid")).json();
  expect(roster).toEqual([expect.objectContaining({ name: "Gini", sheet: expect.stringContaining("/api/cast/") })]);
});
