"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminOrNull } from "@/lib/admin";
import { MAX_STEPS, type StepInput, type StepOutput } from "@/lib/chain-lab";

export type FormState = { ok?: boolean; message?: string; errors?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ADMIN: FormState = { ok: false, message: "Superadmins only. Sign in again." };

function text(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function oneLine(value: string) {
  return value.replace(/\s+/g, " ");
}

/** The example chain new chains can start from (the same steps the database was seeded with). */
const EXAMPLE_STEPS: { name: string; input: StepInput; output: StepOutput; prompt: string }[] = [
  {
    name: "Describe the image",
    input: "image",
    output: "text",
    prompt:
      "Describe this image in plain, specific detail: the setting, the people or animals and what they're doing, facial expressions, any text, and anything odd or out of place. Don't guess who real people are. 4-6 sentences.",
  },
  {
    name: "Find the funny",
    input: "previous",
    output: "text",
    prompt:
      "Here is a description of a photo:\n\n{{previous}}\n\nWhat's funny about this? List 3 different comedic angles (an exaggeration, a relatable confession, an absurd twist...), each in one or two sentences. Keep it PG-13 and punch up, never down.",
  },
  {
    name: "Write captions",
    input: "both",
    output: "captions",
    prompt:
      "Using the photo and these comedic angles:\n\n{{previous}}\n\nWrite five short, funny captions for the photo, for college students in New York. Each under 120 characters, each a different angle. No hashtags or numbering.",
  },
];

// ---------------------------------------------------------------------------
// Chains

function readChain(form: FormData) {
  const name = oneLine(text(form, "name"));
  const description = text(form, "description");
  const errors: Record<string, string> = {};
  if (!name) errors.name = "Give the chain a name.";
  else if (name.length > 80) errors.name = "Keep the name under 80 characters.";
  if (description.length > 500) errors.description = "Keep the description under 500 characters.";
  return { name, description, errors };
}

export async function createChain(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await adminOrNull();
  if (!admin) return NOT_ADMIN;
  const { name, description, errors } = readChain(form);
  if (Object.keys(errors).length) return { ok: false, errors };

  const { data: chain, error } = await admin.supabase
    .from("chain_lab_chains")
    .insert({ name, description })
    .select("id")
    .single();
  if (error || !chain) return { ok: false, message: `Couldn't create the chain: ${error?.message}` };

  if (text(form, "start") === "example") {
    const { error: stepsError } = await admin.supabase
      .from("chain_lab_steps")
      .insert(EXAMPLE_STEPS.map((s, i) => ({ ...s, chain_id: chain.id, position: i + 1 })));
    if (stepsError) console.error("[createChain] example steps failed", stepsError.message);
  }

  revalidatePath("/");
  redirect(`/chains/${chain.id}`);
}

export async function updateChain(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const admin = await adminOrNull();
  if (!admin) return NOT_ADMIN;
  if (!UUID.test(id)) return { ok: false, message: "Unknown chain." };
  const { name, description, errors } = readChain(form);
  if (Object.keys(errors).length) return { ok: false, errors };

  const { data, error } = await admin.supabase
    .from("chain_lab_chains")
    .update({ name, description })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "That chain no longer exists." };
  revalidatePath(`/chains/${id}`, "layout");
  revalidatePath("/");
  return { ok: true, message: "Saved." };
}

export async function deleteChain(id: string): Promise<FormState> {
  const admin = await adminOrNull();
  if (!admin) return NOT_ADMIN;
  if (!UUID.test(id)) return { ok: false, message: "Unknown chain." };
  // Steps, runs, and run steps go with it (on delete cascade).
  const { error } = await admin.supabase.from("chain_lab_chains").delete().eq("id", id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/");
  redirect("/?deleted=1");
}

// ---------------------------------------------------------------------------
// Steps

function readStep(form: FormData) {
  const name = oneLine(text(form, "name"));
  const prompt = text(form, "prompt");
  const input = text(form, "input") as StepInput;
  const output = text(form, "output") as StepOutput;
  const captionCount = Number(text(form, "caption_count") || 5);
  const modelId = text(form, "model_id");

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Name the step.";
  else if (name.length > 80) errors.name = "Keep the name under 80 characters.";
  if (!prompt) errors.prompt = "Write the prompt for this step.";
  else if (prompt.length > 4000) errors.prompt = "Keep the prompt under 4,000 characters.";
  if (!["image", "previous", "both"].includes(input)) errors.input = "Pick what this step takes in.";
  if (!["text", "captions"].includes(output)) errors.output = "Pick what this step puts out.";
  if (!Number.isInteger(captionCount) || captionCount < 1 || captionCount > 10) {
    errors.caption_count = "Between 1 and 10 captions.";
  }
  if (modelId && !UUID.test(modelId)) errors.model_id = "Pick a model from the list.";

  return {
    values: { name, prompt, input, output, caption_count: captionCount, model_id: modelId || null },
    errors,
  };
}

export async function addStep(chainId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const admin = await adminOrNull();
  if (!admin) return NOT_ADMIN;
  if (!UUID.test(chainId)) return { ok: false, message: "Unknown chain." };
  const { values, errors } = readStep(form);
  if (Object.keys(errors).length) return { ok: false, errors };

  const { count } = await admin.supabase
    .from("chain_lab_steps")
    .select("id", { count: "exact", head: true })
    .eq("chain_id", chainId);
  if ((count ?? 0) >= MAX_STEPS) return { ok: false, message: `A chain can have up to ${MAX_STEPS} steps.` };

  // Empty = on the end; the database shifts later steps down when a position is given.
  const position = Number(text(form, "position")) || null;
  const { error } = await admin.supabase.from("chain_lab_steps").insert({ ...values, chain_id: chainId, position });
  if (error) return { ok: false, message: `Couldn't add the step: ${error.message}` };
  revalidatePath(`/chains/${chainId}`);
  return { ok: true, message: "Step added." };
}

export async function updateStep(stepId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const admin = await adminOrNull();
  if (!admin) return NOT_ADMIN;
  if (!UUID.test(stepId)) return { ok: false, message: "Unknown step." };
  const { values, errors } = readStep(form);
  if (Object.keys(errors).length) return { ok: false, errors };

  const { data, error } = await admin.supabase
    .from("chain_lab_steps")
    .update(values)
    .eq("id", stepId)
    .select("chain_id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "That step no longer exists." };
  revalidatePath(`/chains/${data[0].chain_id}`);
  return { ok: true, message: "Saved." };
}

export async function deleteStep(stepId: string): Promise<FormState> {
  const admin = await adminOrNull();
  if (!admin) return NOT_ADMIN;
  if (!UUID.test(stepId)) return { ok: false, message: "Unknown step." };
  // Later steps move up one (a database trigger closes the gap).
  const { data, error } = await admin.supabase.from("chain_lab_steps").delete().eq("id", stepId).select("chain_id");
  if (error) return { ok: false, message: error.message };
  if (data?.length) revalidatePath(`/chains/${data[0].chain_id}`);
  return { ok: true };
}

export async function moveStep(stepId: string, position: number): Promise<FormState> {
  const admin = await adminOrNull();
  if (!admin) return NOT_ADMIN;
  if (!UUID.test(stepId) || !Number.isInteger(position) || position < 1) return { ok: false, message: "Bad move." };
  const { error } = await admin.supabase.rpc("chain_lab_move_step", { p_step: stepId, p_position: position });
  if (error) return { ok: false, message: error.message };
  const { data } = await admin.supabase.from("chain_lab_steps").select("chain_id").eq("id", stepId).maybeSingle();
  if (data) revalidatePath(`/chains/${data.chain_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Runs

export async function deleteRun(runId: string): Promise<FormState> {
  const admin = await adminOrNull();
  if (!admin) return NOT_ADMIN;
  if (!UUID.test(runId)) return { ok: false, message: "Unknown run." };
  const { data, error } = await admin.supabase.from("chain_lab_runs").delete().eq("id", runId).select("chain_id");
  if (error) return { ok: false, message: error.message };
  const chainId = data?.[0]?.chain_id;
  if (chainId) revalidatePath(`/chains/${chainId}`, "layout");
  redirect(chainId ? `/chains/${chainId}/media` : "/");
}
