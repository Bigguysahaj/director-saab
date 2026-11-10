import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Audition } from "./Audition";

const GEMINI = "google/gemini-3.1-flash-lite-image";
const FLASH = "bytedance-seed/seedream-5-0-flash";
type Member = { id: string; name: string; photo: string; shots: Record<string, { image: string; cost: number }>; stageColor: null; sheet: string; closeup: string; candidates: string[] };
let sheetBodies: { model?: string }[];
let editBodies: { image: string; prompt: string; model?: string }[];
let patches: Record<string, unknown>[];
let patchResponse: Member | null;

function setup(overrides: Partial<Member> = {}) {
  sheetBodies = [];
  editBodies = [];
  patches = [];
  patchResponse = null;
  const member: Member = { id: "m1", name: "Ana", photo: "/photo.png", shots: {}, stageColor: null, sheet: "", closeup: "", candidates: [], ...overrides };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (url === "/api/projects") return json({ projects: [{ id: "p1", name: "P1" }], activeId: "p1" });
    if (url.startsWith("/api/cast?")) return json([member]);
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
    if (url === "/api/image-edit") {
      editBodies.push(JSON.parse(String(init?.body)));
      return json({ image: "data:image/png;base64,NEW", cost: 0.018, model: FLASH });
    }
    if (url.startsWith("/api/cast/m1") && init?.method === "PATCH") {
      patches.push(JSON.parse(String(init.body)));
      return json(patchResponse ?? member);
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
    setup({ shots: { front: { image: "/front.png", cost: 0.004 } } });
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

  it("shows the picked model's price as the estimate", async () => {
    setup();
    await picker();
    expect(screen.getByText("est. $0.034")).toBeTruthy();
    fireEvent.change(await picker(), { target: { value: FLASH } });
    expect(screen.getByText("est. $0.018")).toBeTruthy();
  });

  it("opens a shot in a popup with a download link", async () => {
    setup({ shots: { "angle-front": { image: "/front.png", cost: 0.004 } } });
    fireEvent.click(await screen.findByRole("img", { name: "Front" }));
    const dialog = screen.getByRole("dialog", { name: "Front" });
    const link = dialog.querySelector("a[download]") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/front.png");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

const SHEET = "/api/cast/m1/file/sheet.png?project=p1";
const CLOSEUP = "/api/cast/m1/file/closeup.png?project=p1";
const CAND = "/api/cast/m1/file/candidate-abc.png?project=p1";

async function openEdit() {
  setup({ photo: "", sheet: SHEET });
  fireEvent.click(await screen.findByRole("button", { name: "Edit sheet" }));
  await screen.findAllByRole("option", { name: /Seedream 5.0 Flash/ });
  fireEvent.change(screen.getByLabelText("Edit model"), { target: { value: FLASH } });
  fireEvent.change(screen.getByLabelText("Edit prompt"), { target: { value: "make the jacket red" } });
  fireEvent.click(screen.getByRole("button", { name: "Run edit" }));
  await screen.findByRole("img", { name: "Edited sheet" });
}

describe("Audition supplied sheet", () => {
  it("shows the sheet and close-up with no call to generate", async () => {
    setup({ photo: "", sheet: SHEET, closeup: CLOSEUP });
    fireEvent.click(await screen.findByRole("img", { name: "Ana sheet" }));
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Download" }).getAttribute("href")).toBe(SHEET);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("img", { name: "Ana close-up" }));
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Download" }).getAttribute("href")).toBe(CLOSEUP);
    expect(screen.queryByRole("button", { name: "Upload photo" })).toBeNull();
    expect(screen.queryByText(/^est\./)).toBeNull();
    expect(screen.queryByRole("button", { name: "Generate character sheet" })).toBeNull();
  });

  it("keeps the photo card for members without a sheet", async () => {
    setup({ photo: "" });
    expect(await screen.findByRole("button", { name: "Upload photo" })).toBeTruthy();
    await picker();
    expect(screen.getByText("est. $0.034")).toBeTruthy();
  });

  it("edits the sheet with one call and shows old next to new", async () => {
    await openEdit();
    expect(screen.getByText("est. $0.018")).toBeTruthy();
    expect(editBodies).toHaveLength(1);
    expect(editBodies[0]).toMatchObject({ prompt: "make the jacket red", model: FLASH });
    expect(editBodies[0].image).toMatch(/^data:image\/png;base64,/);
    expect(screen.getByRole("img", { name: "Current sheet" }).getAttribute("src")).toBe(SHEET);
    fireEvent.click(screen.getByRole("img", { name: "Edited sheet" }));
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Download" }).getAttribute("href")).toBe("data:image/png;base64,NEW");
    expect(patches).toEqual([]);
  });

  it("Discard saves nothing", async () => {
    await openEdit();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("img", { name: "Edited sheet" })).toBeNull();
    expect(patches).toEqual([]);
  });

  it("Replace main patches the sheet", async () => {
    await openEdit();
    patchResponse = { id: "m1", name: "Ana", photo: "", shots: {}, stageColor: null, sheet: "/api/cast/m1/file/sheet.jpg?project=p1", closeup: "", candidates: [SHEET] };
    fireEvent.click(screen.getByRole("button", { name: "Replace main" }));
    await waitFor(() => expect(patches).toEqual([{ sheet: "data:image/png;base64,NEW" }]));
    expect((await screen.findByRole("img", { name: "Ana sheet" })).getAttribute("src")).toBe("/api/cast/m1/file/sheet.jpg?project=p1");
  });

  it("Keep as candidate patches a new candidate", async () => {
    await openEdit();
    patchResponse = { id: "m1", name: "Ana", photo: "", shots: {}, stageColor: null, sheet: SHEET, closeup: "", candidates: [CAND] };
    fireEvent.click(screen.getByRole("button", { name: "Keep as candidate" }));
    await waitFor(() => expect(patches).toEqual([{ addCandidate: "data:image/png;base64,NEW" }]));
    expect(await screen.findByRole("img", { name: "Ana candidate 1" })).toBeTruthy();
  });

  it("makes a candidate main or deletes it", async () => {
    setup({ photo: "", sheet: SHEET, candidates: [CAND] });
    fireEvent.click(await screen.findByRole("img", { name: "Ana candidate 1" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Make main" }));
    await waitFor(() => expect(patches).toEqual([{ promoteCandidate: "candidate-abc.png" }]));
    fireEvent.click(screen.getByRole("button", { name: "Delete candidate" }));
    await waitFor(() => expect(patches).toHaveLength(2));
    expect(patches[1]).toEqual({ deleteCandidate: "candidate-abc.png" });
  });
});

