"use client";

import { useState } from "react";
import { INPUTS, OUTPUTS, type Model, type Step, type StepInput, type StepOutput } from "@/lib/chain-lab";
import ui from "../../ui.module.css";
import styles from "./chain.module.css";

type Props = {
  defaults?: Partial<Pick<Step, "name" | "input" | "output" | "caption_count" | "prompt" | "model_id">>;
  models: Model[];
  errors: Record<string, string>;
  /** Shown as the step number this form is for (affects the "previous" hint for step 1). */
  position: number;
};

/** The fields of a step, shared by "add step" and "edit step". */
export function StepFields({ defaults = {}, models, errors, position }: Props) {
  const [input, setInput] = useState<StepInput>(defaults.input ?? (position === 1 ? "image" : "previous"));
  const [output, setOutput] = useState<StepOutput>(defaults.output ?? "text");

  return (
    <div className={styles.fields}>
      <label className="field">
        <span>Step name</span>
        <input
          name="name"
          defaultValue={defaults.name}
          maxLength={80}
          required
          placeholder="e.g. Describe the image"
          aria-invalid={Boolean(errors.name)}
        />
        {errors.name && <small className={ui.fieldError}>{errors.name}</small>}
      </label>

      <div className={styles.fieldRow}>
        <label className="field">
          <span>Takes in</span>
          <select name="input" value={input} onChange={(e) => setInput(e.target.value as StepInput)}>
            {(Object.keys(INPUTS) as StepInput[]).map((k) => (
              <option key={k} value={k}>
                {INPUTS[k].label}
              </option>
            ))}
          </select>
          <small>
            {input !== "image" && position === 1
              ? "Step 1 has no previous step: it gets the run's starting text, if you give one."
              : INPUTS[input].hint}
          </small>
        </label>
        <label className="field">
          <span>Puts out</span>
          <select name="output" value={output} onChange={(e) => setOutput(e.target.value as StepOutput)}>
            {(Object.keys(OUTPUTS) as StepOutput[]).map((k) => (
              <option key={k} value={k}>
                {OUTPUTS[k].label}
              </option>
            ))}
          </select>
          <small>{OUTPUTS[output].hint}</small>
        </label>
      </div>

      <div className={styles.fieldRow}>
        <label className="field">
          <span>Model</span>
          <select name="model_id" defaultValue={defaults.model_id ?? ""}>
            <option value="">Automatic (active models, by priority)</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.is_active ? "" : " (inactive)"}
                {m.supports_images ? "" : " (text only)"}
              </option>
            ))}
          </select>
          {errors.model_id && <small className={ui.fieldError}>{errors.model_id}</small>}
        </label>
        {output === "captions" ? (
          <label className="field">
            <span>How many captions</span>
            <input name="caption_count" type="number" min={1} max={10} defaultValue={defaults.caption_count ?? 5} />
            {errors.caption_count && <small className={ui.fieldError}>{errors.caption_count}</small>}
          </label>
        ) : (
          <input type="hidden" name="caption_count" value={defaults.caption_count ?? 5} />
        )}
      </div>

      <label className="field">
        <span>Prompt</span>
        <textarea
          name="prompt"
          defaultValue={defaults.prompt}
          maxLength={4000}
          rows={7}
          required
          placeholder={
            position === 1
              ? "Describe this image in plain, specific detail…"
              : "Here is the previous step's output:\n\n{{previous}}\n\nNow…"
          }
          aria-invalid={Boolean(errors.prompt)}
        />
        <small>
          <code>{"{{previous}}"}</code> = the previous step&apos;s output, <code>{"{{step 1}}"}</code> = step 1&apos;s
          output, <code>{"{{input}}"}</code> = the run&apos;s starting text. If a step takes the previous output but the
          prompt doesn&apos;t say where, it&apos;s added at the end.
        </small>
        {errors.prompt && <small className={ui.fieldError}>{errors.prompt}</small>}
      </label>
    </div>
  );
}
