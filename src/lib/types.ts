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

export type InputReference = {
  type: "image_url";
  image_url: { url: string };
};

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
