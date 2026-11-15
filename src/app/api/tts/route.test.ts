// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const SENTINEL = "sk-sentinel-key";
const lib = vi.hoisted(() => ({
  isElevenLabsConfigured: vi.fn(() => true),
  textToSpeech: vi.fn(),
  listVoices: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/elevenlabs", () => ({ ...lib, MAX_TTS_CHARS: 500 }));
import { POST } from "./route";

function post(body: unknown) {
  return POST(new Request("http://localhost/api/tts", { method: "POST", body: JSON.stringify(body) }));
}

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = SENTINEL;
  lib.isElevenLabsConfigured.mockReturnValue(true);
  lib.textToSpeech.mockResolvedValue(new Uint8Array([9, 8, 7]).buffer);
});

describe("POST /api/tts", () => {
  it("returns audio/mpeg for valid input", async () => {
    const res = await post({ text: "Hello", voiceId: "v1" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([9, 8, 7]);
    expect(lib.textToSpeech).toHaveBeenCalledWith("Hello", "v1");
  });

  it.each([
    ["empty text", { text: "  ", voiceId: "v1" }],
    ["missing text", { voiceId: "v1" }],
    ["missing voiceId", { text: "Hello" }],
    ["non-string text", { text: 5, voiceId: "v1" }],
    ["non-string voiceId", { text: "Hello", voiceId: ["v1"] }],
    ["text over the cap", { text: "a".repeat(501), voiceId: "v1" }],
  ])("rejects %s with 400", async (_, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(lib.textToSpeech).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON body with 400", async () => {
    const res = await POST(new Request("http://localhost/api/tts", { method: "POST", body: "nope" }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when the key is not set", async () => {
    lib.isElevenLabsConfigured.mockReturnValue(false);
    const res = await post({ text: "Hello", voiceId: "v1" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("ELEVENLABS_API_KEY");
    expect(lib.textToSpeech).not.toHaveBeenCalled();
  });

  it("returns a provider error as 502", async () => {
    lib.textToSpeech.mockRejectedValue(new Error("ElevenLabs failed (422): bad voice"));
    const res = await post({ text: "Hello", voiceId: "v1" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("bad voice");
  });

  it("never leaks the key", async () => {
    const responses = [await post({ text: "Hello", voiceId: "v1" }), await post({ voiceId: "v1" })];
    lib.textToSpeech.mockRejectedValueOnce(new Error("boom"));
    responses.push(await post({ text: "Hello", voiceId: "v1" }));
    lib.isElevenLabsConfigured.mockReturnValue(false);
    responses.push(await post({ text: "Hello", voiceId: "v1" }));
    expect(responses.map((r) => r.status)).toEqual([200, 400, 502, 503]);
    for (const res of responses) expect(Buffer.from(await res.arrayBuffer()).toString("latin1")).not.toContain(SENTINEL);
  });
});
