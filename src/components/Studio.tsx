"use client";

import { useEffect, useState } from "react";
import { useVideoModels } from "@/lib/useVideoModels";
import { useGeneration, type GenerationState } from "@/lib/useGeneration";
import { loadTakes, saveTakes, upsertTake, removeTake } from "@/lib/history";
import type { GenerateRequest, Take } from "@/lib/types";
import { Slate } from "./Slate";
import { PromptStage } from "./PromptStage";
import { ControlRail } from "./ControlRail";
import { Viewer } from "./Viewer";
import { Dailies } from "./Dailies";

function pickDefault<T>(options: T[], preferred?: T): T | undefined {
  if (preferred !== undefined && options.includes(preferred)) return preferred;
  return options[Math.floor(options.length / 2)] ?? options[0];
}

export function Studio() {
  const { models, live, loading } = useVideoModels();
  const [takes, setTakes] = useState<Take[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [modelId, setModelId] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<number>();
  const [resolution, setResolution] = useState<string>();
  const [aspectRatio, setAspectRatio] = useState<string>();
  const [generateAudio, setGenerateAudio] = useState(true);
  const [seed, setSeed] = useState<number | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [syncedModelId, setSyncedModelId] = useState<string>();

  useEffect(() => {
    // localStorage is only readable client-side; reading it here (rather
    // than as a lazy useState initializer) keeps the first client render
    // matching the server-rendered (empty) markup and avoids a hydration
    // mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTakes(loadTakes());
  }, []);

  const model = models.find((m) => m.id === modelId) ?? models[0];

  // Reset dependent controls whenever the active model changes. Comparing
  // against a ref-like piece of state during render (rather than in an
  // effect) avoids an extra render pass — see the React docs' "adjusting
  // state when a prop changes" pattern.
  if (model && model.id !== syncedModelId) {
    setSyncedModelId(model.id);
    setDuration(pickDefault(model.supported_durations));
    setResolution(pickDefault(model.supported_resolutions));
    setAspectRatio(pickDefault(model.supported_aspect_ratios));
    if (!model.supports_frame_images) setReference(null);
  }

  function persist(next: Take[]) {
    setTakes(next);
    saveTakes(next);
  }

  const { state, submit } = useGeneration((settled: GenerationState) => {
    if (!settled.jobId) return;
    persist(
      upsertTake(loadTakes(), {
        id: settled.jobId,
        prompt,
        model: model?.id ?? "",
        modelLabel: model?.label ?? "",
        createdAt: Date.now(),
        duration,
        resolution,
        aspectRatio,
        status: settled.status === "idle" ? "pending" : settled.status,
        videoUrl: settled.videoUrl ?? undefined,
        cost: settled.cost ?? undefined,
        error: settled.error ?? undefined,
      })
    );
  });

  const rolling = state.status === "pending" || state.status === "in_progress";

  async function handleAction() {
    if (!model || !prompt.trim() || rolling) return;
    setPendingId(null);

    const body: GenerateRequest = {
      model: model.id,
      prompt: prompt.trim(),
      duration,
      resolution,
      aspect_ratio: aspectRatio,
      seed: seed ?? undefined,
      generate_audio: model.supports_audio ? generateAudio : undefined,
      frame_images:
        reference && model.supports_frame_images
          ? [{ type: "image_url", image_url: { url: reference }, frame_type: "first_frame" }]
          : undefined,
    };

    await submit(body);
  }

  function reopenTake(take: Take) {
    setPendingId(take.id);
    setPrompt(take.prompt);
  }

  const viewerAspect = pendingId
    ? takes.find((t) => t.id === pendingId)?.aspectRatio ?? aspectRatio ?? "16:9"
    : aspectRatio ?? "16:9";
  const viewerStatus = pendingId
    ? takes.find((t) => t.id === pendingId)?.status ?? "idle"
    : state.status;
  const viewerVideo = pendingId
    ? takes.find((t) => t.id === pendingId)?.videoUrl ?? null
    : state.videoUrl;
  const viewerError = pendingId
    ? takes.find((t) => t.id === pendingId)?.error ?? null
    : state.error;

  return (
    <div className="flex min-h-screen flex-col">
      <Slate live={live} takeCount={takes.length} />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
        <Viewer
          aspectRatio={viewerAspect}
          status={viewerStatus}
          videoUrl={viewerVideo}
          error={viewerError}
          prompt={prompt}
        />

        {!live && !loading && (
          <p className="text-center text-[11px] text-warn">
            Running in demo mode — add OPENROUTER_API_KEY to .env.local to generate for real.
          </p>
        )}

        <PromptStage
          prompt={prompt}
          onPromptChange={(v) => {
            setPrompt(v);
            setPendingId(null);
          }}
          disabled={rolling}
          referencePreview={reference}
          onReferenceChange={setReference}
          showReference={Boolean(model?.supports_frame_images)}
        />

        <ControlRail
          models={models}
          model={model}
          onModel={(m) => setModelId(m.id)}
          duration={duration}
          onDuration={setDuration}
          resolution={resolution}
          onResolution={setResolution}
          aspectRatio={aspectRatio}
          onAspectRatio={setAspectRatio}
          generateAudio={generateAudio}
          onGenerateAudio={setGenerateAudio}
          seed={seed}
          onSeed={setSeed}
          disabled={rolling}
        />

        <button
          type="button"
          onClick={handleAction}
          disabled={!model || !prompt.trim() || rolling}
          className="group flex items-center justify-center gap-2 self-center rounded-sm border border-accent-dim bg-accent-soft px-8 py-3 text-sm tracking-[0.2em] uppercase text-accent transition-colors hover:bg-accent hover:text-bg disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-accent-soft disabled:hover:text-accent cursor-pointer"
        >
          <span
            className={`h-2 w-2 rounded-full bg-current ${rolling ? "animate-tally" : ""}`}
          />
          {rolling ? "Rolling…" : "Action"}
        </button>
      </main>

      <Dailies
        takes={takes}
        onSelect={reopenTake}
        onRemove={(id) => persist(removeTake(loadTakes(), id))}
      />
    </div>
  );
}
