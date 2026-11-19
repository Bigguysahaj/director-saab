// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter", () => ({
  isConfigured: () => Boolean(process.env.OPENROUTER_API_KEY),
  fetchVideoModelsRaw: vi.fn(),
}));

import { fetchVideoModelsRaw } from "@/lib/openrouter";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/models", () => {
  it("serves the built-in list when OpenRouter is not configured", async () => {
    const body = await (await GET()).json();
    expect(body.live).toBe(false);
    expect(body.models.some((m: { id: string }) => m.id === "bytedance/seedance-2.0-mini")).toBe(true);
    expect(fetchVideoModelsRaw).not.toHaveBeenCalled();
  });

  it("normalizes a live catalog and drops entries with no id", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test");
    vi.mocked(fetchVideoModelsRaw).mockResolvedValue({
      data: [
        { id: "", name: "blank" },
        {
          id: "bytedance/seedance-2.0-mini",
          pricing_skus: { video_tokens: "0.0000035", video_tokens_with_video_input: "0.0000021" },
        },
      ],
    });

    const body = await (await GET()).json();

    expect(body.live).toBe(true);
    expect(body.models).toHaveLength(1);
    expect(body.models[0]).toMatchObject({
      id: "bytedance/seedance-2.0-mini",
      token_rate: 0.0000035,
      video_input_token_rate: 0.0000021,
    });
  });

  it("falls back when the catalog request fails", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test");
    vi.mocked(fetchVideoModelsRaw).mockRejectedValue(new Error("OpenRouter list models failed (503): down"));

    const body = await (await GET()).json();

    expect(body.live).toBe(false);
    expect(body.warning).toMatch(/503/);
    expect(body.models.some((m: { id: string }) => m.id === "bytedance/seedance-2.0-mini")).toBe(true);
  });
});
