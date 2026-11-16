"use client";

import { useState } from "react";

const FIELD = "rounded-sm border border-border bg-bg-panel px-2 py-1 text-xs text-fg";

/**
 * Type a line, pick an ElevenLabs voice, get an MP3 back as a File, so the
 * caller can treat it exactly like an uploaded voice line.
 */
export function VoiceLineGenerator({
  disabled,
  previewUrl,
  onFile,
  onError,
}: {
  disabled?: boolean;
  // The caller's current voice line, when it came from this generator.
  previewUrl?: string | null;
  onFile: (file: File) => Promise<void>;
  onError: (message: string) => void;
}) {
  // null = closed; [] = open, voices still loading or none.
  const [voices, setVoices] = useState<{ id: string; name: string }[] | null>(null);
  const [voiceId, setVoiceId] = useState("");
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);

  async function open() {
    setVoices([]);
    try {
      const res = await fetch("/api/tts/voices");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't load ElevenLabs voices.");
      setVoices(body);
      setVoiceId(body[0]?.id ?? "");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't load ElevenLabs voices.");
    }
  }

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voiceId }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't generate the voice line.");
      await onFile(new File([await res.blob()], "voice-line.mp3", { type: "audio/mpeg" }));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't generate the voice line.");
    } finally {
      setGenerating(false);
    }
  }

  if (voices === null) {
    return (
      <button type="button" onClick={open} disabled={disabled} className="self-start text-[11px] text-fg-dim underline hover:text-fg">
        Generate voice line
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        aria-label="Voice line text"
        rows={2}
        maxLength={500}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        className="w-full resize-none rounded-sm border border-border bg-bg-panel px-2 py-1 text-xs text-fg"
      />
      <div className="flex items-center gap-2">
        <select aria-label="Voice" value={voiceId} disabled={disabled || !voices.length} className={FIELD} onChange={(e) => setVoiceId(e.target.value)}>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={generate}
          disabled={disabled || generating || !text.trim() || !voiceId}
          className="rounded-sm border border-border px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-fg-dim hover:border-accent hover:text-fg disabled:opacity-30"
        >
          {generating ? "Generating…" : "Generate"}
        </button>
      </div>
      {previewUrl && <audio src={previewUrl} controls aria-label="Generated voice line" className="h-8" />}
    </div>
  );
}
