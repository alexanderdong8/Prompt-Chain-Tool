"use client";

import { useState, useTransition } from "react";
import { deleteRun } from "../../actions";
import ui from "../../ui.module.css";

export function DeleteRun({ runId }: { runId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirming(true)}>
        Delete run
      </button>
    );
  }
  return (
    <div className={ui.actions}>
      <span>Delete this run and its captions?</span>
      <button
        type="button"
        className="btn btn-danger btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await deleteRun(runId);
            if (r && !r.ok) setError(r.message ?? "Couldn't delete.");
          })
        }
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button type="button" className="btn btn-sm" onClick={() => setConfirming(false)} disabled={pending}>
        Cancel
      </button>
      {error && <span className={ui.error}>{error}</span>}
    </div>
  );
}
