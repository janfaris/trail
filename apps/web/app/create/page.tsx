import { BuildPostForm } from "@/app/create/build-post-form";
import SiteNav from "@/components/site-nav";
import Link from "next/link";

export default async function CreatePage() {
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
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-6 text-sm text-zinc-500">
            <div className="border-t border-white/10 pt-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-600">
                Trail loop
              </div>
              <div className="mt-3 space-y-3 leading-6">
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
            <BuildPostForm />
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
    <div className="border-y border-white/10 bg-zinc-950 px-5 py-12 sm:px-8">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
        {eyebrow}
      </div>
      <h1 className="mt-3 max-w-xl text-3xl font-semibold tracking-[-0.05em] text-zinc-50 sm:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-500">{body}</p>
      <Link
        href={actionHref}
        className="mt-8 inline-flex min-h-11 items-center rounded-full bg-zinc-100 px-5 text-sm font-semibold text-zinc-950 transition-[background-color,transform] hover:bg-white active:scale-[0.98]"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
