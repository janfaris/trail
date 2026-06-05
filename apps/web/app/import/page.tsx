import { ImportClient } from "@/app/import/import-client";
import SiteNav from "@/components/site-nav";
import Link from "next/link";
import { redirect } from "next/navigation";

function signInHref(callbackURL: string): string {
  return `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(callbackURL)}`;
}

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const [{ headers }, { eq }, { auth }, { db, schema }] = await Promise.all([
    import("next/headers"),
    import("drizzle-orm"),
    import("@/lib/auth"),
    import("@/db/client"),
  ]);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect(signInHref("/import"));

  const viewer = await db.query.user.findFirst({
    where: eq(schema.user.id, session.user.id),
    columns: { handle: true, githubHandle: true },
  });
  // Posting needs a public handle — route handle-less builders through onboarding.
  if (!viewer?.handle) redirect("/welcome?next=%2Fimport");

  return (
    <main className="min-h-screen overflow-x-clip bg-zinc-950 text-zinc-50">
      <SiteNav currentPath="/import" />
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 border-b border-white/10 pb-5">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--trail-green)]">
            Import
          </div>
          <h1 className="mt-2 font-display text-3xl leading-[0.98] tracking-[-0.05em] text-zinc-50 sm:text-4xl">
            Turn what you shipped into posts.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
            Pull your merged pull requests (what you actually shipped) — or backfill your profile
            from your repos. Add a line on what changed and why it matters, then publish. Each post
            links back to the PR or repo as proof. Nothing publishes automatically.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
            <Link
              href="/create"
              className="rounded-full px-3 py-1.5 shadow-[var(--trail-shadow-border)] hover:text-zinc-200"
            >
              Write one manually instead
            </Link>
          </div>
        </div>

        <ImportClient githubHandleHint={viewer.githubHandle ?? null} />
      </div>
    </main>
  );
}
