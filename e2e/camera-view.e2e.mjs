// End-to-end check of camera-view fly controls, run against a live dev server:
//   npx next dev -p 3111 &   node e2e/camera-view.e2e.mjs [baseUrl]
// Observes the camera through the auto-saved layout in localStorage, so it
// needs no test hooks in the app. Playwright is resolved locally, else from
// the global install.
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { join } from "node:path";
import * as THREE from "three";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(join(execSync("npm root -g").toString().trim(), "playwright")));
}

const BASE = process.argv[2] ?? "http://localhost:3111";
const KEY = "director-stage-layout-v3";
const SPEED = 2.5; // keep in sync with FLY_SPEED

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const v = (a) => new THREE.Vector3(...a);
const fwd = (rot) => new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(...rot, "XYZ"));
const right = (rot) => new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(...rot, "XYZ"));
const fmt = (vec) => vec.toArray().map((n) => n.toFixed(2)).join(",");

const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

const cam = () =>
  page.evaluate((key) => {
    const c = JSON.parse(localStorage.getItem(key)).find((o) => o.kind === "camera");
    return { position: c.position, rotation: c.rotation };
  }, KEY);
const settle = () => page.waitForTimeout(250);

async function freshStage() {
  await page.goto(`${BASE}/stage`);
  await page.evaluate((key) => localStorage.removeItem(key), KEY);
  await page.reload();
  await page.waitForSelector("canvas");
  await page.waitForTimeout(1500); // first frames + initial autosave
  await page.mouse.move(400, 200);
}
/** Holds `keys` for `ms`; returns the camera before/after and the real hold time. */
async function hold(keys, ms) {
  const before = await cam();
  const t0 = Date.now();
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys.slice().reverse()) await page.keyboard.up(k);
  const held = (Date.now() - t0) / 1000;
  await settle();
  return { before, after: await cam(), held };
}
const delta = ({ before, after }) => v(after.position).sub(v(before.position));
const enterCameraView = () => page.getByRole("button", { name: "View", exact: true }).click();
const exitCameraView = () => page.getByRole("button", { name: "Exit camera view" }).click();

// ---------------------------------------------------------------- 1. inert outside camera view
await freshStage();
{
  const r = await hold(["w"], 700);
  check("W outside camera view does not move the camera", delta(r).length() < 1e-6, fmt(delta(r)));
}

// ---------------------------------------------------------------- 2. roll keys were remapped, W no longer rolls
{
  const before = await cam();
  await page.keyboard.down(".");
  await page.waitForTimeout(500);
  await page.keyboard.up(".");
  await settle();
  const afterRoll = await cam();
  check("'.' rolls the camera (roll-right moved off W)", Math.abs(afterRoll.rotation[2] - before.rotation[2]) > 0.05, `dz=${(afterRoll.rotation[2] - before.rotation[2]).toFixed(3)}`);
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  await settle();
  const afterW = await cam();
  check("W no longer rolls the camera", Math.abs(afterW.rotation[2] - afterRoll.rotation[2]) < 1e-6);
}

// ---------------------------------------------------------------- 3. movement in camera view
await freshStage();
await enterCameraView();
await page.waitForTimeout(300);
{
  const hint = await page.getByText("W A S D move").isVisible();
  check("fly-controls hint is shown in camera view", hint);

  const r = await hold(["w"], 1000);
  const d = delta(r);
  const f = fwd(r.before.rotation);
  const along = d.dot(f);
  const expected = SPEED * r.held;
  check("W flies forward along the view direction at ~FLY_SPEED", along > expected * 0.6 && along < expected * 1.3 && d.clone().addScaledVector(f, -along).length() < 0.1, `moved ${along.toFixed(2)}m, expected ~${expected.toFixed(2)}m, off-axis ${fmt(d.clone().addScaledVector(f, -along))}`);
  check("flying doesn't change the camera's rotation", v(r.after.rotation).distanceTo(v(r.before.rotation)) < 1e-6);

  const back = await hold(["s"], 500);
  check("S flies backward", delta(back).dot(fwd(back.before.rotation)) < -0.5);

  const strafe = await hold(["d"], 600);
  const sd = delta(strafe);
  check("D strafes right, perpendicular to the view", sd.dot(right(strafe.before.rotation)) > 0.8 && Math.abs(sd.dot(fwd(strafe.before.rotation))) < 0.1, fmt(sd));
  const left = await hold(["a"], 600);
  check("A strafes left", delta(left).dot(right(left.before.rotation)) < -0.8);

  const up = await hold(["e"], 400);
  const ud = delta(up);
  check("E rises straight up", ud.y > 0.6 && Math.abs(ud.x) < 1e-6 && Math.abs(ud.z) < 1e-6, fmt(ud));
  const down = await hold(["q"], 300);
  check("Q descends straight down", delta(down).y < -0.4);
}

