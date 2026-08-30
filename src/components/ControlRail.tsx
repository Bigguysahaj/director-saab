"use client";

import type { VideoModel } from "@/lib/types";
import { ModelPicker } from "./ModelPicker";
import { SegmentedControl } from "./SegmentedControl";
import { AspectRatioSwatches } from "./AspectRatioSwatches";

export function ControlRail({
  models,
  model,
  onModel,
  duration,
  onDuration,
  resolution,
  onResolution,
  aspectRatio,
  onAspectRatio,
  generateAudio,
  onGenerateAudio,
  seed,
  onSeed,
  disabled,
}: {
  models: VideoModel[];
  model: VideoModel | undefined;
  onModel: (m: VideoModel) => void;
  duration: number | undefined;
  onDuration: (v: number) => void;
  resolution: string | undefined;
  onResolution: (v: string) => void;
  aspectRatio: string | undefined;
  onAspectRatio: (v: string) => void;
  generateAudio: boolean;
  onGenerateAudio: (v: boolean) => void;
  seed: number | null;
  onSeed: (v: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <ModelPicker models={models} value={model} onChange={onModel} disabled={disabled} />

      {model && model.supported_durations.length > 0 && (
        <SegmentedControl
          label="Duration"
          options={model.supported_durations}
          value={duration}
          onChange={onDuration}
          format={(v) => `${v}s`}
          disabled={disabled}
        />
      )}

      {model && model.supported_aspect_ratios.length > 0 && (
        <AspectRatioSwatches
          options={model.supported_aspect_ratios}
          value={aspectRatio}
          onChange={onAspectRatio}
          disabled={disabled}
        />
      )}

      {model && model.supported_resolutions.length > 0 && (
        <SegmentedControl
          label="Stock quality"
          options={model.supported_resolutions}
          value={resolution}
          onChange={onResolution}
          disabled={disabled}
        />
      )}

      {model?.supports_audio && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] tracking-[0.2em] text-fg-faint uppercase">
            Sound
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onGenerateAudio(!generateAudio)}
            className={`rounded-sm border border-border bg-bg-panel px-3 py-2 text-xs cursor-pointer transition-colors disabled:opacity-40 ${
              generateAudio ? "text-accent border-accent-dim" : "text-fg-dim"
            }`}
          >
            {generateAudio ? "Audio on" : "Silent"}
          </button>
        </div>
      )}

      {model?.supports_seed && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] tracking-[0.2em] text-fg-faint uppercase">
            Seed
          </span>
          <div className="flex items-center gap-1 rounded-sm border border-border bg-bg-panel px-1">
            <input
              type="number"
              disabled={disabled}
              value={seed ?? ""}
              onChange={(e) =>
                onSeed(e.target.value === "" ? null : Number(e.target.value))
              }
              placeholder="random"
              className="w-20 bg-transparent px-2 py-2 text-xs text-fg placeholder:text-fg-faint focus:outline-none"
            />
            <button
              type="button"
              disabled={disabled}
              title="Randomize"
              onClick={() => onSeed(Math.floor(Math.random() * 1_000_000))}
              className="px-2 py-2 text-fg-faint hover:text-fg cursor-pointer disabled:opacity-40"
            >
              🎲
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
