import { ApiError, GoogleGenAI } from "@google/genai";
import type { StepInput, StepOutput } from "@/lib/chain-lab";
import type { ModelImage } from "./fetch-image";

/** Used when no models are active in the database. */
export const DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"];

export class StepError extends Error {
  constructor(
    message: string,
    /** Safe to show in the UI. */
    readonly userMessage: string,
  ) {
    super(message);
  }
}

/**
 * Fills a step's prompt:
 *   {{previous}}  the previous step's output (step 1: the run's starting text)
 *   {{step N}}    the output of step N
 *   {{input}}     the run's starting text
 * A step that takes the previous output but doesn't say where gets it appended.
 */
export function renderPrompt(
  template: string,
  { input, position, outputs, startingText }: { input: StepInput; position: number; outputs: Map<number, string>; startingText: string | null },
) {
  const previous = position === 1 ? (startingText ?? "") : (outputs.get(position - 1) ?? "");
  let usedPrevious = false;
  let text = template
    .replace(/\{\{\s*previous\s*\}\}/gi, () => {
      usedPrevious = true;
      return previous || "(nothing)";
    })
    .replace(/\{\{\s*step\s*(\d+)\s*\}\}/gi, (_, n: string) => outputs.get(Number(n)) ?? `(step ${n} has no output)`)
    .replace(/\{\{\s*input\s*\}\}/gi, () => startingText || "(no starting text)");

  if (input !== "image" && !usedPrevious && previous) {
    const from = position === 1 ? "Starting text" : `Output of step ${position - 1}`;
    text = `${text.trim()}\n\n${from}:\n${previous}`;
  }
  return text.trim();
}

function captionSchema(count: number) {
  return {
    type: "object",
    properties: {
      captions: {
        type: "array",
        items: { type: "string" },
        minItems: count,
        maxItems: count,
      },
    },
    required: ["captions"],
  };
}

function parseCaptions(raw: string | undefined, count: number) {
  try {
    const parsed = JSON.parse(raw ?? "") as { captions?: unknown };
    if (!Array.isArray(parsed.captions)) return [];
    return parsed.captions
      .filter((c): c is string => typeof c === "string")
      .map((c) => c.trim().replace(/^["“]|["”]$/g, ""))
      .filter(Boolean)
      .slice(0, count);
  } catch {
    return [];
  }
}

export type StepResult = {
  model: string;
  /** Free text, or the captions as a numbered list (what the next step receives). */
  text: string;
  captions: string[] | null;
  latencyMs: number;
};

/** How long one step may spend on model calls in total (the server action gets 120s). */
const STEP_BUDGET_MS = 90_000;
/** How long to wait on one model before trying the next one. */
const ATTEMPT_MS = 12_000;

function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/**
 * One step = one model call. Tries each model in order, moving on when one is
 * rate limited, overloaded, or too slow (a busy model can take 30s+ or fail
 * after 20s), so a step can't outlive the request.
 */
export async function runModelStep({
  models,
  prompt,
  image,
  output,
  captionCount,
}: {
  models: { api_model_id: string; temperature: number }[];
  prompt: string;
  image: ModelImage | null;
  output: StepOutput;
  captionCount: number;
}): Promise<StepResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new StepError("GEMINI_API_KEY is not set", "The model API key isn't configured on the server.");

  const ai = new GoogleGenAI({ apiKey });
  const parts = [
    ...(image ? [{ inlineData: { mimeType: image.mediaType, data: image.data } }] : []),
    {
      text:
        output === "captions"
          ? `${prompt}\n\nReturn exactly ${captionCount} caption${captionCount === 1 ? "" : "s"}.`
          : prompt,
    },
  ];

  const deadline = Date.now() + STEP_BUDGET_MS;
  let lastError: unknown;
  for (const [i, { api_model_id: model, temperature }] of models.entries()) {
    const started = Date.now();
    const remaining = deadline - started;
    if (remaining < 3_000) break;
    // The last model gets whatever time is left; earlier ones get a fair slice.
    const timeout = i === models.length - 1 ? remaining : Math.min(ATTEMPT_MS, remaining);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          abortSignal: AbortSignal.timeout(timeout),
          temperature,
          ...(output === "captions"
            ? { responseMimeType: "application/json", responseJsonSchema: captionSchema(captionCount) }
            : {}),
        },
      });
      const latencyMs = Date.now() - started;

      if (response.promptFeedback?.blockReason) {
        throw new StepError(
          `prompt blocked: ${response.promptFeedback.blockReason}`,
          `The model refused this prompt (${response.promptFeedback.blockReason.toLowerCase()}).`,
        );
      }

      if (output === "captions") {
        const captions = parseCaptions(response.text, captionCount);
        if (captions.length === 0) {
          lastError = new Error(`${model} returned no captions`);
          continue;
        }
        return { model, text: captions.map((c, i) => `${i + 1}. ${c}`).join("\n"), captions, latencyMs };
      }

      const text = response.text?.trim();
      if (!text) {
        lastError = new Error(`${model} returned an empty response`);
        continue;
      }
      return { model, text, captions: null, latencyMs };
    } catch (error) {
      if (error instanceof StepError) throw error;
      lastError = error;
      if (isTimeout(error)) continue;
      if (error instanceof ApiError && (error.status === 429 || error.status >= 500)) continue;
      break;
    }
  }

  console.error("[run-step] all models failed", lastError);
  if (lastError instanceof ApiError && lastError.status === 429) {
    throw new StepError(String(lastError), "Gemini is rate limiting us. Wait a minute and run again.");
  }
  if (isTimeout(lastError) || (lastError instanceof ApiError && lastError.status >= 500)) {
    throw new StepError(String(lastError), "The models are busy right now. Try again in a minute.");
  }
  if (lastError instanceof ApiError && lastError.status === 404) {
    throw new StepError(String(lastError), "That model doesn't exist on the API. Pick another model for this step.");
  }
  throw new StepError(String(lastError), "The model call failed. Try again, or pick another model for this step.");
}
