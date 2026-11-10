// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter", () => ({ isConfigured: () => true, generateImage: vi.fn() }));

import { generateImage } from "@/lib/openrouter";
import { CHARACTER_SHEET_MODEL } from "@/lib/characterSheet";
import { POST } from "./route";

const photo = "data:image/png;base64,x";
const post = (b: unknown) =>
  POST(new Request("http://x/api/character-sheet", { method: "POST", body: JSON.stringify(b) }));
const image = { data: [{ b64_json: "AAA", media_type: "image/png" }] };

describe("POST /api/character-sheet", () => {
  it("uses the default model when none is given", async () => {
    vi.mocked(generateImage).mockResolvedValue(image);
    const res = await post({ photo });
    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({
      model: CHARACTER_SHEET_MODEL,
      input_references: [{ type: "image_url", image_url: { url: photo } }],
    }));
    expect(await res.json()).toMatchObject({ cost: 0.034, model: CHARACTER_SHEET_MODEL });
  });

  it("passes a picked model through and returns its real cost", async () => {
    vi.mocked(generateImage).mockResolvedValue({ ...image, usage: { cost: 0.018 } });
    const res = await post({ photo, model: "bytedance-seed/seedream-5-0-flash" });
    expect(generateImage).toHaveBeenCalledWith(expect.objectContaining({ model: "bytedance-seed/seedream-5-0-flash" }));
    expect(await res.json()).toMatchObject({ cost: 0.018, model: "bytedance-seed/seedream-5-0-flash" });
  });

  it("rejects an empty or non-string model", async () => {
    expect((await post({ photo, model: "" })).status).toBe(400);
    expect((await post({ photo, model: 42 })).status).toBe(400);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("surfaces the provider error for an unknown model", async () => {
    vi.mocked(generateImage).mockRejectedValue(new Error("model not found"));
    const res = await post({ photo, model: "nope/nope" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("model not found");
  });
});
