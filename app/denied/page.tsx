import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import styles from "../gate.module.css";

export const metadata: Metadata = { title: "No access" };

/** Signed in, but profiles.is_superadmin isn't true. */
export default async function DeniedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className={styles.gate}>
      <section className={styles.card}>
        <p className={styles.brand}>
          <Logo /> Chain Lab
        </p>
        <h1 className={styles.title}>Superadmins only.</h1>
        <p className={styles.lede}>
          <strong>{user.email}</strong> isn&apos;t a superadmin.
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn-primary">
            Switch accounts
          </button>
        </form>
      </section>
    </main>
  );
}
