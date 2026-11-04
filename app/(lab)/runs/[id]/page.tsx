import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { RUN_COLUMNS, RUN_STEP_COLUMNS, type Run, type RunStep } from "@/lib/chain-lab";
import { DeleteRun } from "./delete-run";
import ui from "../../ui.module.css";
import styles from "../../media.module.css";

export const metadata: Metadata = { title: "Run" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One run: the media it made, and each step's output (with the prompt it sent). */
export default async function RunPage(props: PageProps<"/runs/[id]">) {
  const [{ id }, { supabase }] = await Promise.all([props.params, requireAdmin()]);
  if (!UUID.test(id)) notFound();
  const [{ data: run }, { data: steps }] = await Promise.all([
    supabase.from("chain_lab_runs").select(RUN_COLUMNS).eq("id", id).maybeSingle<Run>(),
    supabase.from("chain_lab_run_steps").select(RUN_STEP_COLUMNS).eq("run_id", id).order("position").returns<RunStep[]>(),
  ]);
  if (!run) notFound();
  const when = new Date(run.created_at).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <>
      <Link href={`/chains/${run.chain_id}/media`} className={ui.back}>
        ← {run.chain_name}
      </Link>
      <header className={ui.head}>
        <div>
          <h1 className={ui.title}>Run</h1>
          <p className={ui.lede}>
            {when}
            {run.status === "failed" ? " · failed" : run.status === "running" ? " · unfinished" : ""}
          </p>
        </div>
        <DeleteRun runId={run.id} />
      </header>

      <div className={styles.run}>
        <div className={styles.runMedia}>
          {run.image_url && (
            <div className={styles.runPhoto}>
              <Image src={run.image_url} alt="The run's input image" fill sizes="(max-width: 860px) 100vw, 360px" priority />
            </div>
          )}
          {run.captions.length > 0 && (
            <ol className={styles.captionList}>
              {run.captions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ol>
          )}
          {run.error && <p className={ui.error}>{run.error}</p>}
        </div>

        <ol className={styles.timeline} aria-label="Steps">
          {(steps ?? []).map((s) => (
            <li key={s.id} className={`${ui.card} ${styles.tStep}`}>
              <div className={styles.tHead}>
                <span className={styles.tNum}>{s.position}</span>
                <span className={styles.tName}>{s.name}</span>
                <span className={styles.tMeta}>
                  {s.model ?? (s.status === "pending" ? "didn't run" : "")}
                  {s.latency_ms ? ` · ${(s.latency_ms / 1000).toFixed(1)}s` : ""}
                </span>
              </div>
              {s.result && <p className={styles.output}>{s.result}</p>}
              {s.error && <p className={ui.error}>{s.error}</p>}
              {s.prompt && (
                <details className={styles.prompt}>
                  <summary>Prompt</summary>
                  <pre className={styles.pre}>{s.prompt}</pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
