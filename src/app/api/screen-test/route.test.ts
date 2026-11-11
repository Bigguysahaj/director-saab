// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter", () => ({ isConfigured: () => Boolean(process.env.OPENROUTER_API_KEY), generateImage: vi.fn() }));
vi.mock("@/lib/modelark", () => ({ isArkConfigured: () => Boolean(process.env.ARK_API_KEY), generateImage: vi.fn() }));
vi.mock("@/lib/screenTestStore", () => ({
  listScreenTests: vi.fn(async () => []),
  saveScreenTest: vi.fn(async (_image: string, cost: number | null, meta: object) => ({ cost, ...meta })),
  toClientScreenTest: vi.fn((record) => record),
}));

import { generateImage as generateArkImage } from "@/lib/modelark";
import { generateImage as generateOpenRouterImage } from "@/lib/openrouter";
import { saveScreenTest } from "@/lib/screenTestStore";
import { buildScreenTestPrompt } from "@/lib/screenTest";
import { POST } from "./route";

const GEMINI = "google/gemini-3.1-flash-lite-image";
const url = (s: string) => `data:image/png;base64,${s}`;
const [IMG, S, P, A1, A2, B1] = ["IMG", "S", "P", "A1", "A2", "B1"].map(url);
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/screen-test", { method: "POST", body: JSON.stringify(body) }));
const refs = () => vi.mocked(generateOpenRouterImage).mock.calls[0][0].input_references?.map((r) => (r as { image_url: { url: string } }).image_url.url);
const promptSent = () => vi.mocked(generateOpenRouterImage).mock.calls[0][0].prompt;

beforeEach(() => {
  vi.stubEnv("ARK_API_KEY", "test");
  vi.stubEnv("OPENROUTER_API_KEY", "test");
  vi.mocked(generateArkImage).mockResolvedValue({ data: [{ b64_json: "RESULT", media_type: "image/jpeg" }], usage: { cost: 0.04 } });
  vi.mocked(generateOpenRouterImage).mockResolvedValue({ data: [{ b64_json: "R", media_type: "image/png" }], usage: { cost: 0.03 } });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const arkBody = {
  stagePhoto: url("STAGE"),
  cast: [
    { name: "Actor A", colorLabel: "burnt orange", images: [url("A")] },
    { name: "Actor B", colorLabel: "forest green", images: [url("B")] },
  ],
  model: "modelark/seedream-4-5-251128",
};

describe("POST /api/screen-test", () => {
  it("dispatches Ark models and records their cost", async () => {
    const res = await post(arkBody);
    expect(res.status).toBe(200);
    expect(generateArkImage).toHaveBeenCalledOnce();
    expect(vi.mocked(generateArkImage).mock.calls[0][0].input_references).toHaveLength(3);
    expect(generateOpenRouterImage).not.toHaveBeenCalled();
    expect(saveScreenTest).toHaveBeenCalledWith("data:image/jpeg;base64,RESULT", 0.04, expect.anything());
  });

  it("returns 501 with a missing Ark key", async () => {
    vi.stubEnv("ARK_API_KEY", "");
    const res = await post(arkBody);
    expect(res.status).toBe(501);
    expect((await res.json()).error).toContain("ARK_API_KEY");
  });

  it("edits a dropped image: it is the only reference, and the result is saved with its inputs", async () => {
    const res = await post({ image: IMG, prompt: "make it night", model: GEMINI });
    expect(res.status).toBe(200);
    expect(generateOpenRouterImage).toHaveBeenCalledOnce();
    expect(refs()).toEqual([IMG]);
    expect(promptSent()).toContain("make it night");
    expect(promptSent()).not.toMatch(/mannequin/i);
    expect(saveScreenTest).toHaveBeenCalledWith("data:image/png;base64,R", 0.03, {
      prompt: "make it night", model: GEMINI, inputs: { kind: "edit", cast: [], image: true },
    });
  });

  it("casts members into a scene with no image, naming who is in which reference", async () => {
    await post({ prompt: "Ana hands Ben a letter", cast: [{ name: "Ana", images: [A1, A2] }, { name: "Ben", images: [B1] }] });
    expect(refs()).toEqual([A1, A2, B1]);
    expect(promptSent()).toContain("Ana is shown in reference images 1–2");
    expect(promptSent()).toContain("Ben is shown in reference image 3");
    expect(promptSent()).toContain("Ana hands Ben a letter");
    expect(vi.mocked(saveScreenTest).mock.calls[0][2]).toMatchObject({ inputs: { kind: "cast", cast: ["Ana", "Ben"], image: false } });
  });

  it("puts the scene image first when cast and an image are both given", async () => {
    await post({ image: S, prompt: "Ana hands Ben a letter", cast: [{ name: "Ana", images: [A1, A2] }, { name: "Ben", images: [B1] }] });
    expect(refs()).toEqual([S, A1, A2, B1]);
    expect(promptSent()).toContain("Reference image 1 is the scene");
    expect(promptSent()).toContain("Ana is shown in reference images 2–3");
    expect(promptSent()).toContain("Ben is shown in reference image 4");
    expect(vi.mocked(saveScreenTest).mock.calls[0][2]).toMatchObject({ inputs: { image: true } });
  });

  it("keeps the stage flow, appending the owner's prompt when given", async () => {
    const cast = [{ name: "Ana", colorLabel: "burnt orange", images: [A1, A2] }];
    const base = buildScreenTestPrompt([{ name: "Ana", colorLabel: "burnt orange", imageCount: 2 }]);
    expect((await post({ stagePhoto: P, cast, prompt: "make it dusk" })).status).toBe(200);
    expect(refs()).toEqual([P, A1, A2]);
    expect(promptSent().startsWith(base)).toBe(true);
    expect(promptSent().endsWith("make it dusk")).toBe(true);
    expect(vi.mocked(saveScreenTest).mock.calls[0][2]).toMatchObject({ inputs: { kind: "stage", cast: ["Ana"], image: true } });
    vi.mocked(generateOpenRouterImage).mockClear();
    expect((await post({ stagePhoto: P, cast })).status).toBe(200);
    expect(promptSent()).toBe(base);
  });

  it("rejects bad input", async () => {
    for (const body of [
      { image: IMG, stagePhoto: P, prompt: "x" },
      { prompt: "x" },
      { image: IMG },
      { cast: [{ name: "Ana", images: [A1] }], prompt: "" },
      { cast: [{ name: "Ana", images: [] }], prompt: "x" },
      { stagePhoto: P, cast: [{ name: "Ana", images: [A1] }] },
    ]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(generateOpenRouterImage).not.toHaveBeenCalled();
  });

  it("falls back to the model's known price, then to null", async () => {
    vi.mocked(generateOpenRouterImage).mockResolvedValue({ data: [{ b64_json: "R", media_type: "image/png" }] });
    await post({ image: IMG, prompt: "make it night", model: GEMINI });
    await post({ image: IMG, prompt: "make it night", model: "some/unpriced-model" });
    expect(vi.mocked(saveScreenTest).mock.calls.map((c) => c[1])).toEqual([0.034, null]);
  });

  it("returns a provider error as 502 and saves nothing", async () => {
    vi.mocked(generateOpenRouterImage).mockRejectedValue(new Error("model not found"));
    const res = await post({ image: IMG, prompt: "x" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("model not found");
    expect(saveScreenTest).not.toHaveBeenCalled();
  });
});
