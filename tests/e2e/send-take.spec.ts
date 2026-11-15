import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

// 3 s, 90×160 test pattern. VP9 in MP4 because Playwright's Chromium has no
// H.264 decoder; the container is what Seedance checks.
const TAKE = path.join(__dirname, "fixtures", "take-3s.mp4");

test("Send take previews the cost and only calls /api/generate after Confirm", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const bodies: Record<string, unknown>[] = [];
  // Mocked: never reach the real (paid) endpoint.
  await page.route(
    (url) => url.pathname === "/api/generate",
    async (route) => {
      bodies.push(route.request().postDataJSON());
      await route.fulfill({ status: 202, json: { id: "job-test", polling_url: "", status: "pending" } });
    }
  );
  await page.route("**/api/generate/job-test**", (route) => route.fulfill({ json: { id: "job-test", status: "in_progress" } }));

  await page.goto("/");
  await page.getByText("Send a stage take", { exact: true }).click();
  await page.getByLabel("Take video").setInputFiles(TAKE);
  await page.getByLabel("Reference images").setInputFiles({
    name: "character.png",
    mimeType: "image/png",
    // 1×1 transparent PNG
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByLabel("Take prompt")).toHaveValue(/@Video1.*@Image1/);
  await expect(page.getByLabel("Take model")).toHaveValue("bytedance/seedance-2.0-mini");

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.getByRole("region", { name: "Take preview" });
  await expect(preview.locator("video")).toBeVisible();
  await expect(preview.getByRole("img", { name: "@Image1" })).toBeVisible();
  await expect(page.getByTestId("take-cost")).toHaveText(/\$0\.\d\d\b/);
  await page.screenshot({ path: "test-results/send-take-preview.png", fullPage: true });
  expect(bodies).toHaveLength(0);

  await page.getByRole("button", { name: "Confirm & generate", exact: true }).click();
  await expect.poll(() => bodies.length).toBe(1);
  await page.waitForTimeout(500);
  expect(bodies).toHaveLength(1);
  const body = bodies[0] as { model: string; aspect_ratio: string; input_references: { type: string; video_url?: { url: string } }[] };
  expect(body.model).toBe("bytedance/seedance-2.0-mini");
  expect(body.aspect_ratio).toBe("9:16");
  expect(body.input_references.map((r) => r.type)).toEqual(["video_url", "image_url"]);
  expect(body.input_references[0].video_url?.url).toMatch(/^data:video\/mp4;base64,/);
  expect(errors).toEqual([]);
});

test("9:16 lock makes Capture photo a 9:16 PNG", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/stage");
  await expect(page.locator("canvas[data-engine]")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "9:16", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByText("Capture ▾", { exact: true }).click();
  await page.getByRole("button", { name: "Photo", exact: true }).click();
  const png = await readFile((await (await download).path())!);
  // PNG IHDR: width and height are big-endian uint32s at bytes 16 and 20.
  const ratio = png.readUInt32BE(16) / png.readUInt32BE(20);
  expect(Math.abs(ratio / (9 / 16) - 1)).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

const VOICE = path.join(__dirname, "fixtures", "voice-1s.mp3");
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

async function openSendTake(page: import("@playwright/test").Page) {
  await page.route("**/api/tts/voices", (route) => route.fulfill({ json: [{ id: "v-rachel", name: "Rachel" }, { id: "v-adam", name: "Adam" }] }));
  await page.goto("/");
  await page.getByText("Send a stage take", { exact: true }).click();
  await page.getByLabel("Take video").setInputFiles(TAKE);
  await page.getByLabel("Reference images").setInputFiles({ name: "character.png", mimeType: "image/png", buffer: PNG_1PX });
  await page.getByRole("button", { name: "Generate voice line", exact: true }).click();
}

test("Generate voice line feeds @Audio1", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ttsBodies: Record<string, unknown>[] = [];
  const bodies: Record<string, unknown>[] = [];
  const mp3 = await readFile(VOICE);
  await page.route("**/api/tts", async (route) => {
    ttsBodies.push(route.request().postDataJSON());
    await route.fulfill({ body: mp3, contentType: "audio/mpeg" });
  });
  await page.route((url) => url.pathname === "/api/generate", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 202, json: { id: "job-tts", polling_url: "", status: "pending" } });
  });
  await page.route("**/api/generate/job-tts**", (route) => route.fulfill({ json: { id: "job-tts", status: "in_progress" } }));

  await openSendTake(page);
  await page.getByLabel("Voice line text").fill("We go at dawn.");
  await page.getByLabel("Voice", { exact: true }).selectOption("v-adam");
  await page.getByRole("button", { name: "Generate", exact: true }).click();

  await expect(page.getByLabel("Generated voice line")).toBeVisible();
  expect(ttsBodies).toEqual([{ text: "We go at dawn.", voiceId: "v-adam" }]);
  await expect(page.getByLabel("Take prompt")).toHaveValue(/@Audio1/);

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByLabel("Voice line preview")).toBeVisible();
  await page.getByRole("button", { name: "Confirm & generate", exact: true }).click();
  await expect.poll(() => bodies.length).toBe(1);
  const refs = (bodies[0] as { input_references: { type: string }[] }).input_references;
  expect(refs[refs.length - 1].type).toBe("audio_url");
  expect(errors).toEqual([]);
});

test("TTS failure shows an error and keeps the form usable", async ({ page }) => {
  await page.route("**/api/tts", (route) => route.fulfill({ status: 502, json: { error: "ElevenLabs failed (422): bad voice" } }));
  await openSendTake(page);
  await page.getByLabel("Voice line text").fill("We go at dawn.");
  await page.getByRole("button", { name: "Generate", exact: true }).click();

  await expect(page.getByRole("alert").filter({ hasText: "bad voice" })).toBeVisible();
  await expect(page.getByLabel("Generated voice line")).toHaveCount(0);
  await expect(page.getByLabel("Take prompt")).not.toHaveValue(/@Audio1/);
  await page.getByLabel("Voice line", { exact: true }).setInputFiles(VOICE);
  await expect(page.getByLabel("Take prompt")).toHaveValue(/@Audio1/);
});
