"use client";

import { useActionState, useEffect, useState } from "react";
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

  useEffect(() => {
    if (state.ok) {
      setFormKey((k) => k + 1);
      setPosition(0);
      setOpen(false);
    }
  }, [state]);

  if (total >= MAX_STEPS) return null;

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        + Add step
      </button>
    );
  }

  return (
    <form key={formKey} action={action} className={`${ui.card} ${styles.addForm}`} noValidate>
      {total > 0 && (
        <label className={styles.where}>
          <span>Add</span>
          <select name="position" value={position} onChange={(e) => setPosition(Number(e.target.value))}>
            <option value={0}>at the end</option>
            {Array.from({ length: total }, (_, i) => (
              <option key={i} value={i + 1}>
                before step {i + 1}
              </option>
            ))}
          </select>
        </label>
      )}
      <StepFields
        models={models}
        errors={state.errors ?? {}}
        position={position || total + 1}
        key={(position || total + 1) === 1 ? "first" : "later"}
      />
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
