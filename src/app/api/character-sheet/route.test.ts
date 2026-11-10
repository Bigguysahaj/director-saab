// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter", () => ({ isConfigured: () => true, generateImage: vi.fn() }));
vi.mock("@/lib/modelark", () => ({ isArkConfigured: () => Boolean(process.env.ARK_API_KEY), generateImage: vi.fn() }));

import { generateImage as generateArkImage } from "@/lib/modelark";
import { generateImage as generateOpenRouterImage } from "@/lib/openrouter";
import { CHARACTER_SHEET_MODEL } from "@/lib/characterSheet";
import { POST } from "./route";

const photo = "data:image/png;base64,x";
const post = (body: unknown) =>
  POST(new Request("http://x/api/character-sheet", { method: "POST", body: JSON.stringify(body) }));
const image = { data: [{ b64_json: "AAA", media_type: "image/png" }] };

beforeEach(() => {
  vi.stubEnv("ARK_API_KEY", "test");
  vi.mocked(generateOpenRouterImage).mockResolvedValue(image);
  vi.mocked(generateArkImage).mockResolvedValue({ ...image, usage: { cost: 0.04 } });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/character-sheet", () => {
  it("uses the OpenRouter default when no model is given", async () => {
    const res = await post({ photo });
    expect(res.status).toBe(200);
    expect(generateOpenRouterImage).toHaveBeenCalledWith(expect.objectContaining({
      model: CHARACTER_SHEET_MODEL,
      input_references: [{ type: "image_url", image_url: { url: photo } }],
    }));
    expect(generateArkImage).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ cost: 0.034, model: CHARACTER_SHEET_MODEL });
  });

  it("passes an OpenRouter model through and returns its real cost", async () => {
    vi.mocked(generateOpenRouterImage).mockResolvedValue({ ...image, usage: { cost: 0.018 } });
    const res = await post({ photo, model: "bytedance-seed/seedream-5-0-flash" });
    expect(generateOpenRouterImage).toHaveBeenCalledWith(expect.objectContaining({ model: "bytedance-seed/seedream-5-0-flash" }));
    expect(await res.json()).toMatchObject({ cost: 0.018, model: "bytedance-seed/seedream-5-0-flash" });
  });

  it("routes an Ark model to ModelArk and returns its cost and model", async () => {
    const model = "modelark/seedream-4-5-251128";
    const res = await post({ photo, model });
    expect(res.status).toBe(200);
    expect(generateArkImage).toHaveBeenCalledWith(expect.objectContaining({ model }));
    expect(generateOpenRouterImage).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ cost: 0.04, model });
  });

  it("rejects an empty or non-string model", async () => {
    expect((await post({ photo, model: "" })).status).toBe(400);
    expect((await post({ photo, model: 42 })).status).toBe(400);
    expect(generateOpenRouterImage).not.toHaveBeenCalled();
    expect(generateArkImage).not.toHaveBeenCalled();
  });

  it("surfaces the provider error for an unknown model", async () => {
    vi.mocked(generateOpenRouterImage).mockRejectedValue(new Error("model not found"));
    const res = await post({ photo, model: "nope/nope" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("model not found");
  });
});
