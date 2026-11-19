// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/openrouter", () => ({
  isConfigured: () => Boolean(process.env.OPENROUTER_API_KEY),
  fetchImageModelsRaw: vi.fn(),
}));
import { fetchImageModelsRaw } from "@/lib/openrouter";
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

  it("keeps live image models that accept at least two references", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test");
    vi.stubEnv("ARK_API_KEY", "");
    vi.mocked(fetchImageModelsRaw).mockResolvedValue({
      data: [
        { id: "text/only", name: "Text: Only", architecture: { input_modalities: ["text"] }, supported_parameters: { input_references: { max: 8 } } },
        { id: "image/one-ref", name: "Image: One", architecture: { input_modalities: ["image"] }, supported_parameters: { input_references: { max: 1 } } },
        { id: "image/no-max", name: "Image: Bare", architecture: { input_modalities: ["text", "image"] } },
        { id: "", name: "Image: Blank", architecture: { input_modalities: ["image"] }, supported_parameters: { input_references: { max: 4 } } },
        { id: "google/gemini-3.1-flash-lite-image", name: "Google: Nano Banana", description: "Fast composites.", architecture: { input_modalities: ["text", "image"] }, supported_parameters: { input_references: { max: 14 } } },
      ],
    });

    const body = await (await GET()).json();

    expect(body.live).toBe(true);
    expect(body.models).toEqual([
      { id: "google/gemini-3.1-flash-lite-image", label: "Nano Banana", provider: "Google", tagline: "Fast composites.", maxInputReferences: 14 },
    ]);
  });

  it("falls back when the live catalog cannot be used", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test");
    vi.stubEnv("ARK_API_KEY", "");
    vi.mocked(fetchImageModelsRaw).mockResolvedValue({ data: { unexpected: true } });
    const malformed = await (await GET()).json();
    expect(malformed.live).toBe(false);
    expect(malformed.models.some((m: { id: string }) => m.id === "google/gemini-3.1-flash-lite-image")).toBe(true);

    vi.mocked(fetchImageModelsRaw).mockRejectedValue(new Error("OpenRouter list image models failed (503): down"));
    const failed = await (await GET()).json();
    expect(failed.live).toBe(false);
    expect(failed.warning).toMatch(/503/);
    expect(failed.models.some((m: { id: string }) => m.id === "google/gemini-3.1-flash-lite-image")).toBe(true);
  });
});
