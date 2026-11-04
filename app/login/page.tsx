import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { createClient } from "@/lib/supabase/server";
import { GoogleButton } from "./google-button";
import styles from "../gate.module.css";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");
  const { error } = await props.searchParams;

  return (
    <main className={styles.gate}>
      <section className={styles.card}>
        <p className={styles.brand}>
          <Logo /> Chain Lab
        </p>
        <h1 className={styles.title}>Build the prompt chains behind the punchlines.</h1>
        <p className={styles.lede}>
          Create multi-step prompt chains, reorder their steps, and run them on photos to generate captions.
          Superadmins only: sign in with the Google account you use on Punchline.
        </p>
        <div className={styles.chain} aria-hidden="true">
          <span>1</span>
          <i />
          <span>2</span>
          <i />
          <span>3</span>
        </div>
        <GoogleButton />
        {typeof error === "string" && (
          <p className={styles.error} role="alert">
            {error === "not_allowed"
              ? "That Google account isn't allowed to sign up for Punchline."
              : "Sign-in didn't go through. Please try again."}
          </p>
        )}
      </section>
    </main>
  );
}
