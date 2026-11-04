"use client";

import { useState } from "react";
import type { Model, Step, StepInput, StepOutput } from "@/lib/chain-lab";
import ui from "../../ui.module.css";
import styles from "./chain.module.css";

type Props = {
  defaults?: Partial<Pick<Step, "name" | "input" | "output" | "caption_count" | "prompt" | "model_id">>;
  models: Model[];
  errors: Record<string, string>;
  /** The step number this form is for: step 1 defaults to looking at the image. */
  position: number;
};

/** The fields of a step, shared by "add step" and "edit step". */
export function StepFields({ defaults = {}, models, errors, position }: Props) {
  const [output, setOutput] = useState<StepOutput>(defaults.output ?? "text");

  return (
    <div className={styles.fields}>
      <label className="field">
        <span>Name</span>
        <input name="name" defaultValue={defaults.name} maxLength={80} required aria-invalid={Boolean(errors.name)} />
        {errors.name && <small className={ui.fieldError}>{errors.name}</small>}
      </label>

      <div className={styles.fieldRow}>
        <label className="field">
          <span>Input</span>
          <select name="input" defaultValue={defaults.input ?? (position === 1 ? "image" : "previous")}>
            <option value={"image" satisfies StepInput}>Image</option>
            <option value={"previous" satisfies StepInput}>Previous step</option>
            <option value={"both" satisfies StepInput}>Image + previous step</option>
          </select>
        </label>
        <label className="field">
          <span>Output</span>
          <select name="output" value={output} onChange={(e) => setOutput(e.target.value as StepOutput)}>
            <option value="text">Text</option>
            <option value="captions">Captions</option>
          </select>
        </label>
        {output === "captions" ? (
          <label className="field">
            <span>How many</span>
            <input name="caption_count" type="number" min={1} max={10} defaultValue={defaults.caption_count ?? 5} />
            {errors.caption_count && <small className={ui.fieldError}>{errors.caption_count}</small>}
          </label>
        ) : (
          <input type="hidden" name="caption_count" value={defaults.caption_count ?? 5} />
        )}
        <label className="field">
          <span>Model</span>
          <select name="model_id" defaultValue={defaults.model_id ?? ""}>
            <option value="">Auto</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.is_active ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Prompt</span>
        <textarea
          name="prompt"
          defaultValue={defaults.prompt}
          maxLength={4000}
          rows={6}
          required
          aria-invalid={Boolean(errors.prompt)}
        />
        <small>
          <code>{"{{previous}}"}</code> inserts the previous step&apos;s output.
        </small>
        {errors.prompt && <small className={ui.fieldError}>{errors.prompt}</small>}
      </label>
    </div>
  );
}
