import { CommentThread, type ReceiptComment } from "@/components/comment-thread";
import { CopyButton } from "@/components/copy-button";
import { ExplainButton } from "@/components/explain-button";
import { FileDiff } from "@/components/file-diff";
import { ForkButton } from "@/components/fork-button";
import { ForkButtons } from "@/components/fork-buttons";
import { ReactionBar } from "@/components/reaction-bar";
import { ReceiptActions } from "@/components/receipt-actions";
import { ReceiptBlock } from "@/components/receipt-block";
import { RecipeCard } from "@/components/recipe-card";
import { RelativeTime } from "@/components/relative-time";
import { SessionCostBlock, SessionCostBlockSkeleton } from "@/components/session-cost-block";
import { type EventData, TimelineEvent } from "@/components/timeline-event";
import { TimelineToggle } from "@/components/timeline-toggle";
import { ToolIcon } from "@/components/tool-icon";
import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { deriveTitle } from "@/lib/derive-title";
import { shareUrl, tweetIntent } from "@/lib/share";
import { absoluteTime, durationBetween } from "@/lib/time";
import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

function signInHref(callbackURL: string): string {
  return `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(callbackURL)}`;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ user: string; slug: string }>;
}): Promise<Metadata> {
  const { user, slug } = await params;
  const userRow = await db.query.user.findFirst({ where: eq(schema.user.handle, user) });
  if (!userRow) return {};
  const sessionRow = await db.query.trailSession.findFirst({
    where: and(
      eq(schema.trailSession.userId, userRow.id),
      eq(schema.trailSession.slug, slug),
      eq(schema.trailSession.visibility, "public"),
    ),
  });
  if (!sessionRow) return {};
  const firstPrompt = await db.query.event.findFirst({
    where: eq(schema.event.sessionId, sessionRow.id),
    orderBy: asc(schema.event.idx),
  });
  const fpText =
    firstPrompt && (firstPrompt.data as EventData).kind === "prompt"
      ? (firstPrompt.data as { kind: "prompt"; text: string }).text
      : undefined;
  const title = sessionRow.title || deriveTitle(fpText, sessionRow.slug);
  const desc =
    sessionRow.summary || `${sessionRow.tool} · ${sessionRow.eventCount} events · @${user}`;
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://gettrail.vercel.app";
  const canonical = `${base}/u/${user}/${slug}`;
  const ogImage = `${base}/api/receipt/${sessionRow.id}/image.png`;
  return {
    title: `${title} — @${user} on Trail`,
    description: desc,
    openGraph: {
      title,
      description: desc,
      type: "article",
      url: canonical,
      images: [{ url: ogImage, width: 600, height: 900 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      images: [ogImage],
    },
    alternates: {
      canonical,
      // oEmbed discovery — every consumer that supports oEmbed (X, Slack,
      // Discord, WordPress, Notion, Ghost, …) picks up the iframe via this.
      types: {
        "application/json+oembed": `${base}/api/oembed?url=${encodeURIComponent(canonical)}`,
      },
    },
  };
}

export default async function SessionView({
  params,
  searchParams,
}: {
  params: Promise<{ user: string; slug: string }>;
  searchParams: Promise<{ full?: string }>;
}) {
  const { user, slug } = await params;
  const sp = await searchParams;
  const showFull = sp.full === "1";

  const userRow = await db.query.user.findFirst({ where: eq(schema.user.handle, user) });
  if (!userRow) return notFound();

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const fullUrl = shareUrl(user, slug, `${proto}://${host}`);
  let viewer: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    viewer = await auth.api.getSession({ headers: h });
  } catch {
    viewer = null;
  }

  const sessionRow = await db.query.trailSession.findFirst({
    where: and(eq(schema.trailSession.userId, userRow.id), eq(schema.trailSession.slug, slug)),
  });
  if (!sessionRow) return notFound();

  const isOwner = viewer?.user?.id === userRow.id;
  if (sessionRow.visibility !== "public" && !isOwner) return notFound();

  const events = await db
    .select()
    .from(schema.event)
    .where(eq(schema.event.sessionId, sessionRow.id))
    .orderBy(asc(schema.event.idx));

  const canExplain = !!viewer?.user;

  // Look up an existing Pulse Recap for this session — surfaced in the
  // header actions so owners see "Open" instead of "Generate" once made.
  const existingPulseRecap = await db.query.recap.findFirst({
    where: and(eq(schema.recap.sessionId, sessionRow.id), eq(schema.recap.tier, "pulse")),
    columns: { slug: true },
  });

  const [commentRows, viewerRow] = await Promise.all([
    db
      .select({
        id: schema.sessionComment.id,
        parentId: schema.sessionComment.parentId,
        body: schema.sessionComment.body,
        createdAt: schema.sessionComment.createdAt,
        updatedAt: schema.sessionComment.updatedAt,
        deletedAt: schema.sessionComment.deletedAt,
        authorId: schema.user.id,
        authorName: schema.user.name,
        authorHandle: schema.user.handle,
        authorImage: schema.user.image,
      })
      .from(schema.sessionComment)
      .innerJoin(schema.user, eq(schema.sessionComment.userId, schema.user.id))
      .where(eq(schema.sessionComment.sessionId, sessionRow.id))
      .orderBy(asc(schema.sessionComment.createdAt), asc(schema.sessionComment.id))
      .limit(200),
    viewer?.user?.id
      ? db.query.user.findFirst({
          where: eq(schema.user.id, viewer.user.id),
          columns: { id: true, name: true, handle: true, image: true },
        })
      : Promise.resolve(null),
  ]);

  const comments: ReceiptComment[] = commentRows.map((comment) => {
    const deletedAt = comment.deletedAt ? toIso(comment.deletedAt) : null;

    return {
      id: comment.id,
      parentId: comment.parentId,
      body: deletedAt ? null : comment.body,
      createdAt: toIso(comment.createdAt),
      updatedAt: toIso(comment.updatedAt),
      deletedAt,
      author: {
        id: comment.authorId,
        name: comment.authorName,
        handle: comment.authorHandle,
        image: comment.authorImage,
      },
    };
  });

  const duration = durationBetween(sessionRow.startedAt, sessionRow.endedAt);
  const firstPrompt = events.find((e) => {
    const d = e.data as EventData;
    return d.kind === "prompt";
  });
  const firstPromptText =
    firstPrompt && (firstPrompt.data as EventData).kind === "prompt"
      ? (firstPrompt.data as { kind: "prompt"; text: string }).text
      : undefined;
  const title = sessionRow.title || deriveTitle(firstPromptText, sessionRow.slug);

  const keyPromptIdxs = sessionRow.recipeKeyPromptIdxs ?? [];
  const keyPrompts =
    keyPromptIdxs.length > 0
      ? events
          .filter(
            (e) => keyPromptIdxs.includes(e.idx) && (e.data as { kind?: string }).kind === "prompt",
          )
          .map((e) => ({
            idx: e.idx,
            text: (e.data as { text?: string }).text ?? "",
          }))
      : [];
  const highlightIdxs = sessionRow.recipeHighlightIdxs ?? [];
  const visibleEvents =
    !showFull && highlightIdxs.length > 0
      ? events.filter((e) => highlightIdxs.includes(e.idx))
      : events;

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-900 sticky top-0 bg-zinc-950/85 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/70 z-10">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-mono text-[15px] font-semibold tracking-tight">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <nav className="flex items-center gap-1 text-sm font-mono text-zinc-500">
            <Link href={`/u/${user}`} className="hover:text-zinc-100 transition-colors">
              @{user}
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="text-zinc-300">{slug}</span>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 pt-12 pb-24">
        <div className="mb-10">
          <div className="flex items-center gap-2 text-xs font-mono text-zinc-500 mb-4">
            <ToolIcon name={sessionRow.tool} className="text-zinc-400" />
            <span className="text-zinc-300">{sessionRow.tool}</span>
            {sessionRow.repo && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-zinc-400">{sessionRow.repo}</span>
              </>
            )}
            {sessionRow.linkedRepo && sessionRow.linkedCommitSha && (
              <>
                <span className="text-zinc-700">·</span>
                <a
                  href={`https://github.com/${sessionRow.linkedRepo}/commit/${sessionRow.linkedCommitSha}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#a7f300]/40 bg-[#a7f300]/10 text-[#a7f300] font-mono text-[11px] hover:bg-[#a7f300]/20 transition-colors"
                  title={`Shipped in ${sessionRow.linkedRepo}@${sessionRow.linkedCommitSha}`}
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <title>GitHub</title>
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  Shipped {sessionRow.linkedCommitSha.slice(0, 7)}
                </a>
              </>
            )}
            <span className="text-zinc-700">·</span>
            <RelativeTime date={sessionRow.startedAt} className="text-zinc-400" />
            {duration && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="text-zinc-400 tabular-nums">{duration}</span>
              </>
            )}
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-400 tabular-nums">
              {sessionRow.eventCount} event{sessionRow.eventCount === 1 ? "" : "s"}
            </span>
          </div>

          <h1 className="text-3xl md:text-[34px] font-semibold tracking-tight leading-[1.15] text-zinc-50 mb-3">
            {title}
          </h1>
          {sessionRow.summary && sessionRow.title && (
            <p className="text-zinc-400 leading-relaxed max-w-2xl">{sessionRow.summary}</p>
          )}
        </div>

        {/* Action strip */}
        <div className="flex flex-wrap items-center gap-2 mb-12 pb-6 border-b border-zinc-900">
          <CopyButton value={fullUrl} label="Copy link" copiedLabel="Copied" />
          <ForkButton user={user} slug={slug} title={sessionRow.title ?? slug} />
          <a
            href={tweetIntent(`${title} — a trail by @${user}`, fullUrl)}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-zinc-800 bg-zinc-900/50 text-xs font-mono text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              <title>X</title>
              <path d="M12.6 1.5h2.3L9.85 7.27 15.7 14.5h-4.66l-3.65-4.77L3.2 14.5H.88l5.4-6.17L.66 1.5h4.78l3.3 4.36zm-.81 11.6h1.27L4.27 2.82H2.9z" />
            </svg>
            Share to X
          </a>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-zinc-900 bg-zinc-900/30 text-xs font-mono text-zinc-600 cursor-not-allowed"
            title="Coming soon"
          >
            Open in editor
          </button>
          <span
            className="ml-auto text-[11px] font-mono text-zinc-600 tabular-nums"
            title={absoluteTime(sessionRow.startedAt)}
          >
            {new Date(sessionRow.startedAt).toISOString().slice(0, 10)}
          </span>
        </div>

        {isOwner && (
          <Suspense fallback={<SessionCostBlockSkeleton />}>
            <SessionCostBlock
              sessionId={sessionRow.id}
              userId={userRow.id}
              estimatedCostUsd={sessionRow.estimatedCostUsd}
              inputTokens={sessionRow.inputTokens}
              outputTokens={sessionRow.outputTokens}
              cachedTokens={sessionRow.cachedTokens}
            />
          </Suspense>
        )}

        <ReceiptBlock
          outcome={sessionRow.receiptOutcome}
          tldr={sessionRow.receiptTldr}
          keyDecisions={sessionRow.receiptDecisionSummary}
          changedFiles={sessionRow.receiptChangedFiles}
          verification={sessionRow.receiptVerification}
          generatedAt={sessionRow.receiptGeneratedAt}
          shippedStatus={sessionRow.receiptStatus}
          linkedRepo={sessionRow.linkedRepo}
          linkedCommitSha={sessionRow.linkedCommitSha}
          validatorWarnings={sessionRow.receiptValidatorWarnings}
          actions={
            <ReceiptActions
              slug={sessionRow.slug}
              sessionId={sessionRow.id}
              tldr={sessionRow.receiptTldr}
              isOwner={isOwner}
              existingRecapSlug={existingPulseRecap?.slug ?? null}
            />
          }
        />

        <div className="mb-8">
          <ForkButtons
            shareUrl={fullUrl}
            forkUrl={`${fullUrl}/fork`}
            setupPrompt={firstPromptText ?? ""}
          />
        </div>

        <RecipeCard
          session={{
            title: sessionRow.title ?? "",
            recipeTldr: sessionRow.recipeTldr,
            recipeOutcome: sessionRow.recipeOutcome,
            tool: sessionRow.tool,
            repo: sessionRow.repo,
            durationSeconds: sessionRow.durationSeconds,
            eventCount: sessionRow.eventCount,
          }}
          keyPrompts={keyPrompts}
        />

        <ExplainButton
          sessionId={sessionRow.id}
          pathToRevalidate={`/u/${user}/${slug}`}
          initialExplanation={sessionRow.aiExplanation}
          canExplain={canExplain}
        />

        {highlightIdxs.length > 0 && (
          <TimelineToggle totalEvents={events.length} highlightCount={highlightIdxs.length} />
        )}

        <details className="group mt-8">
          <summary className="cursor-pointer list-none inline-flex items-center gap-1.5 text-sm font-mono text-zinc-400 hover:text-zinc-100 transition-colors mb-4 select-none">
            <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
              ›
            </span>
            <span className="group-open:hidden">View full timeline ({events.length} events)</span>
            <span className="hidden group-open:inline">Hide timeline</span>
          </summary>

          <div className="space-y-5">
            {visibleEvents.map((e) => {
              const ev = e.data as EventData;
              if (ev.kind === "file_diff") {
                return <FileDiff key={e.id} path={ev.path} before={ev.before} after={ev.after} />;
              }
              return <TimelineEvent key={e.id} idx={e.idx} data={ev} />;
            })}
          </div>
        </details>

        <div className="mt-10 space-y-6">
          <ReactionBar slug={slug} authorHandle={userRow.handle} />
          <CommentThread
            slug={slug}
            authorHandle={userRow.handle}
            ownerId={userRow.id}
            initialComments={comments}
            viewer={viewerRow ?? null}
            signInHref={signInHref(`/u/${user}/${slug}#conversation`)}
          />
        </div>
      </main>
    </div>
  );
}
