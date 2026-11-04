"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { MAX_STEPS, type Model } from "@/lib/chain-lab";
import { addStep, type FormState } from "../../actions";
import { StepFields } from "./step-fields";
import ui from "../../ui.module.css";
import styles from "./chain.module.css";

export function AddStep({ chainId, total, models }: { chainId: string; total: number; models: Model[] }) {
  const [open, setOpen] = useState(total === 0);
  const [position, setPosition] = useState(0);
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState<FormState, FormData>(addStep.bind(null, chainId), {});
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      setFormKey((k) => k + 1);
      setPosition(0);
      setOpen(false);
    }
  }, [state]);

  if (total >= MAX_STEPS) {
    return <p className={styles.addHint}>This chain has the maximum of {MAX_STEPS} steps.</p>;
  }

  if (!open) {
    return (
      <div className={styles.addRow}>
        <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
          + Add a step
        </button>
        {state.ok && state.message && (
          <span className={ui.success} role="status">
            {state.message}
          </span>
        )}
      </div>
    );
  }

  const newPosition = position || total + 1;
  return (
    <form key={formKey} ref={form} action={action} className={`${ui.card} ${styles.addForm}`} noValidate>
      <div className={styles.addHead}>
        <h3 className={ui.sectionTitle}>New step</h3>
        {total > 0 && (
          <label className={styles.where}>
            <span>Add</span>
            <select name="position" value={position} onChange={(e) => setPosition(Number(e.target.value))}>
              <option value={0}>at the end (step {total + 1})</option>
              {Array.from({ length: total }, (_, i) => (
                <option key={i} value={i + 1}>
                  before step {i + 1}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <StepFields models={models} errors={state.errors ?? {}} position={newPosition} key={newPosition === 1 ? "first" : "later"} />
      <div className={ui.actions}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add step"}
        </button>
        {total > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
        )}
        {state.message && !state.ok && (
          <p className={ui.error} role="alert">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
