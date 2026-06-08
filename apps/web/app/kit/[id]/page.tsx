export const dynamic = "force-dynamic";

import { SiteNav } from "@/components/site-nav";
import { StealKit } from "@/components/steal-kit";
import { Avatar } from "@/components/ui/avatar";
import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { renderKitMarkdown } from "@/lib/kit-matchers";
import type { KitRuleFile, KitStackManifest, Reproducibility } from "@/lib/kit-types";
import { githubAvatar } from "@/lib/share";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

type KitRow = {
  id: string;
  userId: string;
  sessionId: string | null;
  sourceRepo: string;
  sourceCommitSha: string | null;
  title: string;
  summary: string | null;
  rulesFiles: KitRuleFile[];
  stackManifest: KitStackManifest | null;
  orderedPrompts: string[];
  reproducibility: string;
  reuseCount: number;
  visibility: string;
  authorName: string | null;
  authorHandle: string | null;
  authorImage: string | null;
  authorGithub: string | null;
};

// Defensive load: if the build_kit table hasn't been pushed yet (db:push), this
// returns null instead of throwing so the route 404s cleanly rather than 500ing.
async function loadKit(id: string): Promise<KitRow | null> {
  try {
    const [row] = await db
      .select({
        id: schema.buildKit.id,
        userId: schema.buildKit.userId,
        sessionId: schema.buildKit.sessionId,
        sourceRepo: schema.buildKit.sourceRepo,
        sourceCommitSha: schema.buildKit.sourceCommitSha,
        title: schema.buildKit.title,
        summary: schema.buildKit.summary,
        rulesFiles: schema.buildKit.rulesFiles,
        stackManifest: schema.buildKit.stackManifest,
        orderedPrompts: schema.buildKit.orderedPrompts,
        reproducibility: schema.buildKit.reproducibility,
        reuseCount: schema.buildKit.reuseCount,
        visibility: schema.buildKit.visibility,
        authorName: schema.user.name,
        authorHandle: schema.user.handle,
        authorImage: schema.user.image,
        authorGithub: schema.user.githubHandle,
      })
      .from(schema.buildKit)
      .innerJoin(schema.user, eq(schema.buildKit.userId, schema.user.id))
      .where(eq(schema.buildKit.id, id))
      .limit(1);
    return row ?? null;
  } catch (err) {
    console.error("loadKit failed (build_kit table may not be migrated)", err);
    return null;
  }
}

function reproLabel(value: string): { label: string; cls: string } {
  if (value === "verified") return { label: "Verified setup", cls: "text-[var(--accent-text)]" };
  if (value === "partial") return { label: "Repo-derived setup", cls: "text-sky-200" };
  return { label: "Prompts only", cls: "text-zinc-400" };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const kit = await loadKit(id);
  if (!kit) return {};
  return {
    title: `${kit.title} — Build Kit on Trail`,
    description: kit.summary ?? `Reproducible setup from ${kit.sourceRepo}.`,
  };
}

