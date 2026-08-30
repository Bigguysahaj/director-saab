"use client";

import { useRef } from "react";

export function PromptStage({
  prompt,
  onPromptChange,
  disabled,
  referencePreview,
  onReferenceChange,
  showReference,
}: {
  prompt: string;
  onPromptChange: (v: string) => void;
  disabled?: boolean;
  referencePreview: string | null;
  onReferenceChange: (dataUrl: string | null) => void;
  showReference: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | null) {
    if (!file) return onReferenceChange(null);
    const reader = new FileReader();
    reader.onload = () => onReferenceChange(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.2em] text-fg-faint uppercase">
          Shot description
        </span>
        <span className="text-[10px] text-fg-faint">{prompt.length}/2000</span>
      </div>
      <textarea
        value={prompt}
        maxLength={2000}
        disabled={disabled}
        onChange={(e) => onPromptChange(e.target.value)}
        placeholder="A lone figure walks across a rain-slicked street at dusk, neon signs reflecting in the puddles, slow dolly-in, 35mm film grain..."
        rows={4}
        className="w-full resize-none rounded-sm border border-border bg-bg-panel px-4 py-3 font-display text-lg italic leading-snug text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none disabled:opacity-50"
      />

      {showReference && (
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          {referencePreview ? (
            <div className="flex items-center gap-2 rounded-sm border border-border bg-bg-panel px-2 py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={referencePreview}
                alt="Reference frame"
                className="h-8 w-8 rounded-sm object-cover"
              />
              <span className="text-[10px] text-fg-dim">First frame</span>
              <button
                type="button"
                onClick={() => {
                  onReferenceChange(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="text-fg-faint hover:text-accent cursor-pointer"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
              className="rounded-sm border border-dashed border-border px-3 py-1.5 text-[11px] text-fg-dim hover:border-border-strong hover:text-fg cursor-pointer disabled:opacity-50"
            >
              + Reference frame (optional)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
