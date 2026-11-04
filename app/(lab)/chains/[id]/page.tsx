import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { getLibraryImages, getModels, needsImage, STEP_COLUMNS, type Step } from "@/lib/chain-lab";
import { AddStep } from "./add-step";
import { RunPanel } from "./run-panel";
import { StepCard } from "./step-card";
import ui from "../../ui.module.css";
import styles from "./chain.module.css";

export const metadata: Metadata = { title: "Edit chain" };

// Server actions on this page (each runs one model call) get up to a minute.
export const maxDuration = 60;

export default async function ChainPage(props: PageProps<"/chains/[id]">) {
  const [{ id }, { supabase, user }] = await Promise.all([props.params, requireAdmin()]);
  const [{ data: steps, error }, models, images] = await Promise.all([
    supabase.from("chain_lab_steps").select(STEP_COLUMNS).eq("chain_id", id).order("position").returns<Step[]>(),
    getModels(supabase),
    getLibraryImages(supabase),
  ]);
  if (error) notFound();
  const list = steps ?? [];

  return (
    <div className={styles.editor}>
      <section aria-label="Steps">
        {list.length === 0 ? (
          <div className={ui.empty}>
            <strong>No steps yet.</strong>
          </div>
        ) : (
          <ol className={styles.steps}>
            {list.map((step, i) => {
              const next = list[i + 1];
              return (
                <li key={step.id}>
                  <StepCard step={step} total={list.length} models={models} />
                  {next && (
                    <p className={styles.wire} data-unused={next.input === "image" || undefined}>
                      {next.input === "image" ? "not used by the next step" : null}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <AddStep chainId={id} total={list.length} models={models} />
      </section>

      <aside className={styles.runCol}>
        <RunPanel
          chainId={id}
          userId={user.id}
          steps={list.map((s) => ({ position: s.position, name: s.name }))}
          needsImage={needsImage(list)}
          images={images}
        />
      </aside>
    </div>
  );
}
