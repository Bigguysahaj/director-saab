import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceLineGenerator } from "./VoiceLineGenerator";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup() {
  const onFile = vi.fn(async () => {});
  const onError = vi.fn();
  render(<VoiceLineGenerator onFile={onFile} onError={onError} />);
  return { onFile, onError };
}

async function openVoices(voices: { id: string; name: string }[]) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json(voices));
  fireEvent.click(screen.getByRole("button", { name: "Generate voice line" }));
  await screen.findByLabelText("Voice line text");
}

describe("VoiceLineGenerator", () => {
  it("sends the typed line and saves the MP3, and does not send a blank line", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json([{ id: "v1", name: "Rachel" }]));
    const { onFile, onError } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Generate voice line" }));
    await screen.findByLabelText("Voice");

    expect((screen.getByRole("button", { name: "Generate" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Voice line text"), { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Generate" }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } }));
    fireEvent.change(screen.getByLabelText("Voice line text"), { target: { value: "Hello there" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(onFile).toHaveBeenCalledTimes(1));
    const file = onFile.mock.calls[0][0];
    expect(file).toBeInstanceOf(File);
    expect(file).toMatchObject({ name: "voice-line.mp3", type: "audio/mpeg" });
    expect(onError).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/tts");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({ text: "Hello there", voiceId: "v1" });
  });

  it("does not save a file when speech fails, including a non-JSON failure", async () => {
    const { onFile, onError } = setup();
    await openVoices([{ id: "v1", name: "Rachel" }]);
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(Response.json({ error: "ElevenLabs text-to-speech failed (429): quota exceeded" }, { status: 429 }));
    fireEvent.change(screen.getByLabelText("Voice line text"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("ElevenLabs text-to-speech failed (429): quota exceeded"));
    expect(onFile).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502 }));
    fireEvent.click(await screen.findByRole("button", { name: "Generate" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Couldn't generate the voice line."));
    expect(onFile).not.toHaveBeenCalled();
  });

  it("reports a voice-list failure without calling speech", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ error: "ELEVENLABS_API_KEY is not set in .env.local" }, { status: 503 }),
    );
    const { onFile, onError } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Generate voice line" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("ELEVENLABS_API_KEY is not set in .env.local"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onFile).not.toHaveBeenCalled();
  });

  it("does not generate when the voice book is empty", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { onFile, onError } = setup();
    await openVoices([]);
    fireEvent.change(screen.getByLabelText("Voice line text"), { target: { value: "Hello" } });
    expect((screen.getByRole("button", { name: "Generate" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onError).not.toHaveBeenCalled();
    expect(onFile).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
