"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { deleteChain, updateChain, type FormState } from "../../actions";
import ui from "../../ui.module.css";
import styles from "./chain.module.css";

type Props = { chain: { id: string; name: string; description: string } };

/** The chain's name and description, editable in place, plus delete (with a confirmation). */
export function ChainHeader({ chain }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [state, action, saving] = useActionState<FormState, FormData>(updateChain.bind(null, chain.id), {});
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const errors = state.errors ?? {};

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  if (editing) {
    return (
      <form action={action} className={`${ui.card} ${styles.editHead}`} noValidate>
        <label className="field">
          <span>Chain name</span>
          <input name="name" defaultValue={chain.name} maxLength={80} required autoFocus aria-invalid={Boolean(errors.name)} />
          {errors.name && <small className={ui.fieldError}>{errors.name}</small>}
        </label>
        <label className="field">
          <span>Description</span>
          <textarea name="description" defaultValue={chain.description} maxLength={500} rows={3} className={styles.plain} />
          {errors.description && <small className={ui.fieldError}>{errors.description}</small>}
        </label>
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
    );
  }

  return (
    <header className={styles.head}>
      <div className={styles.headText}>
        <p className={ui.kicker}>Prompt chain</p>
        <h1 className={ui.title}>{chain.name}</h1>
        {chain.description ? <p className={ui.lede}>{chain.description}</p> : null}
      </div>
      <div className={styles.headActions}>
        {!confirming && (
          <>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
              Rename / describe
            </button>
            <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirming(true)}>
              Delete chain
            </button>
          </>
        )}
        {state.ok && state.message && !confirming && (
          <span className={ui.success} role="status">
            {state.message}
          </span>
        )}
      </div>
      {confirming && (
        <div className={`${ui.confirm} ${styles.headConfirm}`} role="alertdialog" aria-label="Delete this chain?">
          <p>
            <strong>Delete “{chain.name}”?</strong> Its steps and all the media it generated are deleted too. This
            can&apos;t be undone.
          </p>
          <div className={ui.actions}>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={deleting}
              onClick={() =>
                startDelete(async () => {
                  const r = await deleteChain(chain.id);
                  if (r && !r.ok) setDeleteError(r.message ?? "Couldn't delete.");
                })
              }
            >
              {deleting ? "Deleting…" : "Yes, delete it"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)} disabled={deleting}>
              Keep it
            </button>
          </div>
          {deleteError && <p className={ui.error}>{deleteError}</p>}
        </div>
      )}
    </header>
  );
}
