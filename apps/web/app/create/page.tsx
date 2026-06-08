import { BuildPostForm } from "@/app/create/build-post-form";
import { QuoteRepostIcon, QuotedPickEmbed } from "@/app/create/quoted-pick-embed";
import SiteNav from "@/components/site-nav";
import { parseXPostUrl } from "@/lib/x-url";
import Link from "next/link";
import { redirect } from "next/navigation";

type CreateSearchParams = {
  community?: string | string[];
  prompt?: string | string[];
  source?: string | string[];
  url?: string | string[];
  radarId?: string | string[];
};

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function signInHref(callbackURL: string): string {
  return `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(callbackURL)}`;
}

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<CreateSearchParams>;
}) {
  const sp = await searchParams;
  const community = getSingleSearchParam(sp.community);
  const prompt = getSingleSearchParam(sp.prompt);
  const source = getSingleSearchParam(sp.source);
  const url = getSingleSearchParam(sp.url);
  const radarId = getSingleSearchParam(sp.radarId);
  const defaultCommunity = community === "puerto-rico" ? "puerto-rico" : "";
  const defaultQuestion = prompt ? prompt.slice(0, 260) : "";
  const parsedXUrl = source === "x" ? parseXPostUrl(url) : null;
  const defaultXUrl = parsedXUrl?.normalizedUrl ?? "";
  const callbackParams = new URLSearchParams();
  if (radarId) callbackParams.set("radarId", radarId);
  if (defaultCommunity) callbackParams.set("community", defaultCommunity);
  if (defaultQuestion) callbackParams.set("prompt", defaultQuestion);
  if (defaultXUrl) {
    callbackParams.set("source", "x");
    callbackParams.set("url", defaultXUrl);
  }
  const callbackQuery = callbackParams.toString();
  const createCallbackPath = callbackQuery ? `/create?${callbackQuery}` : "/create";
  const [{ headers }, { eq }, { auth }, { db, schema }] = await Promise.all([
    import("next/headers"),
    import("drizzle-orm"),
    import("@/lib/auth"),
    import("@/db/client"),
  ]);
  const session = await auth.api.getSession({ headers: await headers() });
  const viewer = session?.user?.id
    ? await db.query.user.findFirst({
        where: eq(schema.user.id, session.user.id),
        columns: { id: true, handle: true },
      })
    : null;

  // Load the curated Trail Pick so builders see the post they're responding to
  // as quoted context. Public feed content, so we resolve it for signed-out
  // visitors too — the sign-in wall shows what they're about to quote.
  const quotedPick = radarId
    ? ((await db.query.radarSignal.findFirst({
        where: eq(schema.radarSignal.id, radarId),
        columns: { sourceHandle: true, sourceName: true, text: true, url: true, status: true },
      })) ?? null)
    : null;
  const quotedPickContext =
    quotedPick && quotedPick.status !== "dismissed"
      ? {
          author: quotedPick.sourceName?.trim() || `@${quotedPick.sourceHandle}`,
          handle: quotedPick.sourceHandle,
          text: quotedPick.text,
          url: quotedPick.url,
        }
      : null;

  // A signed-in builder without a handle can't post — route them through the
  // onboarding first-run, then back here, instead of a dead-end settings gate.
  if (session?.user && !viewer?.handle) {
    redirect(`/welcome?next=${encodeURIComponent(createCallbackPath)}`);
  }

  return (
    <main className="min-h-screen overflow-x-clip bg-zinc-950 text-zinc-50">
      <SiteNav currentPath="/create" />
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--trail-green)]">
              Create
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Post what shipped with enough proof and context that another builder can trust it,
              learn from it, and reply.
            </p>
            {session?.user ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/import"
                  className="inline-flex min-h-9 items-center rounded-full bg-white/[0.05] px-3.5 text-xs font-medium text-zinc-200 transition-[background-color,color,transform] hover:bg-white/[0.09] hover:text-zinc-50 active:translate-y-px"
                >
                  Bulk import from your GitHub →
                </Link>
                <Link
                  href="/create/kit"
                  className="inline-flex min-h-9 items-center rounded-full bg-[var(--accent)]/10 px-3.5 text-xs font-medium text-[var(--accent-text)] transition-[background-color,transform] hover:bg-[var(--accent)]/20 active:translate-y-px"
                >
                  Build a Kit from a repo →
                </Link>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
            <span className="rounded-full px-3 py-1.5 shadow-[var(--trail-shadow-border)]">
              No install
            </span>
            <span className="rounded-full px-3 py-1.5 shadow-[var(--trail-shadow-border)]">
              GitHub / X / demo proof
            </span>
            <span className="rounded-full px-3 py-1.5 shadow-[var(--trail-shadow-border)]">
              Public profile post
            </span>
          </div>
        </div>

        <section>
          {!session?.user ? (
            <div className="space-y-4">
              {quotedPickContext ? (
                <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.035] p-4 sm:p-5">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--trail-green)]">
                    <QuoteRepostIcon className="h-3 w-3" />
                    Quoting
                  </div>
                  <p className="mt-2 mb-3 text-sm leading-6 text-zinc-400">
                    Sign in to quote this into your own Trail post — under your name, with your
                    receipts. The external author stays external.
                  </p>
                  <QuotedPickEmbed pick={quotedPickContext} />
                </div>
              ) : null}
              <GateCard
                eyebrow="Create"
                title={quotedPickContext ? "Sign in to quote this." : "Sign in to post a build."}
                body="Trail uses GitHub identity so builders know who shipped the work."
                actionHref={signInHref(createCallbackPath)}
                actionLabel="Sign in with GitHub"
              />
            </div>
          ) : (
            <BuildPostForm
              defaultCommunity={defaultCommunity}
              defaultQuestion={defaultQuestion}
              defaultXUrl={defaultXUrl}
              quotedPick={quotedPickContext}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function GateCard({
  eyebrow,
  title,
  body,
  actionHref,
  actionLabel,
}: {
  eyebrow: string;
  title: string;
  body: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div className="grid overflow-hidden rounded-[2rem] border border-white/10 bg-zinc-950 text-zinc-50 shadow-[var(--trail-shadow-border)] lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="px-5 py-10 sm:px-8 sm:py-12">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--trail-green)]">
          {eyebrow}
        </div>
        <h1 className="mt-3 max-w-xl font-display text-4xl leading-[0.95] tracking-[-0.06em] text-zinc-50 sm:text-6xl">
          {title}
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">{body}</p>
        <Link
          href={actionHref}
          className="mt-8 inline-flex min-h-11 items-center rounded-full bg-[var(--trail-green)] px-5 text-sm font-semibold text-black transition-[filter,transform] hover:brightness-110 active:translate-y-px"
        >
          {actionLabel}
        </Link>
      </div>
      <div className="border-t border-white/10 bg-black/35 px-5 py-6 text-zinc-50 sm:px-8 lg:border-l lg:border-t-0 lg:px-6 lg:py-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--trail-green)]">
          Before publishing
        </div>
        <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-400">
          <p>1. Sign in with the identity other builders already trust.</p>
          <p>2. Write the outcome in plain language.</p>
          <p>3. Add a proof link, or write a public proof note if the link is private.</p>
        </div>
      </div>
    </div>
  );
}
