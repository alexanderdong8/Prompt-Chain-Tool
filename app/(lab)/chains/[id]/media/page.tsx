import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { RUN_COLUMNS, timeAgo, type Run } from "@/lib/chain-lab";
import ui from "../../../ui.module.css";
import styles from "../../../media.module.css";

export const metadata: Metadata = { title: "Media" };

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
        <Link href={`/chains/${id}`} className="btn btn-primary">
          Run the chain
        </Link>
      </div>
    );
  }

  return (
    <ul className={styles.grid}>
      {runs.map((run) => (
        <li key={run.id}>
          <Link href={`/runs/${run.id}`} className={`${ui.card} ${styles.item}`}>
            <span className={styles.photo}>
              {run.image_url ? (
                <Image src={run.image_url} alt="" fill sizes="(max-width: 640px) 100vw, 260px" />
              ) : (
                <span className={styles.noPhoto}>No image</span>
              )}
              {run.captions[0] && <span className={styles.overlay}>{run.captions[0]}</span>}
            </span>
            <span className={styles.meta}>
              {run.status === "failed" ? (
                <span className={ui.badge} data-tone="danger">
                  Failed
                </span>
              ) : run.status === "running" ? (
                <span className={ui.badge} data-tone="warn">
                  Unfinished
                </span>
              ) : (
                <span>{run.captions.length > 0 ? `${run.captions.length} captions` : "Text output"}</span>
              )}
              <span>{timeAgo(run.created_at)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
