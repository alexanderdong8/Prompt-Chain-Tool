import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { ChainHeader } from "./chain-header";
import { ChainTabs } from "./chain-tabs";
import ui from "../../ui.module.css";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ChainLayout(props: LayoutProps<"/chains/[id]">) {
  const [{ id }, { supabase }] = await Promise.all([props.params, requireAdmin()]);
  if (!UUID.test(id)) notFound();

  const { data: chain } = await supabase
    .from("chain_lab_chains")
    .select("id, name, description, steps:chain_lab_steps(count), runs:chain_lab_runs(count)")
    .eq("id", id)
    .maybeSingle<{ id: string; name: string; description: string; steps: { count: number }[]; runs: { count: number }[] }>();
  if (!chain) notFound();

  return (
    <>
      <Link href="/" className={ui.back}>
        ← All chains
      </Link>
      <ChainHeader chain={{ id: chain.id, name: chain.name, description: chain.description }} />
      <ChainTabs id={chain.id} steps={chain.steps[0]?.count ?? 0} runs={chain.runs[0]?.count ?? 0} />
      {props.children}
    </>
  );
}
