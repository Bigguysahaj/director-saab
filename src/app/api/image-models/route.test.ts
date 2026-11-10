// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter", () => ({
  isConfigured: () => false,
  fetchImageModelsRaw: vi.fn(),
}));
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/image-models", () => {
  it("lists Ark models beside fallbacks only when configured", async () => {
    vi.stubEnv("ARK_API_KEY", "test");
    const configured = await GET();
    const withArk = (await configured.json()).models;
    expect(withArk.some((m: { id: string }) => m.id === "modelark/seedream-4-5-251128")).toBe(true);
    expect(withArk.some((m: { id: string }) => m.id === "google/gemini-3.1-flash-lite-image")).toBe(true);

    vi.stubEnv("ARK_API_KEY", "");
    const unconfigured = await GET();
    expect((await unconfigured.json()).models.some((m: { id: string }) => m.id.startsWith("modelark/"))).toBe(false);
  });
});
