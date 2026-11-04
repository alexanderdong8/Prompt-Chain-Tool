"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { INPUTS, OUTPUTS, type Model, type Step } from "@/lib/chain-lab";
import { deleteStep, moveStep, updateStep, type FormState } from "../../actions";
import { StepFields } from "./step-fields";
import ui from "../../ui.module.css";
import styles from "./chain.module.css";

type Props = { step: Step; total: number; models: Model[] };

/** One step: read view with reorder controls, or an edit form. */
export function StepCard({ step, total, models }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [state, action, saving] = useActionState<FormState, FormData>(updateStep.bind(null, step.id), {});
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const model = models.find((m) => m.id === step.model_id);

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  function move(position: number) {
    setError(null);
    startTransition(async () => {
      const r = await moveStep(step.id, position);
      if (!r.ok) setError(r.message ?? "Couldn't move the step.");
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const r = await deleteStep(step.id);
      if (!r.ok) setError(r.message ?? "Couldn't delete the step.");
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
          <p className={styles.stepBadges}>
            <span className={ui.badge} data-tone="wire">
              In: {INPUTS[step.input].label}
            </span>
            <span className={ui.badge} data-tone={step.output === "captions" ? "sun" : undefined}>
              Out: {step.output === "captions" ? `${step.caption_count} captions` : OUTPUTS.text.label}
            </span>
            <span className={ui.badge}>{model ? model.name : "Auto model"}</span>
          </p>
        </div>
        {!editing && (
          <div className={styles.stepTools}>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => move(step.position - 1)}
              disabled={busy || step.position === 1}
              aria-label={`Move step ${step.position} up`}
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => move(step.position + 1)}
              disabled={busy || step.position === total}
              aria-label={`Move step ${step.position} down`}
              title="Move down"
            >
              ↓
            </button>
            <label className={styles.moveTo}>
              <span className="visually-hidden">Move step {step.position} to position</span>
              <select
                value={step.position}
                disabled={busy || total < 2}
                onChange={(e) => move(Number(e.target.value))}
                title="Move to position"
              >
                {Array.from({ length: total }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1 === step.position ? `Step ${i + 1}` : `Move to ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)} disabled={busy}>
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
              {saving ? "Saving…" : "Save step"}
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
        <pre className={styles.prompt}>{step.prompt}</pre>
      )}

      {confirming && (
        <div className={ui.confirm} role="alertdialog" aria-label={`Delete step ${step.position}?`}>
          <p>
            <strong>Delete step {step.position}, “{step.name}”?</strong>{" "}
            {step.position < total ? "The steps after it move up one. " : ""}Past runs keep their copy of it.
          </p>
          <div className={ui.actions}>
            <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Yes, delete step"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
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
