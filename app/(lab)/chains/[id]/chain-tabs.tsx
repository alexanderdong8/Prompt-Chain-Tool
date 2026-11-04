"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ui from "../../ui.module.css";

export function ChainTabs({ id, steps, runs }: { id: string; steps: number; runs: number }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/chains/${id}`, label: "Steps", count: steps },
    { href: `/chains/${id}/media`, label: "Media", count: runs },
  ];
  return (
    <nav className={ui.tabs} aria-label="Chain">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} className={ui.tab} aria-current={pathname === t.href ? "page" : undefined}>
          {t.label} <span className={ui.count}>{t.count}</span>
        </Link>
      ))}
    </nav>
  );
}
