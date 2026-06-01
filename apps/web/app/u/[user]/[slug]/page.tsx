import { CommentThread, type ReceiptComment } from "@/components/comment-thread";
import { CopyButton } from "@/components/copy-button";
import { ExplainButton } from "@/components/explain-button";
import { FileDiff } from "@/components/file-diff";
import { ForkButton } from "@/components/fork-button";
import { ForkButtons } from "@/components/fork-buttons";
import { ReactionBar } from "@/components/reaction-bar";
import { ReceiptActions } from "@/components/receipt-actions";
import { ReceiptAiReviewCard } from "@/components/receipt-ai-review-card";
import { ReceiptBlock } from "@/components/receipt-block";
import { RecipeCard } from "@/components/recipe-card";
import { RelativeTime } from "@/components/relative-time";
import { SaveReceiptButton } from "@/components/save-receipt-button";
import { SessionCostBlock, SessionCostBlockSkeleton } from "@/components/session-cost-block";
import { type EventData, TimelineEvent } from "@/components/timeline-event";
import { TimelineToggle } from "@/components/timeline-toggle";
import { ToolIcon } from "@/components/tool-icon";
import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { deriveTitle } from "@/lib/derive-title";
import { isReceiptAiReview } from "@/lib/receipt-ai-review-types";
import { shareUrl, tweetIntent } from "@/lib/share";
import { durationBetween } from "@/lib/time";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";

function signInHref(callbackURL: string): string {
  return `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(callbackURL)}`;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 1000 ? "compact" : "standard" }).format(
    value,
  );
}

function statusLabel(status: string | null | undefined) {
  if (status === "shipped") return "Shipped";
  if (status === "draft") return "Draft";
  if (status === "unverified") return "Needs proof";
  return "Review";
}

function statusClass(status: string | null | undefined) {
  if (status === "shipped") return "border-[#a7f300]/45 bg-[#a7f300]/10 text-[#a7f300]";
  if (status === "draft") return "border-amber-400/45 bg-amber-400/10 text-amber-200";
  return "border-zinc-700 bg-zinc-900 text-zinc-300";
}

function ReviewMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div
        className={
          accent ? "mt-1 text-sm font-semibold text-[#a7f300]" : "mt-1 text-sm text-zinc-200"
        }
      >
        {value}
      </div>
    </div>
  );
}

function ReviewStep({
  href,
  step,
  title,
  children,
}: {
  href: string;
  step: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="group rounded-2xl border border-white/10 bg-black/35 p-4 transition hover:-translate-y-0.5 hover:border-[#a7f300]/45 hover:bg-[#a7f300]/5"
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">{step}</div>
      <div className="mt-2 text-sm font-semibold text-white group-hover:text-[#a7f300]">
        {title}
      </div>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{children}</p>
    </a>
  );
}

function SectionHeader({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-28 pb-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#a7f300]">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">{children}</p>
    </div>
  );
}

