import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

type NavLink = { href: string; label: string; external?: boolean };

const PRIMARY_LINKS: NavLink[] = [
  { href: "/install", label: "Install" },
  { href: "/pricing", label: "Pricing" },
  { href: "https://github.com/janfaris/trail", label: "GitHub", external: true },
];

function linkClass(href: string, currentPath?: string) {
  const active = currentPath && href === currentPath;
  return `${active ? "text-zinc-100" : "text-zinc-400"} hover:text-zinc-100 transition-colors`;
}

export async function SiteNav({ currentPath }: { currentPath?: string }) {
  let handle: string | null = null;

  if (process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET) {
    const [{ headers }, { eq }, { auth }, { db, schema }] = await Promise.all([
      import("next/headers"),
      import("drizzle-orm"),
      import("@/lib/auth"),
      import("@/db/client"),
    ]);
    // BetterAuth can throw on preview branches with non-trusted origins.
    // Treat any throw or null session as anonymous so the marketing nav
    // still renders.
    let sessionInfo: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
    try {
      sessionInfo = await auth.api.getSession({ headers: await headers() });
    } catch {
      sessionInfo = null;
    }
    const userRow = sessionInfo?.user
      ? await db.query.user.findFirst({ where: eq(schema.user.id, sessionInfo.user.id) })
      : null;
    handle = userRow?.handle ?? null;
  }

  const costActive = Boolean(currentPath && currentPath.startsWith("/dashboard/cost"));

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-zinc-950/70 border-b border-zinc-900/80">
      <div className="mx-auto max-w-6xl px-6 lg:px-10 h-14 flex items-center justify-between">
        <Link href="/" className="font-mono text-[14px] font-medium tracking-tight">
          <span className="text-[#a7f300]">/</span>trail
        </Link>
        <nav className="flex items-center gap-5 text-[13px]">
          <div className="hidden md:flex items-center gap-5">
            {PRIMARY_LINKS.map((l) =>
              l.external ? (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noopener"
                  className={linkClass(l.href, currentPath)}
                >
                  {l.label}
                </a>
              ) : (
                <Link key={l.href} href={l.href} className={linkClass(l.href, currentPath)}>
                  {l.label}
                </Link>
              ),
            )}
          </div>
          {handle ? (
            <div className="flex items-center gap-3 sm:gap-5">
              <Link
                href="/dashboard/cost"
                aria-current={costActive ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 ${
                  costActive ? "text-[#a7f300]" : "text-zinc-300 hover:text-[#a7f300]"
                } transition-colors`}
              >
                <span className="text-[#a7f300]">$</span>
                <span>Cost</span>
              </Link>
              <Link href="/feed" className={linkClass("/feed", currentPath)}>
                Feed
              </Link>
              <Link href="/dashboard" className={linkClass("/dashboard", currentPath)}>
                Dashboard
              </Link>
              <Link href="/settings" className={linkClass("/settings", currentPath)}>
                Settings
              </Link>
              <Link
                href={`/u/${handle}`}
                className="font-mono text-zinc-300 hover:text-[#a7f300] transition-colors"
              >
                @{handle}
              </Link>
              <SignOutButton />
            </div>
          ) : (
            <a
              href="/api/auth/sign-in/github?callbackURL=/dashboard/cost"
              className="inline-flex items-center h-8 px-3 rounded-md text-[12.5px] font-medium bg-[#a7f300] text-zinc-950 hover:bg-[#b9ff1f] transition-colors"
            >
              Sign in
            </a>
          )}
        </nav>
      </div>
    </header>
  );
}

export default SiteNav;
