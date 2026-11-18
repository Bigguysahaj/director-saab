// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { isElevenLabsConfigured, listVoices, textToSpeech, TTS_MODEL_ID } from "./elevenlabs";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("ELEVENLABS_API_KEY", "sk-test-key");
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("elevenlabs", () => {
  it("sends the TTS request shape and returns MP3 bytes", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } }));
    const bytes = await textToSpeech("Hello", "voice-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice-1");
    expect(init.method).toBe("POST");
    expect(init.headers["xi-api-key"]).toBe("sk-test-key");
    expect(init.headers.Accept).toBe("audio/mpeg");
    expect(JSON.parse(init.body)).toEqual({ text: "Hello", model_id: TTS_MODEL_ID });
    expect(Array.from(new Uint8Array(bytes))).toEqual([1, 2, 3]);
  });

  it("lists voices as { id, name }", async () => {
    fetchMock.mockResolvedValue(Response.json({ voices: [{ voice_id: "a", name: "Rachel", category: "premade" }, { voice_id: "b", name: "Adam" }] }));
    expect(await listVoices()).toEqual([{ id: "a", name: "Rachel" }, { id: "b", name: "Adam" }]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.elevenlabs.io/v1/voices");
  });

  it("throws a readable error on a provider failure", async () => {
    fetchMock.mockResolvedValue(Response.json({ detail: { status: "invalid_api_key", message: "Invalid API key" } }, { status: 401 }));
    const err = await textToSpeech("Hello", "voice-1").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("Invalid API key");
    expect((err as Error).message).not.toContain("sk-test-key");
  });

  it("reports not configured without a key", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    expect(isElevenLabsConfigured()).toBe(false);
    await expect(textToSpeech("Hello", "voice-1")).rejects.toThrow(/ELEVENLABS_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
