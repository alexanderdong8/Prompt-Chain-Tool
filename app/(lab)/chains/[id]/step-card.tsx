"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import type { Model, Step } from "@/lib/chain-lab";
import { deleteStep, moveStep, updateStep, type FormState } from "../../actions";
import { StepFields } from "./step-fields";
import ui from "../../ui.module.css";
import styles from "./chain.module.css";

type Props = { step: Step; total: number; models: Model[] };

const IN = { image: "Image", previous: "Previous step", both: "Image + previous" } as const;

/** One step: a compact read view with reorder controls, or an edit form. */
export function StepCard({ step, total, models }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [state, action, saving] = useActionState<FormState, FormData>(updateStep.bind(null, step.id), {});
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const model = models.find((m) => m.id === step.model_id);
  const out = step.output === "captions" ? `${step.caption_count} captions` : "Text";

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  function run(work: () => Promise<FormState>) {
    setError(null);
    startTransition(async () => {
      const r = await work();
      if (!r.ok) setError(r.message ?? "Something went wrong.");
    });
  }

  return (
    <article className={`${ui.card} ${styles.step}`} aria-labelledby={`step-${step.id}`} aria-busy={busy}>
      <div className={styles.stepHead}>
        <span className={styles.stepNum} aria-hidden="true">
          {step.position}
        </span>
        <div className={styles.stepTitle}>
          <h3 id={`step-${step.id}`}>
            <span className="visually-hidden">Step {step.position}: </span>
            {step.name}
          </h3>
          <p className={styles.stepMeta}>
            {IN[step.input]} → {out}
            {model ? ` · ${model.name}` : ""}
          </p>
        </div>
        {!editing && !confirming && (
          <div className={styles.stepTools}>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => run(() => moveStep(step.id, step.position - 1))}
              disabled={busy || step.position === 1}
              aria-label={`Move step ${step.position} up`}
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => run(() => moveStep(step.id, step.position + 1))}
              disabled={busy || step.position === total}
              aria-label={`Move step ${step.position} down`}
              title="Move down"
            >
              ↓
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} disabled={busy}>
              Edit
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirming(true)}
              disabled={busy}
              aria-label={`Delete step ${step.position}`}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <form action={action} className={styles.stepForm} noValidate>
          <StepFields defaults={step} models={models} errors={state.errors ?? {}} position={step.position} />
          <div className={ui.actions}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            {state.message && !state.ok && (
              <p className={ui.error} role="alert">
                {state.message}
              </p>
            )}
          </div>
        </form>
      ) : (
        <p className={styles.prompt}>{step.prompt}</p>
      )}

      {confirming && (
        <div className={ui.confirm} role="alertdialog" aria-label={`Delete step ${step.position}?`}>
          <p>Delete this step?</p>
          <div className={ui.actions}>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => run(() => deleteStep(step.id))} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
