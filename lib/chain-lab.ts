import type { SupabaseClient } from "@supabase/supabase-js";

export type StepInput = "image" | "previous" | "both";
export type StepOutput = "text" | "captions";

export const INPUTS: Record<StepInput, { label: string; hint: string }> = {
  image: { label: "The image", hint: "Sees the run's image. Ignores earlier steps unless the prompt uses {{step N}}." },
  previous: { label: "Previous step", hint: "Gets the previous step's output (step 1 gets the starting text)." },
  both: { label: "Image + previous step", hint: "Sees the image and gets the previous step's output." },
};

export const OUTPUTS: Record<StepOutput, { label: string; hint: string }> = {
  text: { label: "Text", hint: "Free text, passed to the next step." },
  captions: { label: "Captions", hint: "A list of short captions. On the last step, these become the run's media." },
};

export const MAX_STEPS = 12;

export type Chain = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type Step = {
  id: string;
  chain_id: string;
  position: number;
  name: string;
  input: StepInput;
  output: StepOutput;
  caption_count: number;
  prompt: string;
  model_id: string | null;
};

export type Model = { id: string; name: string; api_model_id: string; is_active: boolean; supports_images: boolean };

export type Run = {
  id: string;
  chain_id: string;
  chain_name: string;
  image_url: string | null;
  input_text: string | null;
  status: "running" | "succeeded" | "failed";
  error: string | null;
  captions: string[];
  final_output: string | null;
  created_at: string;
  completed_at: string | null;
};

export type RunStep = {
  id: string;
  run_id: string;
  position: number;
  name: string;
  input: StepInput;
  output: StepOutput;
  caption_count: number;
  prompt_template: string;
  status: "pending" | "running" | "succeeded" | "failed";
  prompt: string | null;
  model: string | null;
  result: string | null;
  captions: string[] | null;
  error: string | null;
  latency_ms: number | null;
};

export type LibraryImage = { id: string; public_url: string; description: string | null };

export const STEP_COLUMNS = "id, chain_id, position, name, input, output, caption_count, prompt, model_id";
export const RUN_COLUMNS =
  "id, chain_id, chain_name, image_url, input_text, status, error, captions, final_output, created_at, completed_at";
export const RUN_STEP_COLUMNS =
  "id, run_id, position, name, input, output, caption_count, prompt_template, status, prompt, model, result, captions, error, latency_ms";

export async function getModels(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("llm_models")
    .select("id, name, api_model_id, is_active, supports_images")
    .order("priority")
    .returns<Model[]>();
  return data ?? [];
}

export async function getLibraryImages(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("images")
    .select("id, public_url, description")
    .order("created_at", { ascending: false })
    .limit(60)
    .returns<LibraryImage[]>();
  return data ?? [];
}

/** True when any step needs the run's image. */
export function needsImage(steps: Pick<Step, "input">[]) {
  return steps.some((s) => s.input !== "previous");
}

export function timeAgo(iso: string) {
  const seconds = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
