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
          <span>Name</span>
          <input name="name" defaultValue={chain.name} maxLength={80} required autoFocus aria-invalid={Boolean(errors.name)} />
          {errors.name && <small className={ui.fieldError}>{errors.name}</small>}
        </label>
        <label className="field">
          <span>Description</span>
          <input name="description" defaultValue={chain.description} maxLength={500} />
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
        <h1 className={ui.title}>{chain.name}</h1>
        {chain.description ? <p className={ui.lede}>{chain.description}</p> : null}
      </div>
      {confirming ? (
        <div className={ui.confirm} role="alertdialog" aria-label="Delete this chain?">
          <p>Delete this chain, its steps, and its media?</p>
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
              {deleting ? "Deleting…" : "Delete"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)} disabled={deleting}>
              Cancel
            </button>
          </div>
          {deleteError && <p className={ui.error}>{deleteError}</p>}
        </div>
      ) : (
        <div className={ui.actions}>
          <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      )}
    </header>
  );
}
