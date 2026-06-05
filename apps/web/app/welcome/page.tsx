import { OnboardingClient } from "@/app/welcome/onboarding-client";
import SiteNav from "@/components/site-nav";
import { redirect } from "next/navigation";

type WelcomeSearchParams = { next?: string | string[] };

function signInHref(callbackURL: string): string {
  return `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(callbackURL)}`;
}

// Only allow a strict same-origin relative path as the post-onboarding
// destination, to avoid open redirects through the ?next param. Backslashes are
// rejected because browsers normalize "\" to "/" when resolving Location, which
// would otherwise turn "/\evil.com" into a cross-origin redirect.
function safeNext(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/create";
  }
  try {
    const resolved = new URL(raw, "https://gettrail.vercel.app");
    if (resolved.origin !== "https://gettrail.vercel.app") return "/create";
    return `${resolved.pathname}${resolved.search}`;
  } catch {
    return "/create";
  }
}

export const dynamic = "force-dynamic";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<WelcomeSearchParams>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const welcomePath = next === "/create" ? "/welcome" : `/welcome?next=${encodeURIComponent(next)}`;

  const [{ headers }, { eq }, { auth }, { db, schema }] = await Promise.all([
    import("next/headers"),
    import("drizzle-orm"),
    import("@/lib/auth"),
    import("@/db/client"),
  ]);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect(signInHref(welcomePath));

  const me = await db.query.user.findFirst({
    where: eq(schema.user.id, session.user.id),
    columns: { handle: true, name: true, onboardedAt: true },
  });

  // Already onboarded → straight to the destination. Keeps /welcome loop-free.
  if (me?.onboardedAt) redirect(next);

  return (
    <main className="min-h-screen overflow-x-clip bg-zinc-950 text-zinc-50">
      <SiteNav currentPath="/welcome" />
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 shadow-[var(--trail-shadow-border)]">
          <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),transparent_18rem)] px-5 py-8 sm:px-8">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--trail-green)]">
              Welcome to Trail
            </div>
            <h1 className="mt-3 font-display text-4xl leading-[0.95] tracking-[-0.06em] text-zinc-50 sm:text-5xl">
              Claim your builder handle.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">
              Your handle is your public home at{" "}
              <span className="font-mono text-zinc-300">gettrail.vercel.app/u/your-handle</span>.
              It's where every build you post lives. You can change it later in settings.
            </p>
          </div>
          <div className="px-5 py-6 sm:px-8 sm:py-8">
            <OnboardingClient initialHandle={me?.handle ?? ""} next={next} />
          </div>
        </div>
      </div>
    </main>
  );
}
