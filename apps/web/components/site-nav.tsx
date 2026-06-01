import { ProfileMenu } from "@/components/profile-menu";
import { SignOutButton } from "@/components/sign-out-button";
import { cn } from "@/lib/utils";
import Link from "next/link";

type NavLink = { href: string; label: string; external?: boolean };

const PRIMARY_LINKS: NavLink[] = [
  { href: "/feed", label: "Feed" },
  { href: "/tools", label: "Tools" },
  { href: "/install", label: "Install" },
  { href: "https://github.com/janfaris/trail", label: "GitHub", external: true },
];

const SIGNED_IN_LINKS: NavLink[] = [
  { href: "/feed", label: "Feed" },
  { href: "/saved", label: "Saved" },
  { href: "/tools", label: "Tools" },
  { href: "/install", label: "Install" },
  { href: "/notifications", label: "Inbox" },
  { href: "/dashboard", label: "Studio" },
];

function linkClass(href: string, currentPath?: string, className?: string) {
  const active = currentPath && href === currentPath;
  return cn(
    active ? "text-zinc-100" : "text-zinc-400",
    "hover:text-zinc-100 transition-colors",
    className,
  );
}

function NavLinkItem({
  link,
  currentPath,
  className,
  badge,
}: {
  link: NavLink;
  currentPath?: string;
  className?: string;
  badge?: string | null;
}) {
  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer noopener"
        className={linkClass(link.href, currentPath, className)}
      >
        {link.label}
      </a>
    );
  }

  return (
    <Link href={link.href} className={linkClass(link.href, currentPath, className)}>
      {link.label}
      {badge ? (
        <span className="ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-[#a7f300] px-1 text-[10px] font-semibold leading-4 text-zinc-950">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

export async function SiteNav({ currentPath }: { currentPath?: string }) {
  let handle: string | null = null;
  let name: string | null = null;
  let image: string | null = null;
  let unreadNotifications = 0;

  if (process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET) {
    const [{ headers }, { and, eq, isNull }, { auth }, { db, schema }] = await Promise.all([
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
    const userId = sessionInfo?.user?.id;
    if (userId) {
      const [userRow, unreadRows] = await Promise.all([
        db.query.user.findFirst({ where: eq(schema.user.id, userId) }),
        db
          .select({ id: schema.notification.id })
          .from(schema.notification)
          .where(and(eq(schema.notification.userId, userId), isNull(schema.notification.readAt)))
          .limit(10),
      ]);
      handle = userRow?.handle ?? null;
      name = userRow?.name ?? null;
      image = userRow?.image ?? null;
      unreadNotifications = unreadRows.length;
    }
  }

  const mobileLinks = handle ? SIGNED_IN_LINKS : PRIMARY_LINKS;
  const notificationBadge =
    unreadNotifications >= 10 ? "9+" : unreadNotifications > 0 ? String(unreadNotifications) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-900/80 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-10">
        <Link href="/" className="font-mono text-[14px] font-medium tracking-tight">
          <span className="text-[#a7f300]">/</span>trail
        </Link>
        <nav className="flex items-center gap-5 text-[13px]">
          {handle ? null : (
            <div className="hidden md:flex items-center gap-5">
              {PRIMARY_LINKS.map((link) => (
                <NavLinkItem key={link.href} link={link} currentPath={currentPath} />
              ))}
            </div>
          )}
          {handle ? (
            <div className="flex items-center gap-3 sm:gap-5">
              {SIGNED_IN_LINKS.map((link) => (
                <NavLinkItem
                  key={link.href}
                  link={link}
                  currentPath={currentPath}
                  className="hidden md:inline"
                  badge={link.href === "/notifications" ? notificationBadge : null}
                />
              ))}
              <ProfileMenu handle={handle} name={name} image={image} signOut={<SignOutButton />} />
            </div>
          ) : (
            <a
              href="/api/auth/sign-in/github?callbackURL=/feed"
              className="inline-flex items-center h-8 px-3 rounded-md text-[12.5px] font-medium bg-[#a7f300] text-zinc-950 hover:bg-[#b9ff1f] transition-colors"
            >
              Sign in
            </a>
          )}
        </nav>
      </div>
      <nav className="mx-auto flex max-w-6xl gap-2 overflow-x-auto border-t border-zinc-900/70 px-4 py-2 text-[12px] md:hidden">
        {mobileLinks.map((link) => (
          <NavLinkItem
            key={link.href}
            link={link}
            currentPath={currentPath}
            className="inline-flex min-h-8 shrink-0 items-center rounded-full bg-black/35 px-3 font-mono uppercase tracking-[0.12em] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
            badge={link.href === "/notifications" ? notificationBadge : null}
          />
        ))}
      </nav>
    </header>
  );
}

export default SiteNav;