function ReviewRail({
  status,
  eventCount,
  duration,
  startedAt,
  sharedAt,
}: {
  status: string | null;
  eventCount: number;
  duration: string | null;
  startedAt: Date;
  sharedAt: Date | null;
}) {
  const items = [
    ["#check", "01", "AI check"],
    ["#outcome", "02", "Outcome"],
    ["#reuse", "03", "Reuse"],
    ["#proof", "04", "Proof"],
    ["#conversation", "05", "Thread"],
  ] as const;

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 rounded-[1.75rem] border border-zinc-800 bg-zinc-950/85 p-4 shadow-2xl shadow-black/30">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">
          Receipt map
        </div>
        <div className="mt-4 grid gap-2">
          {items.map(([href, step, label]) => (
            <a
              key={href}
              href={href}
              className="group flex items-center justify-between rounded-2xl border border-zinc-900 bg-black/35 px-3 py-2.5 text-sm text-zinc-400 transition hover:border-[#a7f300]/45 hover:text-white"
            >
              <span className="font-mono text-[10px] text-zinc-600 group-hover:text-[#a7f300]">
                {step}
              </span>
              <span>{label}</span>
            </a>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-900 bg-black/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">Status</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusClass(status)}`}>
              {statusLabel(status)}
            </span>
          </div>
          <div className="mt-3 grid gap-2 font-mono text-[11px] text-zinc-500">
            <div className="flex justify-between gap-3">
              <span>Events</span>
              <span className="text-zinc-300">{formatCount(eventCount)}</span>
            </div>
            {duration ? (
              <div className="flex justify-between gap-3">
                <span>Runtime</span>
                <span className="text-zinc-300">{duration}</span>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <span>{sharedAt ? "Published" : "Started"}</span>
              <span className="text-zinc-300">
                <RelativeTime date={sharedAt ?? startedAt} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
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
      isNotNull(schema.trailSession.sharedAt),
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
  const isPubliclyShared = sessionRow.visibility === "public" && sessionRow.sharedAt != null;
  if (!isPubliclyShared && !isOwner) return notFound();

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

  const [commentRows, viewerRow, savedRow] = await Promise.all([
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
    viewer?.user?.id && isPubliclyShared
      ? db.query.savedReceipt.findFirst({
          where: and(
            eq(schema.savedReceipt.userId, viewer.user.id),
            eq(schema.savedReceipt.sessionId, sessionRow.id),
          ),
          columns: { id: true },
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
  const heroSummary =
    sessionRow.summary ??
    sessionRow.receiptTldr ??
    "A public Trail receipt with the outcome, reusable setup, proof, and conversation in one place.";
  const readerTakeaway =
    sessionRow.receiptOutcome ??
    sessionRow.receiptTldr ??
    sessionRow.summary ??
    "Skim the outcome, inspect the proof, then decide whether to save, fork, share, or ask the builder a question.";
  const aiReview =
    !sessionRow.redactedAt && isReceiptAiReview(sessionRow.receiptAiReview)
      ? sessionRow.receiptAiReview
      : null;

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
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
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

      <main className="mx-auto grid max-w-6xl gap-8 px-4 pb-24 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:px-8">
        <div className="min-w-0">
          <section className="relative overflow-hidden rounded-[2rem] border border-zinc-800 bg-[radial-gradient(circle_at_20%_0%,rgba(167,243,0,0.13),transparent_22rem),linear-gradient(135deg,rgba(255,255,255,0.055),rgba(255,255,255,0.015))] p-5 shadow-2xl shadow-black/35 sm:p-7">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-500">
              <ToolIcon name={sessionRow.tool} className="text-zinc-400" />
              <span className="text-zinc-300">{sessionRow.tool}</span>
              {sessionRow.repo ? (
                <>
                  <span className="text-zinc-700">/</span>
                  <span className="text-zinc-400">{sessionRow.repo}</span>
                </>
              ) : null}
              {sessionRow.linkedRepo && sessionRow.linkedCommitSha ? (
                <>
                  <span className="text-zinc-700">/</span>
                  <a
                    href={`https://github.com/${sessionRow.linkedRepo}/commit/${sessionRow.linkedCommitSha}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#a7f300]/40 bg-[#a7f300]/10 px-2 py-0.5 font-mono text-[11px] text-[#a7f300] transition-colors hover:bg-[#a7f300]/20"
                    title={`Shipped in ${sessionRow.linkedRepo}@${sessionRow.linkedCommitSha}`}
                  >
                    Shipped {sessionRow.linkedCommitSha.slice(0, 7)}
                  </a>
                </>
              ) : null}
            </div>

            <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-[0.98] tracking-[-0.07em] text-zinc-50 sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">{heroSummary}</p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <ReviewMetric
                label="status"
                value={statusLabel(sessionRow.receiptStatus)}
                accent={sessionRow.receiptStatus === "shipped"}
              />
              <ReviewMetric
                label="proof size"
                value={`${formatCount(sessionRow.eventCount)} event${
                  sessionRow.eventCount === 1 ? "" : "s"
                }`}
              />
              <ReviewMetric
                label={sessionRow.sharedAt ? "published" : "started"}
                value={<RelativeTime date={sessionRow.sharedAt ?? sessionRow.startedAt} />}
              />
            </div>
          </section>

          <section className="mt-4 rounded-[2rem] border border-[#a7f300]/25 bg-[#071000] p-5 shadow-[0_24px_80px_rgba(167,243,0,0.08)] sm:p-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#a7f300]">
              Start here
            </div>
            <div className="mt-3 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.05em] text-white">
                  Let Trail do the first proof check.
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-lime-50/70">
                  GPT-5.4 mini turns the raw session into a verdict, cited evidence, and better
                  questions so you do not have to inspect every event first.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="#check"
                  className="inline-flex min-h-9 items-center rounded-full bg-[#a7f300] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-[#c8ff5e]"
                >
                  Read verdict
                </a>
                <a
                  href="#conversation"
                  className="inline-flex min-h-9 items-center rounded-full border border-lime-200/20 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-lime-50 transition hover:border-lime-100/50 hover:text-white"
                >
                  Ask a question
                </a>
              </div>
            </div>

            <div id="check" className="mt-5 scroll-mt-28">
              <ReceiptAiReviewCard
                sessionId={sessionRow.id}
                pathToRevalidate={`/u/${user}/${slug}`}
                initialReview={aiReview}
                canGenerate={
                  isOwner &&
                  !aiReview &&
                  !sessionRow.redactedAt &&
                  sessionRow.visibility !== "redacted"
                }
                fallbackSummary={readerTakeaway}
              />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <ReviewStep href="#outcome" step="01" title="Read the result">
                Start with the AI verdict and generated receipt before opening the raw timeline.
              </ReviewStep>
              <ReviewStep href="#reuse" step="02" title="Reuse the setup">
                Fork the prompt or recipe into your own AI tool when the work is useful.
              </ReviewStep>
              <ReviewStep href="#conversation" step="03" title="Join the thread">
                Save it, ask what broke, or leave a proof check for the builder.
              </ReviewStep>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-lime-100/10 pt-4">
              <CopyButton value={fullUrl} label="Copy link" copiedLabel="Copied" />
              {isPubliclyShared ? (
                <SaveReceiptButton
                  sessionId={sessionRow.id}
                  initialSaved={Boolean(savedRow)}
                  signedIn={Boolean(viewer?.user?.id)}
                  signInHref={signInHref(`/u/${user}/${slug}`)}
                  className="border-lime-200/20 bg-black/20 text-lime-50 hover:border-lime-100/50 hover:text-white"
                />
              ) : null}
              <ForkButton user={user} slug={slug} title={sessionRow.title ?? slug} />
              <a
                href={tweetIntent(`${title} - a trail by @${user}`, fullUrl)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-lime-200/20 bg-black/20 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-lime-50 transition hover:border-lime-100/50 hover:text-white"
              >
                Share to X
              </a>
              {isOwner ? (
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-9 items-center rounded-full border border-zinc-700 bg-black/20 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                >
                  Open Studio
                </Link>
              ) : null}
            </div>
          </section>

          <section className="mt-10">
            <SectionHeader id="outcome" eyebrow="02 / outcome" title="What happened?">
              Start with the generated receipt. It should answer what changed, whether it shipped,
              and which decisions matter before you inspect raw logs.
            </SectionHeader>
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
            />
          </section>

          <section className="mt-10">
            <SectionHeader id="reuse" eyebrow="03 / reuse" title="What can I do with it?">
              If the work is useful, copy the setup or open the recipe in another coding agent
              instead of reverse-engineering the timeline.
            </SectionHeader>
            <div className="grid gap-5">
              <ForkButtons
                shareUrl={fullUrl}
                forkUrl={`${fullUrl}/fork`}
                setupPrompt={firstPromptText ?? ""}
              />
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
            </div>
          </section>

          <section className="mt-10">
            <SectionHeader id="proof" eyebrow="04 / proof" title="Need more confidence?">
              Ask Trail to explain the session or open the selected timeline events only after the
              receipt summary leaves a question unanswered.
            </SectionHeader>

            <ExplainButton
              sessionId={sessionRow.id}
              pathToRevalidate={`/u/${user}/${slug}`}
              initialExplanation={sessionRow.aiExplanation}
              canExplain={canExplain}
            />

            {highlightIdxs.length > 0 ? (
              <TimelineToggle totalEvents={events.length} highlightCount={highlightIdxs.length} />
            ) : null}

            <details
              data-timeline-details
              className="group mt-6 rounded-[1.5rem] border border-zinc-900 bg-zinc-950/70 p-4"
            >
              <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-mono text-zinc-400 transition-colors hover:text-zinc-100">
                <span
                  className="inline-block transition-transform group-open:rotate-90"
                  aria-hidden
                >
                  &gt;
                </span>
                <span className="group-open:hidden">
                  Open raw timeline ({events.length} events)
                </span>
                <span className="hidden group-open:inline">Hide raw timeline</span>
              </summary>

              <div className="mt-5 space-y-5">
                {visibleEvents.map((e) => {
                  const ev = e.data as EventData;
                  if (ev.kind === "file_diff") {
                    return (
                      <FileDiff key={e.id} path={ev.path} before={ev.before} after={ev.after} />
                    );
                  }
                  return <TimelineEvent key={e.id} idx={e.idx} data={ev} />;
                })}
              </div>
            </details>
          </section>

          {isOwner ? (
            <details className="group mt-8 rounded-[1.5rem] border border-dashed border-zinc-800 bg-black/20 p-4">
              <summary className="inline-flex cursor-pointer list-none items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-zinc-500 transition hover:text-zinc-200">
                <span
                  className="inline-block transition-transform group-open:rotate-90"
                  aria-hidden
                >
                  &gt;
                </span>
                Owner tools
              </summary>
              <div className="mt-4 space-y-4">
                <ReceiptActions
                  slug={sessionRow.slug}
                  sessionId={sessionRow.id}
                  tldr={sessionRow.receiptTldr}
                  isOwner={isOwner}
                  existingRecapSlug={existingPulseRecap?.slug ?? null}
                />
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
              </div>
            </details>
          ) : null}

          <div className="mt-10 space-y-6">
            <ReactionBar slug={slug} authorHandle={userRow.handle} />
            <CommentThread
              slug={slug}
              authorHandle={userRow.handle}
              ownerId={userRow.id}
              initialComments={comments}
              viewer={viewerRow ?? null}
              signInHref={signInHref(`/u/${user}/${slug}#conversation`)}
              threadStarters={aiReview?.questions}
            />
          </div>
        </div>
        <ReviewRail
          status={sessionRow.receiptStatus}
          eventCount={sessionRow.eventCount}
          duration={duration}
          startedAt={sessionRow.startedAt}
          sharedAt={sessionRow.sharedAt}
        />
      </main>
    </div>
  );
}
