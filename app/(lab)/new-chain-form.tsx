"use client";

import { useActionState, useState } from "react";
import { createChain, type FormState } from "./actions";
import styles from "./chains.module.css";
import ui from "./ui.module.css";

/** A "New chain" button that opens a small form. */
export function NewChainForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(createChain, {});
  const errors = state.errors ?? {};

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        + New chain
      </button>
    );
  }

  return (
    <form action={action} className={`${ui.card} ${styles.form}`} noValidate>
      <label className="field">
        <span>Name</span>
        <input name="name" maxLength={80} required autoFocus aria-invalid={Boolean(errors.name)} />
        {errors.name && <small className={ui.fieldError}>{errors.name}</small>}
      </label>
      <label className="field">
        <span>Description (optional)</span>
        <input name="description" maxLength={500} />
        {errors.description && <small className={ui.fieldError}>{errors.description}</small>}
      </label>
      <label className={styles.check}>
        <input type="checkbox" name="start" value="example" defaultChecked />
        Start with the 3-step example
      </label>
      <div className={ui.actions}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Create"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {state.message && (
        <p className={ui.error} role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
