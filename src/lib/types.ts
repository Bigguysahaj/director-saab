export type VideoModel = {
  id: string;
  label: string;
  provider: string;
  tagline: string;
  supported_durations: number[];
  supported_resolutions: string[];
  supported_aspect_ratios: string[];
  supports_audio: boolean;
  supports_seed: boolean;
  supports_frame_images: boolean;
  supports_input_references: boolean;
  price_per_second?: number;
  // Accepts a video_url input reference (Seedance 2.x). Drives which models
  // the "Send a stage take" flow offers.
  supports_video_reference: boolean;
  // Per-token USD rates for token-priced models (Seedance): the plain rate,
  // and the one that applies once a video reference is attached.
  token_rate?: number;
  video_input_token_rate?: number;
};

export type GenerationStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type CreateJobResponse = {
  id: string;
  polling_url: string;
  status: GenerationStatus;
};

export type PollJobResponse = {
  id: string;
  generation_id?: string;
  status: GenerationStatus;
  error?: string;
  unsigned_urls?: string[];
  usage?: { cost?: number; is_byok?: boolean };
};

export type FrameImage = {
  type: "image_url";
  image_url: { url: string };
  frame_type: "first_frame" | "last_frame";
};

// Seedance 2.x honours all three; other models take images only.
export type InputReference =
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "audio_url"; audio_url: { url: string } };

export type GenerateRequest = {
  model: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  aspect_ratio?: string;
  seed?: number;
  generate_audio?: boolean;
  frame_images?: FrameImage[];
  input_references?: InputReference[];
};

export type ImageGenerateRequest = {
  model: string;
  prompt: string;
  input_references?: InputReference[];
};

export type ImageGenerateResponse = {
  data: { b64_json: string; media_type: string }[];
  usage?: { cost?: number };
};

// One entry from OpenRouter's GET /images/models catalog — the "DoP"
// (Director of Photography) picker in Audition.tsx's Screen Test section
// lets the user choose among these instead of a single hardcoded model.
export type ImageModel = {
  id: string;
  label: string;
  provider: string;
  tagline: string;
  maxInputReferences: number;
};

export type Take = {
  id: string;
  prompt: string;
  model: string;
  modelLabel: string;
  createdAt: number;
  duration?: number;
  resolution?: string;
  aspectRatio?: string;
  status: GenerationStatus;
  videoUrl?: string;
  cost?: number;
  error?: string;
};
