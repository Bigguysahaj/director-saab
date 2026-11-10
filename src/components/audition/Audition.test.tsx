import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Audition } from "./Audition";

const GEMINI = "google/gemini-3.1-flash-lite-image";
const FLASH = "bytedance-seed/seedream-5-0-flash";
let sheetBodies: { model?: string }[];

function setup(shots: Record<string, { image: string; cost: number }> = {}) {
  sheetBodies = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (url === "/api/projects") return json({ projects: [{ id: "p1", name: "P1" }], activeId: "p1" });
    if (url.startsWith("/api/cast?")) return json([{ id: "m1", name: "Ana", photo: "/photo.png", shots, stageColor: null, sheet: "", closeup: "" }]);
    if (url === "/api/image-models") return json({
      models: [
        { id: GEMINI, label: "Gemini", provider: "Google", tagline: "", maxInputReferences: 3 },
        { id: FLASH, label: "Seedream 5.0 Flash", provider: "ByteDance Seed", tagline: "", maxInputReferences: 14 },
      ],
      default: GEMINI,
    });
    if (url === "/api/character-sheet") {
      sheetBodies.push(JSON.parse(String(init?.body)));
      return json({ error: "stop here" }, 502);
    }
    // jsdom's FileReader only reads jsdom Blobs, not the ones Response.blob() makes.
    return { ok: true, blob: async () => new Blob(["P"], { type: "image/png" }) } as Response;
  });
  render(<Audition />);
}

beforeEach(() => { try { localStorage.clear(); } catch {} });
afterEach(cleanup);

async function picker() {
  await screen.findByRole("option", { name: /Seedream 5.0 Flash/ });
  return screen.getByLabelText("Image model") as HTMLSelectElement;
}

describe("Audition image model", () => {
  it("sends the picked model on Generate", async () => {
    setup();
    fireEvent.change(await picker(), { target: { value: FLASH } });
    fireEvent.click(screen.getByRole("button", { name: "Generate character sheet" }));
    await waitFor(() => expect(sheetBodies).toHaveLength(1));
    expect(sheetBodies[0].model).toBe(FLASH);
  });

  it("sends the picked model on Regenerate", async () => {
    setup({ front: { image: "/front.png", cost: 0.004 } });
    fireEvent.change(await picker(), { target: { value: FLASH } });
    fireEvent.click(screen.getByRole("button", { name: "Regenerate sheet" }));
    await waitFor(() => expect(sheetBodies).toHaveLength(1));
    expect(sheetBodies[0].model).toBe(FLASH);
  });

  it("defaults to Gemini", async () => {
    setup();
    expect((await picker()).value).toBe(GEMINI);
    fireEvent.click(screen.getByRole("button", { name: "Generate character sheet" }));
    await waitFor(() => expect(sheetBodies).toHaveLength(1));
    expect(sheetBodies[0].model).toBe(GEMINI);
  });
});