export default async function KitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const kit = await loadKit(id);
  if (!kit) return notFound();

  const h = await headers();
  let viewer: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    viewer = await auth.api.getSession({ headers: h });
  } catch {
    viewer = null;
  }
  const signedIn = Boolean(viewer?.user?.id);
  const isOwner = viewer?.user?.id === kit.userId;

  // Non-public kits are visible only to their owner.
  if (kit.visibility !== "public" && !isOwner) return notFound();

  const repro = reproLabel(kit.reproducibility);
  const stack = kit.stackManifest;
  const rules = kit.rulesFiles ?? [];
  const prompts = kit.orderedPrompts ?? [];
  const firstPrompt = prompts[0] ?? "";
  const markdown = renderKitMarkdown({
    title: kit.title,
    sourceRepo: kit.sourceRepo,
    reproducibility: kit.reproducibility as Reproducibility,
    stack,
    rules,
    prompts,
  });
  const rulesText = rules.map((r) => `# ${r.path}\n\n${r.body}`).join("\n\n");
  const authorName =
    kit.authorName?.trim() || (kit.authorHandle ? `@${kit.authorHandle}` : "Builder");
  const authorAvatar = kit.authorImage ?? githubAvatar(kit.authorGithub || kit.authorHandle || "");
  const signInHref = `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(`/kit/${id}`)}`;

  return (
    <div className="min-h-screen bg-[var(--surface-deep)] text-zinc-50">
      <SiteNav currentPath="/feed" />
      <main className="mx-auto w-full max-w-[640px] px-0 sm:px-4">
        <article className="min-h-[calc(100vh-3.5rem)] border-white/[0.08] bg-[var(--surface-deep)] sm:border-x">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
            <Link
              href="/create/kit"
              className="inline-flex items-center gap-2 text-[14px] font-medium text-zinc-300 hover:text-zinc-100"
            >
              <span aria-hidden className="text-zinc-500">
                ←
              </span>
              Build Kit
            </Link>
            <span className={`font-mono text-[11px] tabular-nums ${repro.cls}`}>{repro.label}</span>
          </div>

          <div className="border-b border-white/[0.08] px-4 py-5 sm:px-5">
            <div className="flex items-center gap-3">
              {kit.authorHandle ? (
                <Link
                  href={`/u/${kit.authorHandle}`}
                  className="group inline-flex items-center gap-3"
                >
                  <Avatar src={authorAvatar} alt={authorName} size={40} fallback={authorName} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-zinc-100">
                      {authorName}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-zinc-500">
                      @{kit.authorHandle}
                    </span>
                  </span>
                </Link>
              ) : (
                <span className="text-[14px] font-semibold text-zinc-100">{authorName}</span>
              )}
            </div>

            <h1 className="mt-4 text-[24px] font-semibold leading-tight tracking-[-0.03em] text-zinc-50">
              {kit.title}
            </h1>
            {kit.summary ? (
              <p className="mt-2 text-[14px] leading-6 text-zinc-400">{kit.summary}</p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-zinc-600">
              <a
                href={`https://github.com/${kit.sourceRepo}`}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-zinc-400 hover:text-[var(--accent-text)]"
              >
                {kit.sourceRepo}
              </a>
              {stack?.frameworks?.length ? (
                <>
                  <span className="text-zinc-700">·</span>
                  <span>{stack.frameworks.join(" · ")}</span>
                </>
              ) : null}
              {stack?.packageManager ? (
                <>
                  <span className="text-zinc-700">·</span>
                  <span>{stack.packageManager}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="border-b border-white/[0.08] px-4 py-5 sm:px-5">
            <StealKit
              kitId={kit.id}
              sourceRepo={kit.sourceRepo}
              markdown={markdown}
              rulesText={rulesText}
              firstPrompt={firstPrompt}
              signedIn={signedIn}
              signInHref={signInHref}
              initialReuseCount={kit.reuseCount}
            />
          </div>

          {rules.length > 0 ? (
            <section className="border-b border-white/[0.08] px-4 py-5 sm:px-5">
              <h2 className="text-[13px] font-medium text-zinc-300">
                Rules &amp; config ({rules.length})
              </h2>
              <div className="mt-3 space-y-3">
                {rules.map((rule) => (
                  <details key={rule.path} className="group rounded-xl border border-white/[0.08]">
                    <summary className="cursor-pointer list-none px-3 py-2 font-mono text-[12px] text-zinc-400 hover:text-zinc-100">
                      <span
                        className="inline-block transition-transform group-open:rotate-90"
                        aria-hidden
                      >
                        ›
                      </span>{" "}
                      {rule.path}
                    </summary>
                    <pre className="overflow-x-auto border-t border-white/[0.08] px-3 py-3 text-[12px] leading-5 text-zinc-300">
                      {rule.body}
                    </pre>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          {prompts.length > 0 ? (
            <section className="px-4 py-5 sm:px-5">
              <h2 className="text-[13px] font-medium text-zinc-300">Prompts</h2>
              <ol className="mt-3 space-y-2">
                {prompts.map((p, i) => (
                  <li
                    key={`${i}-${p.slice(0, 12)}`}
                    className="whitespace-pre-wrap rounded-xl border border-white/[0.08] px-3 py-2 text-[13px] leading-5 text-zinc-300"
                  >
                    <span className="mr-2 font-mono text-[11px] text-zinc-600">{i + 1}</span>
                    {p}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </article>
      </main>
    </div>
  );
}
