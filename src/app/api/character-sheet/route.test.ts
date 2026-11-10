// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter", () => ({ isConfigured: () => true, generateImage: vi.fn() }));
vi.mock("@/lib/modelark", () => ({ isArkConfigured: () => Boolean(process.env.ARK_API_KEY), generateImage: vi.fn() }));

import { generateImage as generateArkImage } from "@/lib/modelark";
import { generateImage as generateOpenRouterImage } from "@/lib/openrouter";
import { CHARACTER_SHEET_MODEL } from "@/lib/characterSheet";
import { POST } from "./route";

const post = (model?: string) => POST(new Request("http://localhost/api/character-sheet", {
  method: "POST",
  body: JSON.stringify({ photo: "data:image/png;base64,PHOTO", model }),
}));

beforeEach(() => {
  vi.stubEnv("ARK_API_KEY", "test");
  const result = { data: [{ b64_json: "RESULT", media_type: "image/jpeg" }], usage: { cost: 0.04 } };
  vi.mocked(generateArkImage).mockResolvedValue(result);
  vi.mocked(generateOpenRouterImage).mockResolvedValue(result);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/character-sheet", () => {
  it("retains the OpenRouter default", async () => {
    expect((await post()).status).toBe(200);
    expect(generateOpenRouterImage).toHaveBeenCalledWith(expect.objectContaining({ model: CHARACTER_SHEET_MODEL }));
    expect(generateArkImage).not.toHaveBeenCalled();
  });

  it("uses ModelArk for an optional Ark model", async () => {
    expect((await post("modelark/seedream-4-5-251128")).status).toBe(200);
    expect(generateArkImage).toHaveBeenCalledWith(expect.objectContaining({ model: "modelark/seedream-4-5-251128" }));
    expect(generateOpenRouterImage).not.toHaveBeenCalled();
  });
});