// ---------------------------------------------------------------- 4. boost + diagonal
await freshStage();
await enterCameraView();
{
  const slow = await hold(["w"], 800);
  const boosted = await hold(["Shift", "w"], 800);
  const ratio = delta(boosted).length() / boosted.held / (delta(slow).length() / slow.held);
  check("Shift boosts speed (~3x)", ratio > 2.2 && ratio < 3.8, `ratio ${ratio.toFixed(2)}`);
}

// ---------------------------------------------------------------- 5. room bounds
await freshStage();
await enterCameraView();
{
  const r = await hold(["q"], 2500);
  check("camera can't sink below the floor", r.after.position[1] >= 0.2 - 1e-6 && r.after.position[1] < 0.25, `y=${r.after.position[1].toFixed(3)}`);
  const c = await hold(["e"], 4000);
  check("camera can't rise through the ceiling", c.after.position[1] <= 7.5 + 1e-6, `y=${c.after.position[1].toFixed(3)}`);
}

// ---------------------------------------------------------------- 6. mouse-look
await freshStage();
await enterCameraView();
{
  const before = await cam();
  await page.mouse.move(400, 250);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(500, 250, { steps: 8 });
  await page.mouse.up({ button: "right" });
  await settle();
  const after = await cam();
  const turned = fwd(before.rotation).angleTo(fwd(after.rotation));
  const expectedTurn = 100 * 0.003;
  check("right-drag right turns the view right", fwd(after.rotation).dot(right(before.rotation)) > fwd(before.rotation).dot(right(before.rotation)) && turned > expectedTurn * 0.7, `turned ${turned.toFixed(3)} rad, expected ~${expectedTurn.toFixed(3)}`);
  check("looking doesn't move the camera", v(after.position).distanceTo(v(before.position)) < 1e-9);
  check("yaw keeps the horizon (pitch unchanged)", Math.abs(Math.asin(fwd(after.rotation).y) - Math.asin(fwd(before.rotation).y)) < 1e-3);

  const mid = await cam();
  await page.mouse.move(400, 150);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(400, 350, { steps: 8 });
  await page.mouse.up({ button: "right" });
  await settle();
  const down = await cam();
  check("right-drag down looks down", Math.asin(fwd(down.rotation).y) < Math.asin(fwd(mid.rotation).y) - 0.3);

  const lm = await cam();
  await page.mouse.move(400, 150);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(560, 150, { steps: 8 });
  await page.mouse.up({ button: "left" });
  await settle();
  const la = await cam();
  check("left-drag does NOT look (leaves gizmos/selection alone)", v(la.rotation).distanceTo(v(lm.rotation)) < 1e-9);

  const blocked = await page.evaluate(() => {
    const ev = new MouseEvent("contextmenu", { cancelable: true, bubbles: true });
    document.querySelector("canvas").dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  check("right-click menu suppressed in camera view", blocked === true);
}

// ---------------------------------------------------------------- 7. trackpad alternatives
await freshStage();
await enterCameraView();
{
  const controls = page.getByLabel("Camera view controls");
  check("shortcut details start collapsed", !(await controls.locator("details").evaluate((el) => el.open)));
  check("collapsed camera controls fit in a compact single row", (await controls.boundingBox()).height < 60);
  await controls.locator("summary").click();
  check("camera view labels yaw, pitch, roll, zoom and dolly shortcuts",
    await controls.getByText("Pan / yaw — left / right").isVisible() &&
    await controls.getByText("Tilt / pitch — up / down").isVisible() &&
    await controls.getByText("Roll — left / right").isVisible() &&
    await controls.getByText("Zoom in / out", { exact: true }).isVisible() &&
    await controls.getByText("Dolly zoom in / out", { exact: true }).isVisible());
  await controls.locator("summary").focus();
  await page.keyboard.press("Enter");
  check("shortcut details can be closed with the keyboard", !(await controls.locator("details").evaluate((el) => el.open)));
  const before = await cam();
  await page.keyboard.down("f");
  await page.mouse.move(400, 200);
  await page.mouse.down();
  await page.mouse.move(500, 240, { steps: 8 });
  // Releasing F must stop the gesture even if the mouse is still held.
  await page.keyboard.up("f");
  await settle();
  const after = await cam();
  check("F + left-drag yaws and pitches without moving the camera",
    fwd(before.rotation).angleTo(fwd(after.rotation)) > 0.2 &&
    fwd(after.rotation).y < fwd(before.rotation).y - 0.05 &&
    v(after.position).distanceTo(v(before.position)) < 1e-9);
  await page.mouse.move(550, 270, { steps: 8 });
  await page.mouse.up();
  await settle();
  check("releasing F ends look immediately", v((await cam()).rotation).distanceTo(v(after.rotation)) < 1e-9);

  await page.getByRole("button", { name: "Drag to look off", exact: true }).click();
  check("Drag to look button exposes its active state", await page.getByRole("button", { name: "Drag to look on", exact: true }).getAttribute("aria-pressed") === "true");
  const toggledBefore = await cam();
  await page.mouse.move(400, 200);
  await page.mouse.down();
  await page.mouse.move(500, 250, { steps: 8 });
  await page.mouse.up();
  await settle();
  const toggledAfter = await cam();
  check("Drag to look allows plain left-drag", fwd(toggledAfter.rotation).angleTo(fwd(toggledBefore.rotation)) > 0.2);
  await page.getByRole("button", { name: "Drag to look on", exact: true }).click();
  await page.mouse.move(400, 200);
  await page.mouse.down();
  await page.mouse.move(500, 250, { steps: 8 });
  await page.mouse.up();
  await settle();
  check("turning Drag to look off restores ordinary left-drag", v((await cam()).rotation).distanceTo(v(toggledAfter.rotation)) < 1e-9);

  // A cancelled trackpad gesture must persist and release its capture.
  await page.keyboard.down("f");
  await page.mouse.move(400, 200);
  await page.mouse.down();
  await page.mouse.move(440, 220, { steps: 4 });
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    canvas.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }));
  });
  await settle();
  const cancelled = await cam();
  await page.mouse.move(500, 270, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("f");
  await settle();
  check("pointer cancellation stops and persists look", v((await cam()).rotation).distanceTo(v(cancelled.rotation)) < 1e-9 && v(cancelled.rotation).distanceTo(v(toggledAfter.rotation)) > 0.05);
}

