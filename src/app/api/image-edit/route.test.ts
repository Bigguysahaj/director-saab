// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter", () => ({ isConfigured: () => true, generateImage: vi.fn() }));
const ark = vi.hoisted(() => ({ configured: true }));
vi.mock("@/lib/modelark", () => ({ isArkConfigured: () => ark.configured, generateImage: vi.fn() }));

import { generateImage } from "@/lib/openrouter";
import { generateImage as generateArkImage } from "@/lib/modelark";
import { DEFAULT_IMAGE_MODEL_ID } from "@/lib/imageModels";
import { POST } from "./route";

const image = "data:image/png;base64,x";
const FLASH = "bytedance-seed/seedream-5-0-flash";
const post = (b: unknown) =>
  POST(new Request("http://x/api/image-edit", { method: "POST", body: JSON.stringify(b) }));
const result = { data: [{ b64_json: "AAA", media_type: "image/png" }] };

describe("POST /api/image-edit", () => {
  it("sends the image as the only reference and returns the cost", async () => {
    vi.mocked(generateImage).mockResolvedValue({ ...result, usage: { cost: 0.018 } });
    const res = await post({ image, prompt: "make the jacket red", model: FLASH });
    expect(generateImage).toHaveBeenCalledTimes(1);
    const req = vi.mocked(generateImage).mock.calls[0][0];
    expect(req.model).toBe(FLASH);
    expect(req.prompt).toContain("make the jacket red");
    expect(req.input_references).toEqual([{ type: "image_url", image_url: { url: image } }]);
    expect(await res.json()).toEqual({ image: "data:image/png;base64,AAA", cost: 0.018, model: FLASH });
  });

  it("uses the default model and its fallback price", async () => {
    vi.mocked(generateImage).mockResolvedValue(result);
    const res = await post({ image, prompt: "x" });
    expect(vi.mocked(generateImage).mock.calls[0][0].model).toBe(DEFAULT_IMAGE_MODEL_ID);
    expect(await res.json()).toMatchObject({ cost: 0.034, model: DEFAULT_IMAGE_MODEL_ID });
  });

  it("rejects bad input", async () => {
    for (const b of [{ prompt: "x" }, { image, prompt: "" }, { image, prompt: "x", model: "" }, { image, prompt: "x", model: 42 }]) {
      expect((await post(b)).status).toBe(400);
    }
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("returns a provider error as 502", async () => {
    vi.mocked(generateImage).mockRejectedValue(new Error("model not found"));
    const res = await post({ image, prompt: "x", model: "nope/nope" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("model not found");
  });

  it("sends a modelark/ model to ModelArk, not OpenRouter", async () => {
    ark.configured = true;
    vi.mocked(generateArkImage).mockResolvedValue({ ...result, usage: { cost: 0.018 } });
    const res = await post({ image, prompt: "x", model: "modelark/dola-seedream-5-0-flash-260915" });
    expect(generateArkImage).toHaveBeenCalledWith(expect.objectContaining({
      model: "modelark/dola-seedream-5-0-flash-260915",
      input_references: [{ type: "image_url", image_url: { url: image } }],
    }));
    expect(generateImage).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ cost: 0.018 });
  });

  it("returns 501 for a ModelArk model without ARK_API_KEY", async () => {
    ark.configured = false;
    const res = await post({ image, prompt: "x", model: "modelark/seedream-4-5-251128" });
    expect(res.status).toBe(501);
    expect((await res.json()).error).toContain("ARK_API_KEY");
    expect(generateArkImage).not.toHaveBeenCalled();
    ark.configured = true;
  });
});

