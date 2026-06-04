import { BuildPostForm } from "@/app/create/build-post-form";
import SiteNav from "@/components/site-nav";
import { parseXPostUrl } from "@/lib/x-url";
import Link from "next/link";

type CreateSearchParams = {
  community?: string | string[];
  prompt?: string | string[];
  source?: string | string[];
  url?: string | string[];
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
  const defaultCommunity = community === "puerto-rico" ? "puerto-rico" : "";
  const defaultQuestion = prompt ? prompt.slice(0, 260) : "";
  const parsedXUrl = source === "x" ? parseXPostUrl(url) : null;
  const defaultXUrl = parsedXUrl?.normalizedUrl ?? "";
  const callbackParams = new URLSearchParams();
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
            <GateCard
              eyebrow="Create"
              title="Sign in to post a build."
              body="Trail uses GitHub identity so builders know who shipped the work."
              actionHref={signInHref(createCallbackPath)}
              actionLabel="Sign in with GitHub"
            />
          ) : !viewer?.handle ? (
            <GateCard
              eyebrow="Public handle required"
              title="Finish your builder identity first."
              body="Build posts live on your public profile, so Trail needs your handle before publishing."
              actionHref="/settings"
              actionLabel="Edit profile"
            />
          ) : (
            <BuildPostForm
              defaultCommunity={defaultCommunity}
              defaultQuestion={defaultQuestion}
              defaultXUrl={defaultXUrl}
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
