import Link from "next/link";
import { cookies } from "next/headers";
import { Logo } from "@/components/logo";
import { ThemeSwitch } from "@/components/theme-switch";
import { fullName, requireAdmin } from "@/lib/admin";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import styles from "./shell.module.css";

export default async function LabLayout({ children }: LayoutProps<"/">) {
  const [{ profile }, cookieStore] = await Promise.all([requireAdmin(), cookies()]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  const name = fullName(profile);

  return (
    <>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.top}>
        <div className={styles.bar}>
          <Link href="/" className={styles.brand}>
            <Logo />
            <span>Chain Lab</span>
          </Link>
          <div className={styles.right}>
            <ThemeSwitch initial={theme} />
            <span className={styles.who} title={profile.email ?? undefined}>
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" width={28} height={28} />
              ) : (
                <span className={styles.initial} aria-hidden="true">
                  {name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className={styles.whoName}>{profile.first_name ?? name}</span>
            </span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn btn-ghost btn-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
    </>
  );
}
