import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { INPUTS, RUN_COLUMNS, RUN_STEP_COLUMNS, timeAgo, type Run, type RunStep } from "@/lib/chain-lab";
import { DeleteRun } from "./delete-run";
import ui from "../../ui.module.css";
import styles from "../../media.module.css";

export const metadata: Metadata = { title: "Run" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TONE = { succeeded: "good", failed: "danger", running: "warn", pending: undefined } as const;

/** One run: the media it made, and every step's exact prompt, model, and output. */
export default async function RunPage(props: PageProps<"/runs/[id]">) {
  const [{ id }, { supabase }] = await Promise.all([props.params, requireAdmin()]);
  if (!UUID.test(id)) notFound();
  const [{ data: run }, { data: steps }] = await Promise.all([
    supabase.from("chain_lab_runs").select(RUN_COLUMNS).eq("id", id).maybeSingle<Run>(),
    supabase.from("chain_lab_run_steps").select(RUN_STEP_COLUMNS).eq("run_id", id).order("position").returns<RunStep[]>(),
  ]);
  if (!run) notFound();
  const totalMs = (steps ?? []).reduce((sum, s) => sum + (s.latency_ms ?? 0), 0);

  return (
    <>
      <Link href={`/chains/${run.chain_id}/media`} className={ui.back}>
        ← {run.chain_name}: all media
      </Link>
      <header className={ui.head}>
        <div>
          <p className={ui.kicker}>Run · {timeAgo(run.created_at)}</p>
          <h1 className={ui.title}>{run.chain_name}</h1>
        </div>
        <div className={ui.actions}>
          <Link href={`/chains/${run.chain_id}`} className="btn btn-sm">
            Edit chain / run again
          </Link>
          <DeleteRun runId={run.id} />
        </div>
      </header>

      <div className={styles.run}>
        <div className={styles.runMedia}>
          {run.image_url && (
            <div className={styles.runPhoto}>
              <Image src={run.image_url} alt="The run's input image" fill sizes="(max-width: 860px) 100vw, 380px" priority />
            </div>
          )}
          {run.captions.length > 0 ? (
            <ol className={styles.captionList}>
              {run.captions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ol>
          ) : run.final_output ? (
            <pre className={`${styles.pre} ${styles.output}`}>{run.final_output}</pre>
          ) : null}
          <dl className={styles.facts}>
            <dt>Status</dt>
            <dd>
              <span className={ui.badge} data-tone={TONE[run.status]}>
                {run.status}
              </span>
            </dd>
            {run.error && (
              <>
                <dt>Error</dt>
                <dd>{run.error}</dd>
              </>
            )}
            <dt>Started</dt>
            <dd>{new Date(run.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })} ET</dd>
            <dt>Model time</dt>
            <dd>{(totalMs / 1000).toFixed(1)}s</dd>
            {run.input_text && (
              <>
                <dt>Starting text</dt>
                <dd>{run.input_text}</dd>
              </>
            )}
          </dl>
        </div>

        <section aria-labelledby="timeline-title">
          <h2 id="timeline-title" className={ui.sectionTitle} style={{ marginBottom: "0.8rem" }}>
            Step by step
          </h2>
          <ol className={styles.timeline}>
            {(steps ?? []).map((s) => (
              <li key={s.id} className={`${ui.card} ${styles.tStep}`}>
                <div className={styles.tHead}>
                  <span className={styles.tNum}>{s.position}</span>
                  <span className={styles.tName}>{s.name}</span>
                  <span className={ui.badge} data-tone={TONE[s.status]}>
                    {s.status}
                  </span>
                  <span className={ui.badge} data-tone="wire">
                    In: {INPUTS[s.input].label}
                  </span>
                  <span className={styles.tMeta}>
                    {s.model ?? ""}
                    {s.latency_ms ? ` · ${(s.latency_ms / 1000).toFixed(1)}s` : ""}
                  </span>
                </div>
                {s.prompt && (
                  <details className={styles.prompt}>
                    <summary>Prompt sent{s.input !== "previous" ? " (with the image)" : ""}</summary>
                    <pre className={styles.pre}>{s.prompt}</pre>
                  </details>
                )}
                {s.result && (
                  <div>
                    <p className={styles.label}>Output</p>
                    <pre className={`${styles.pre} ${styles.output}`}>{s.result}</pre>
                  </div>
                )}
                {s.error && (
                  <p className={ui.error}>
                    {s.error}
                  </p>
                )}
                {s.status === "pending" && <p className={styles.label}>Didn&apos;t run.</p>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
