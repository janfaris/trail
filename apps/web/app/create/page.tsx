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
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <SiteNav currentPath="/create" />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-6 text-sm text-zinc-500">
            <div className="rounded-[1.5rem] bg-[var(--trail-paper)] p-5 text-[var(--trail-ink)] shadow-[var(--trail-shadow-border)]">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-black/45">
                Trail loop
              </div>
              <div className="mt-3 space-y-3 leading-6 text-black/65">
                <p>Post what you built.</p>
                <p>Add proof links.</p>
                <p>Get comments, follows, saves, and collaborators.</p>
              </div>
            </div>
            <div className="border-t border-white/10 pt-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-600">
                Good posts include
              </div>
              <ul className="mt-3 space-y-2 leading-6">
                <li>Outcome, not feature list.</li>
                <li>Tools and stack.</li>
                <li>GitHub, demo, or X proof.</li>
                <li>A question for the community.</li>
              </ul>
            </div>
          </div>
        </aside>

        <section>
          {!session?.user ? (
            <GateCard
              eyebrow="Create"
              title="Sign in to post a build."
              body="Trail uses GitHub identity so builders know who shipped the work."
              actionHref="/api/auth/sign-in/github?callbackURL=%2Fcreate"
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
    <div className="overflow-hidden rounded-[2rem] bg-[var(--trail-paper)] px-5 py-12 text-[var(--trail-ink)] shadow-[var(--trail-shadow-border)] sm:px-8">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-black/45">
        {eyebrow}
      </div>
      <h1 className="mt-3 max-w-xl font-display text-4xl leading-[0.95] tracking-[-0.06em] text-[var(--trail-ink)] sm:text-6xl">
        {title}
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-black/60">{body}</p>
      <Link
        href={actionHref}
        className="mt-8 inline-flex min-h-11 items-center rounded-full bg-[var(--trail-ink)] px-5 text-sm font-semibold text-zinc-50 transition-[background-color,transform] hover:bg-[var(--trail-green)] hover:text-black active:scale-[0.98]"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
