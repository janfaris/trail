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
            <h1 className="mt-3 font-display text-4xl leading-[0.98] tracking-[-0.06em] text-zinc-50 sm:text-5xl">
              Post what you built with AI. Get proof it mattered.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">
              Trail is a <span className="text-zinc-200">public feed for AI builders</span>. You
              share what you shipped — a feature, repo, demo, or experiment — and other builders
              react, comment, follow, and reuse it. Your profile becomes your public shipping
              record.
            </p>
          </div>

          <div className="grid gap-px bg-white/[0.06] sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Share a build",
                body: "Write what you shipped and add proof (GitHub, demo, or a note). About a minute.",
              },
              {
                step: "02",
                title: "Get signal",
                body: "Builders react, comment, and follow. Every post is public proof on your profile.",
              },
              {
                step: "03",
                title: "Reuse & discover",
                body: "Find what others shipped, save ideas, and follow people building in your stack.",
              },
            ].map((item) => (
              <div key={item.step} className="bg-zinc-950 px-5 py-5">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--trail-green)]">
                  {item.step}
                </div>
                <div className="mt-2 text-[15px] font-medium tracking-[-0.01em] text-zinc-100">
                  {item.title}
                </div>
                <p className="mt-1 text-[13px] leading-5 text-zinc-500">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 px-5 py-6 sm:px-8 sm:py-8">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              Step 1 · Claim your handle
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
              Your handle is your public home at{" "}
              <span className="font-mono text-zinc-300">gettrail.vercel.app/u/your-handle</span> —
              where every build you post lives. Public to anyone; change it anytime in settings.
            </p>
            <div className="mt-5">
              <OnboardingClient initialHandle={me?.handle ?? ""} next={next} />
            </div>
          </div>
        </div>

        <p className="mt-4 px-1 text-center text-xs leading-5 text-zinc-600">
          New here and not sure what to post? Anything you built or changed with an AI agent counts
          — ship it, then ask the thread for feedback.
        </p>
      </div>
    </main>
  );
}
