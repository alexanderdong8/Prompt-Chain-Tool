import Link from "next/link";
import { Logo } from "@/components/logo";
import styles from "./gate.module.css";

export default function NotFound() {
  return (
    <main className={styles.gate}>
      <section className={styles.card}>
        <p className={styles.brand}>
          <Logo /> Chain Lab
        </p>
        <h1 className={styles.title}>That link is broken.</h1>
        <p className={styles.lede}>The chain or run may have been deleted.</p>
        <Link href="/" className="btn btn-primary">
          Back to all chains
        </Link>
      </section>
    </main>
  );
}
