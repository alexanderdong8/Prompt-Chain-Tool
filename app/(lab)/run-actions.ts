"use server";

import { revalidatePath } from "next/cache";
import { adminOrNull } from "@/lib/admin";
import { fetchImage, type ModelImage } from "@/lib/ai/fetch-image";
import { DEFAULT_MODELS, renderPrompt, runModelStep, StepError } from "@/lib/ai/run-step";
import { needsImage, RUN_STEP_COLUMNS, STEP_COLUMNS, type RunStep, type Step } from "@/lib/chain-lab";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = "caption-photos";

export type StartResult =
  | { ok: true; runId: string; steps: { position: number; name: string }[] }
  | { ok: false; message: string };

export type StepRunResult =
  | { ok: true; step: RunStep; done: boolean; captions: string[] }
  | { ok: false; message: string; step?: RunStep };

/** Step 2 of an upload from the run panel: the file is in the admin's folder; add it to the image library. */
export async function registerUpload(path: string): Promise<{ ok: true; id: string; url: string } | { ok: false; message: string }> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, message: "Superadmins only." };
  if (!new RegExp(`^${admin.user.id}/library-[0-9a-f-]{36}\\.(jpg|png|webp)$`).test(path)) {
    return { ok: false, message: "That upload path isn't valid." };
  }
  const url = admin.supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const { data, error } = await admin.supabase
    .from("images")
    .insert({ storage_path: path, public_url: url, description: "Uploaded in Chain Lab", source: "library", uploaded_by: admin.user.id })
    .select("id")
    .single();
  if (error || !data) {
    await admin.supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, message: error?.message ?? "Couldn't save the image." };
  }
  return { ok: true, id: data.id, url };
}

/**
 * Creates a run with a snapshot of the chain's steps (so later edits don't
 * rewrite it). The browser then runs the steps one call at a time, which keeps
 * each request short and shows progress as it goes.
 */
export async function startRun(chainId: string, imageId: string | null, startingText: string): Promise<StartResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, message: "Superadmins only. Sign in again." };
  if (!UUID.test(chainId)) return { ok: false, message: "Unknown chain." };
  if (imageId && !UUID.test(imageId)) return { ok: false, message: "Unknown image." };
  const input = startingText.trim();
  if (input.length > 2000) return { ok: false, message: "Keep the starting text under 2,000 characters." };

  const [{ data: chain }, { data: steps }] = await Promise.all([
    admin.supabase.from("chain_lab_chains").select("id, name").eq("id", chainId).maybeSingle(),
    admin.supabase.from("chain_lab_steps").select(STEP_COLUMNS).eq("chain_id", chainId).order("position").returns<Step[]>(),
  ]);
  if (!chain) return { ok: false, message: "That chain no longer exists." };
  if (!steps?.length) return { ok: false, message: "Add at least one step before running the chain." };

  let imageUrl: string | null = null;
  if (imageId) {
    const { data: image } = await admin.supabase.from("images").select("public_url").eq("id", imageId).maybeSingle();
    if (!image) return { ok: false, message: "That image is no longer in the library." };
    imageUrl = image.public_url;
  }
  if (needsImage(steps) && !imageUrl) return { ok: false, message: "Pick an image: some steps look at it." };

  const { data: run, error } = await admin.supabase
    .from("chain_lab_runs")
    .insert({ chain_id: chain.id, chain_name: chain.name, image_id: imageId, image_url: imageUrl, input_text: input || null })
    .select("id")
    .single();
  if (error || !run) return { ok: false, message: `Couldn't start the run: ${error?.message}` };

  const { error: stepsError } = await admin.supabase.from("chain_lab_run_steps").insert(
    steps.map((s) => ({
      run_id: run.id,
      position: s.position,
      name: s.name,
      input: s.input,
      output: s.output,
      caption_count: s.caption_count,
      prompt_template: s.prompt,
      model_id: s.model_id,
    })),
  );
  if (stepsError) {
    await admin.supabase.from("chain_lab_runs").delete().eq("id", run.id);
    return { ok: false, message: `Couldn't start the run: ${stepsError.message}` };
  }
  return { ok: true, runId: run.id, steps: steps.map((s) => ({ position: s.position, name: s.name })) };
}

/**
 * When a step's request dies (the connection dropped or the server cut it
 * off), marks the step and run failed so they don't stay "running" forever.
 */
export async function abandonRun(runId: string, position: number) {
  const admin = await adminOrNull();
  if (!admin || !UUID.test(runId) || !Number.isInteger(position)) return;
  const now = new Date().toISOString();
  await admin.supabase
    .from("chain_lab_run_steps")
    .update({ status: "failed", error: "The request was cut off before the model answered.", completed_at: now })
    .eq("run_id", runId)
    .eq("position", position)
    .in("status", ["pending", "running"]);
  const { data } = await admin.supabase
    .from("chain_lab_runs")
    .update({ status: "failed", error: `Step ${position}: the request was cut off.`, completed_at: now })
    .eq("id", runId)
    .eq("status", "running")
    .select("chain_id");
  if (data?.[0]) revalidatePath(`/chains/${data[0].chain_id}`, "layout");
}

