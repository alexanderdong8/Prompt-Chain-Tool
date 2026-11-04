import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { RUN_COLUMNS, timeAgo, type Run } from "@/lib/chain-lab";
import ui from "../../../ui.module.css";
import styles from "../../../media.module.css";

export const metadata: Metadata = { title: "Generated media" };

const STATUS = {
  succeeded: { label: "Done", tone: "good" },
  failed: { label: "Failed", tone: "danger" },
  running: { label: "Running", tone: "warn" },
} as const;

/** Everything this chain has generated, newest first. */
export default async function MediaPage(props: PageProps<"/chains/[id]/media">) {
  const [{ id }, { supabase }] = await Promise.all([props.params, requireAdmin()]);
  const { data, error } = await supabase
    .from("chain_lab_runs")
    .select(RUN_COLUMNS)
    .eq("chain_id", id)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Run[]>();
  const runs = data ?? [];

  if (error) {
    return (
      <p className={ui.error} role="alert">
        Couldn&apos;t load media: {error.message}
      </p>
    );
  }

  if (runs.length === 0) {
    return (
      <div className={ui.empty}>
        <strong>Nothing generated yet.</strong>
        <p>Run the chain on an image and the captions it writes show up here.</p>
        <Link href={`/chains/${id}`} className="btn btn-primary">
          Go run it
        </Link>
      </div>
    );
  }

  return (
    <ul className={styles.grid}>
      {runs.map((run) => {
        const status = STATUS[run.status];
        return (
          <li key={run.id}>
            <Link href={`/runs/${run.id}`} className={`${ui.card} ${styles.item}`}>
              <span className={styles.photo}>
                {run.image_url ? (
                  <Image src={run.image_url} alt="" fill sizes="(max-width: 640px) 100vw, 300px" />
                ) : (
                  <span className={styles.noPhoto}>Text only</span>
                )}
                {run.captions[0] && <span className={styles.overlay}>{run.captions[0]}</span>}
              </span>
              <span className={styles.body}>
                {run.captions.length > 1 ? (
                  <ol className={styles.more} start={2}>
                    {run.captions.slice(1, 4).map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ol>
                ) : run.captions.length === 0 ? (
                  <span className={styles.text}>{run.final_output ?? run.error ?? "No output."}</span>
                ) : null}
                <span className={styles.meta}>
                  <span className={ui.badge} data-tone={status.tone}>
                    {status.label}
                  </span>
                  {run.captions.length > 0 && <span>{run.captions.length} captions</span>}
                  <span>{timeAgo(run.created_at)}</span>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