// ---------------------------------------------------------------- 8. typing in a field must not fly
await freshStage();
await enterCameraView();
{
  await page.getByRole("button", { name: "+ Add" }).click();
  const input = page.locator('input[type="number"]').first();
  await input.focus();
  const before = await cam();
  await page.keyboard.type("wasdqef", { delay: 80 });
  await page.waitForTimeout(400);
  const after = await cam();
  check("typing in an input doesn't fly the camera", v(after.position).distanceTo(v(before.position)) < 1e-9);
  await page.keyboard.down("f");
  await page.mouse.move(400, 200);
  await page.mouse.down();
  await page.mouse.move(500, 250, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("f");
  await settle();
  check("F pressed in a field doesn't enable look", v((await cam()).rotation).distanceTo(v(before.rotation)) < 1e-9);
}

// ---------------------------------------------------------------- 9. persistence + exit
await freshStage();
await enterCameraView();
{
  const r = await hold(["w"], 600);
  const moved = delta(r);
  await page.reload();
  await page.waitForSelector("canvas");
  await page.waitForTimeout(1200);
  const reloaded = await cam();
  check("flown position survives a reload", v(reloaded.position).distanceTo(v(r.after.position)) < 1e-6 && moved.length() > 0.5);

  await enterCameraView();
  await exitCameraView();
  const out = await hold(["w"], 500);
  check("after exiting camera view, W is inert again", delta(out).length() < 1e-6);
}

await browser.close();
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