/** Runs one step of a run: fills its prompt with earlier outputs, calls the model, saves the result. */
export async function runStep(runId: string, position: number): Promise<StepRunResult> {
  const admin = await adminOrNull();
  if (!admin) return { ok: false, message: "Superadmins only. Sign in again." };
  if (!UUID.test(runId) || !Number.isInteger(position)) return { ok: false, message: "Unknown run." };
  const db = admin.supabase;

  const [{ data: run }, { data: runSteps }] = await Promise.all([
    db.from("chain_lab_runs").select("id, chain_id, status, image_url, input_text").eq("id", runId).maybeSingle(),
    db.from("chain_lab_run_steps").select(`${RUN_STEP_COLUMNS}, model_id`).eq("run_id", runId).order("position").returns<(RunStep & { model_id: string | null })[]>(),
  ]);
  if (!run || !runSteps?.length) return { ok: false, message: "That run no longer exists." };
  if (run.status !== "running") return { ok: false, message: "This run has already finished." };
  const step = runSteps.find((s) => s.position === position);
  if (!step) return { ok: false, message: "That step isn't part of this run." };
  if (step.status !== "pending") return { ok: false, message: "That step has already run." };
  if (runSteps.some((s) => s.position < position && s.status !== "succeeded")) {
    return { ok: false, message: "Earlier steps haven't finished." };
  }

  const outputs = new Map(runSteps.filter((s) => s.result).map((s) => [s.position, s.result as string]));
  const prompt = renderPrompt(step.prompt_template, {
    input: step.input,
    position,
    outputs,
    startingText: run.input_text,
  });
  await db
    .from("chain_lab_run_steps")
    .update({ status: "running", prompt, started_at: new Date().toISOString() })
    .eq("id", step.id);

  const fail = async (message: string, detail: string) => {
    const now = new Date().toISOString();
    const { data: failed } = await db
      .from("chain_lab_run_steps")
      .update({ status: "failed", error: detail, completed_at: now })
      .eq("id", step.id)
      .select(RUN_STEP_COLUMNS)
      .single<RunStep>();
    await db
      .from("chain_lab_runs")
      .update({ status: "failed", error: `Step ${position}: ${message}`, completed_at: now })
      .eq("id", runId);
    revalidatePath(`/chains/${run.chain_id}`, "layout");
    return { ok: false as const, message, step: failed ?? undefined };
  };

  try {
    let image: ModelImage | null = null;
    if (step.input !== "previous") {
      if (!run.image_url) return await fail("This step needs an image, but the run has none.", "no image");
      image = await fetchImage(run.image_url);
    }

    // A step pinned to a model uses only that one; otherwise the active models in priority order.
    let models: { api_model_id: string; temperature: number }[];
    if (step.model_id) {
      const { data: m } = await db.from("llm_models").select("api_model_id, temperature").eq("id", step.model_id).maybeSingle();
      if (!m) return await fail("This step's model was removed. Pick another.", "model not found");
      models = [{ api_model_id: m.api_model_id, temperature: Number(m.temperature) }];
    } else {
      const { data: active } = await db
        .from("llm_models")
        .select("api_model_id, temperature, supports_images, provider:llm_providers(slug)")
        .eq("is_active", true)
        .order("priority")
        .returns<{ api_model_id: string; temperature: number; supports_images: boolean; provider: { slug: string } | null }[]>();
      const usable = (active ?? []).filter((m) => m.provider?.slug === "google" && (!image || m.supports_images));
      models = usable.length
        ? usable.map((m) => ({ api_model_id: m.api_model_id, temperature: Number(m.temperature) }))
        : DEFAULT_MODELS.map((api_model_id) => ({ api_model_id, temperature: 1 }));
    }

    const result = await runModelStep({ models, prompt, image, output: step.output, captionCount: step.caption_count });
    const now = new Date().toISOString();
    const { data: saved } = await db
      .from("chain_lab_run_steps")
      .update({
        status: "succeeded",
        model: result.model,
        result: result.text,
        captions: result.captions,
        latency_ms: result.latencyMs,
        completed_at: now,
      })
      .eq("id", step.id)
      .select(RUN_STEP_COLUMNS)
      .single<RunStep>();

    const done = position === Math.max(...runSteps.map((s) => s.position));
    if (done) {
      await db
        .from("chain_lab_runs")
        .update({ status: "succeeded", captions: result.captions ?? [], final_output: result.text, completed_at: now })
        .eq("id", runId);
      revalidatePath(`/chains/${run.chain_id}`, "layout");
    }
    return { ok: true, step: saved!, done, captions: result.captions ?? [] };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return await fail(error instanceof StepError ? error.userMessage : "Couldn't load the image or reach the model.", detail);
  }
}
