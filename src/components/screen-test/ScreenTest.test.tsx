import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenTest } from "./ScreenTest";

const GEMINI = "google/gemini-3.1-flash-lite-image";
const member = (m: object) => ({ photo: "", shots: {}, stageColor: null, sheet: "", closeup: "", candidates: [], ...m });
let posts: Record<string, unknown>[];
let fetched: string[];

function setup() {
  posts = [];
  fetched = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const json = (b: unknown) => new Response(JSON.stringify(b));
    if (url === "/api/cast") return json([
      member({ id: "a", name: "Ana", sheet: "/ana-sheet.png", closeup: "/ana-closeup.png" }),
      member({ id: "b", name: "Ben", photo: "/ben.png" }),
      member({ id: "c", name: "Cy", sheet: "/cy-sheet.png", stageColor: "#c65d3b" }),
    ]);
    if (url === "/api/screen-test" && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      return json({ id: "new", image: "/api/screen-test/file/new.png", prompt: body.prompt ?? "", model: body.model, cost: 0.034, createdAt: 3, inputs: { kind: "edit", cast: [], image: true } });
    }
    if (url === "/api/screen-test") return json([
      { id: "2", image: "/api/screen-test/file/2.png", prompt: "second prompt", model: "m/two", cost: 0.018, createdAt: 2, inputs: { kind: "edit", cast: [], image: true } },
      { id: "1", image: "/api/screen-test/file/1.png", prompt: "first prompt", model: "m/one", cost: 0.034, createdAt: 1, inputs: { kind: "cast", cast: ["Ana"], image: false } },
    ]);
    if (url === "/api/image-models") return json({
      models: [
        { id: GEMINI, label: "Gemini", provider: "Google", tagline: "", maxInputReferences: 14 },
        { id: "tiny/model", label: "Tiny", provider: "Tiny", tagline: "", maxInputReferences: 2 },
      ],
      default: GEMINI,
    });
    fetched.push(url);
    // jsdom's FileReader only reads jsdom Blobs, not the ones Response.blob() makes.
    return { ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) } as Response;
  });
  render(<ScreenTest />);
}

afterEach(cleanup);

const generate = () => screen.getByRole("button", { name: "Generate screen test" }) as HTMLButtonElement;
const isDataUrl = (v: unknown) => typeof v === "string" && v.startsWith("data:image/png;base64,");
async function ready() {
  await screen.findByRole("option", { name: /Tiny/ });
  await screen.findByRole("button", { name: "Ana" });
}
function drop() {
  fireEvent.drop(screen.getByRole("button", { name: "Drop an image" }), {
    dataTransfer: { files: [new File(["x"], "look.png", { type: "image/png" })] },
  });
}

describe("ScreenTest", () => {
  it("shows history newest first", async () => {
    setup();
    const imgs = await screen.findAllByRole("img", { name: /^Screen test:/ });
    expect(imgs.map((i) => i.getAttribute("alt"))).toEqual(["Screen test: second prompt", "Screen test: first prompt"]);
    expect(screen.getByText("m/two")).toBeTruthy();
    expect(screen.getByText("$0.018")).toBeTruthy();
    fireEvent.click(imgs[0]);
    expect(within(screen.getByRole("dialog")).getByRole("link", { name: "Download" }).getAttribute("href")).toBe("/api/screen-test/file/2.png");
  });

  it("drops an image, takes a prompt and makes one screen test", async () => {
    setup();
    await ready();
    drop();
    await screen.findByRole("img", { name: "Dropped image" });
    expect(screen.getByText("est. $0.034")).toBeTruthy();
    expect(generate().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "make it night" } });
    expect(generate().disabled).toBe(false);
    fireEvent.click(generate());
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(isDataUrl(posts[0].image)).toBe(true);
    expect(posts[0]).toMatchObject({ prompt: "make it night", model: GEMINI });
    expect(posts[0].cast).toBeUndefined();
    expect(posts[0].stagePhoto).toBeUndefined();
    const first = (await screen.findAllByRole("img", { name: /^Screen test:/ }))[0];
    expect(first.getAttribute("src")).toBe("/api/screen-test/file/new.png");
  });

  it("casts any roster members together without /stage", async () => {
    setup();
    await ready();
    expect(screen.getByRole("button", { name: "Cy" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ana" }));
    fireEvent.click(screen.getByRole("button", { name: "Ben" }));
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "Ana hands Ben a letter" } });
    fireEvent.click(generate());
    await waitFor(() => expect(posts).toHaveLength(1));
    const cast = posts[0].cast as { name: string; images: string[] }[];
    expect(cast.map((c) => c.name)).toEqual(["Ana", "Ben"]);
    expect(cast.map((c) => c.images.length)).toEqual([2, 1]);
    expect(cast.flatMap((c) => c.images).every(isDataUrl)).toBe(true);
    expect(posts[0].image).toBeUndefined();
    expect(fetched).toEqual(expect.arrayContaining(["/ana-sheet.png", "/ana-closeup.png", "/ben.png"]));
  });

  it("blocks a run over the model's reference cap", async () => {
    setup();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Ana" }));
    fireEvent.click(screen.getByRole("button", { name: "Ben" }));
    fireEvent.change(screen.getByLabelText("Prompt"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("DoP — Director of Photography"), { target: { value: "tiny/model" } });
    expect(generate().disabled).toBe(true);
    expect(screen.getByText(/3 images.*takes 2/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("DoP — Director of Photography"), { target: { value: GEMINI } });
    expect(generate().disabled).toBe(false);
    expect(posts).toEqual([]);
  });

  it("keeps the /stage photo flow", async () => {
    setup();
    await ready();
    drop();
    await screen.findByRole("img", { name: "Dropped image" });
    fireEvent.click(screen.getByLabelText("This is a /stage photo"));
    const cy = screen.getByRole("button", { name: "Cy" }) as HTMLButtonElement;
    expect(cy.getAttribute("aria-pressed")).toBe("true");
    expect(cy.disabled).toBe(true);
    fireEvent.click(generate());
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(isDataUrl(posts[0].stagePhoto)).toBe(true);
    expect(posts[0].image).toBeUndefined();
    const cast = posts[0].cast as { name: string; colorLabel: string; images: string[] }[];
    expect(cast).toHaveLength(1);
    expect(cast[0]).toMatchObject({ name: "Cy", colorLabel: "burnt orange" });
    expect(cast[0].images).toHaveLength(1);
  });
});
