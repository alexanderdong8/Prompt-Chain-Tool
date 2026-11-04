import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import type { StepOutput } from "@/lib/chain-lab";
import { NewChainForm } from "./new-chain-form";
import styles from "./chains.module.css";
import ui from "./ui.module.css";

export const metadata: Metadata = { title: "Prompt chains" };

type ChainRow = {
  id: string;
  name: string;
  description: string;
  steps: { position: number; name: string; output: StepOutput }[];
  runs: { count: number }[];
  recent: { id: string; image_url: string | null }[];
};

export default async function ChainsPage(props: PageProps<"/">) {
  const [{ supabase }, searchParams] = await Promise.all([requireAdmin(), props.searchParams]);
  const { data, error } = await supabase
    .from("chain_lab_chains")
    .select(
      "id, name, description, steps:chain_lab_steps(position, name, output), runs:chain_lab_runs(count), recent:chain_lab_runs(id, image_url)",
    )
    .order("updated_at", { ascending: false })
    .order("position", { referencedTable: "steps" })
    .order("created_at", { referencedTable: "recent", ascending: false })
    .eq("recent.status", "succeeded")
    .limit(4, { referencedTable: "recent" })
    .returns<ChainRow[]>();
  const chains = data ?? [];

  return (
    <>
      {searchParams.deleted === "1" && (
        <p className={ui.notice} role="status">
          Chain deleted.
        </p>
      )}
      <header className={ui.head}>
        <div>
          <h1 className={ui.title}>Prompt chains</h1>
          <p className={ui.lede}>Each step is one model call; its output feeds the next step.</p>
        </div>
        <NewChainForm />
      </header>

      {error ? (
        <p className={ui.error} role="alert">
          Couldn&apos;t load chains: {error.message}
        </p>
      ) : chains.length === 0 ? (
        <div className={ui.empty}>
          <strong>No chains yet.</strong>
          <p>Create one to get started.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {chains.map((chain) => {
            const runs = chain.runs[0]?.count ?? 0;
            return (
              <li key={chain.id}>
                <Link href={`/chains/${chain.id}`} className={`${ui.card} ${styles.chain}`}>
                  <span className={styles.chainHead}>
                    <span className={styles.chainName}>{chain.name}</span>
                    <span className={styles.chainMeta}>
                      {chain.steps.length} {chain.steps.length === 1 ? "step" : "steps"} · {runs}{" "}
                      {runs === 1 ? "run" : "runs"}
                    </span>
                  </span>
                  {chain.description && <span className={styles.chainDesc}>{chain.description}</span>}
                  {chain.steps.length > 0 && (
                    <ol className={styles.flow} aria-label="Steps">
                      {chain.steps.map((s) => (
                        <li key={s.position} data-captions={s.output === "captions" || undefined}>
                          <span className={styles.flowNum}>{s.position}</span>
                          <span className={styles.flowName}>{s.name}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {chain.recent.length > 0 && (
                    <span className={styles.thumbs} aria-label="Recent media">
                      {chain.recent.map(
                        (r) =>
                          r.image_url && (
                            <span key={r.id} className={styles.thumb}>
                              <Image src={r.image_url} alt="" fill sizes="40px" />
                            </span>
                          ),
                      )}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
