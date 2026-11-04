"use client";

import { useActionState } from "react";
import { createChain, type FormState } from "./actions";
import styles from "./chains.module.css";
import ui from "./ui.module.css";

export function NewChainForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createChain, {});
  const errors = state.errors ?? {};

  return (
    <form action={action} className={styles.form} noValidate>
      <label className="field">
        <span>Name</span>
        <input name="name" maxLength={80} required placeholder="e.g. Dorm life roast" aria-invalid={Boolean(errors.name)} />
        {errors.name && <small className={ui.fieldError}>{errors.name}</small>}
      </label>
      <label className="field">
        <span>Description (optional)</span>
        <textarea name="description" maxLength={500} rows={3} placeholder="What is this chain for?" className={styles.plain} />
        {errors.description && <small className={ui.fieldError}>{errors.description}</small>}
      </label>
      <fieldset className={styles.start}>
        <legend>Start with</legend>
        <label>
          <input type="radio" name="start" value="example" defaultChecked />
          <span>
            <strong>The 3-step example</strong>
            <small>Describe the image → find the funny → write 5 captions</small>
          </span>
        </label>
        <label>
          <input type="radio" name="start" value="empty" />
          <span>
            <strong>No steps</strong>
            <small>Add your own steps after creating it</small>
          </span>
        </label>
      </fieldset>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create chain"}
      </button>
      {state.message && (
        <p className={ui.error} role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
