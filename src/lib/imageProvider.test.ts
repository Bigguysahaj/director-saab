// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { generateImage as generateArkImage } from "./modelark";
import { generateImage as generateOpenRouterImage } from "./openrouter";
import { imageProvider } from "./imageProvider";

afterEach(() => vi.unstubAllEnvs());

describe("imageProvider", () => {
  it("answers 501 for a modelark id without ARK_API_KEY", async () => {
    vi.stubEnv("ARK_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "test");
    const res = imageProvider("modelark/seedream-4-5-251128");
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(501);
    expect(await (res as Response).json()).toEqual({ error: "ARK_API_KEY is not configured on the server." });
  });

  it("answers 501 for any other id without OPENROUTER_API_KEY", async () => {
    vi.stubEnv("ARK_API_KEY", "test");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const res = imageProvider("google/gemini-3.1-flash-lite-image");
    expect((res as Response).status).toBe(501);
    expect(await (res as Response).json()).toEqual({ error: "OPENROUTER_API_KEY is not configured on the server." });
  });

  it("picks the matching generate function", () => {
    vi.stubEnv("ARK_API_KEY", "test");
    vi.stubEnv("OPENROUTER_API_KEY", "test");
    expect(imageProvider("modelark/seedream-4-5-251128")).toBe(generateArkImage);
    expect(imageProvider("google/gemini-3.1-flash-lite-image")).toBe(generateOpenRouterImage);
  });
});
