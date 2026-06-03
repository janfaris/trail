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
import { SaveLessonButton } from "@/components/save-lesson-button";
import { SaveReceiptButton } from "@/components/save-receipt-button";
import { SessionCostBlock, SessionCostBlockSkeleton } from "@/components/session-cost-block";
import { type EventData, TimelineEvent } from "@/components/timeline-event";
import { TimelineToggle } from "@/components/timeline-toggle";
import { ToolIcon } from "@/components/tool-icon";
import { UseLessonButton } from "@/components/use-lesson-button";
import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { deriveTitle } from "@/lib/derive-title";
import { isReceiptAiReview } from "@/lib/receipt-ai-review-types";
import { shareUrl, tweetIntent } from "@/lib/share";
import { durationBetween } from "@/lib/time";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { type ReactNode, Suspense } from "react";

function signInHref(callbackURL: string): string {
  return `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(callbackURL)}`;
}

function agentPromptFromLesson(lesson: {
  title: string;
  whatToSteal: string;
  useWhen: string;
  promptPattern: string | null;
  decision: string | null;
  failureMode: string | null;
}) {
  const move = (lesson.promptPattern ?? lesson.whatToSteal)
    .replace(/\[path\]/g, "<your-path>")
    .replace(/\[url\]/g, "<your-url>")
    .replace(/\[token\]/g, "<your-secret>")
    .replace(/\[email\]/g, "<your-email>");
  return [
    "Use this Trail lesson as a reusable move in my codebase.",
    "",
    `Lesson: ${lesson.title}`,
    `Move: ${lesson.whatToSteal}`,
    `Use when: ${lesson.useWhen}`,
    lesson.decision ? `Decision to preserve: ${lesson.decision}` : null,
    lesson.failureMode ? `Watch out: ${lesson.failureMode}` : null,
    "",
    `Agent instruction: ${move}`,
  ]
    .filter(Boolean)
    .join("\n");
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
    <div className="rounded-2xl bg-black/30 px-4 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
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
      className="group rounded-2xl bg-black/30 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)] transition-[background-color,box-shadow] hover:bg-black/42 hover:shadow-[0_0_0_1px_rgba(167,243,0,0.22)]"
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
    ["#lessons", "02", "Lessons"],
    ["#outcome", "03", "Outcome"],
    ["#reuse", "04", "Reuse"],
    ["#proof", "05", "Proof"],
    ["#conversation", "06", "Thread"],
  ] as const;

  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24 rounded-[1.75rem] border border-white/10 bg-zinc-950/85 p-4 shadow-2xl shadow-black/30">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">
          Receipt map
        </div>
        <div className="mt-4 grid gap-2">
          {items.map(([href, step, label]) => (
            <a
              key={href}
              href={href}
              className="group flex items-center justify-between rounded-2xl bg-white/[0.03] px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
            >
              <span className="font-mono text-[10px] text-zinc-600 group-hover:text-[#a7f300]">
                {step}
              </span>
              <span>{label}</span>
            </a>
          ))}
        </div>

        <div className="mt-4 rounded-2xl bg-black/30 p-3 shadow-[var(--trail-shadow-border)]">
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

  const [commentRows, viewerRow, savedRow, lessonRows] = await Promise.all([
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
    db
      .select({
        id: schema.sessionLesson.id,
        title: schema.sessionLesson.title,
        whatToSteal: schema.sessionLesson.whatToSteal,
        useWhen: schema.sessionLesson.useWhen,
        promptPattern: schema.sessionLesson.promptPattern,
        decision: schema.sessionLesson.decision,
        failureMode: schema.sessionLesson.failureMode,
        proof: schema.sessionLesson.proof,
        stack: schema.sessionLesson.stack,
        tags: schema.sessionLesson.tags,
        sourceEventIdxs: schema.sessionLesson.sourceEventIdxs,
        transferabilityScore: schema.sessionLesson.transferabilityScore,
        confidence: schema.sessionLesson.confidence,
        reuseCount: sql<number>`(
          select count(*)::int
          from lesson_reuse used
          where used.lesson_id = ${schema.sessionLesson.id}
        )`,
      })
      .from(schema.sessionLesson)
      .innerJoin(schema.trailSession, eq(schema.sessionLesson.sessionId, schema.trailSession.id))
      .where(
        and(
          eq(schema.sessionLesson.sessionId, sessionRow.id),
          eq(schema.trailSession.visibility, "public"),
          isNotNull(schema.trailSession.sharedAt),
          isNull(schema.trailSession.redactedAt),
        ),
      )
      .orderBy(
        desc(schema.sessionLesson.transferabilityScore),
        asc(schema.sessionLesson.lessonIndex),
      )
      .limit(5),
  ]);
  const [savedLessonIds, usedLessonIds] =
    viewer?.user?.id && lessonRows.length > 0
      ? await Promise.all([
          db
            .select({ lessonId: schema.savedLesson.lessonId })
            .from(schema.savedLesson)
            .where(
              and(
                eq(schema.savedLesson.userId, viewer.user.id),
                inArray(
                  schema.savedLesson.lessonId,
                  lessonRows.map((lesson) => lesson.id),
                ),
              ),
            )
            .then((rows) => new Set(rows.map((row) => row.lessonId))),
          db
            .select({ lessonId: schema.lessonReuse.lessonId })
            .from(schema.lessonReuse)
            .where(
              and(
                eq(schema.lessonReuse.userId, viewer.user.id),
                inArray(
                  schema.lessonReuse.lessonId,
                  lessonRows.map((lesson) => lesson.id),
                ),
              ),
            )
            .then((rows) => new Set(rows.map((row) => row.lessonId))),
        ])
      : [new Set<string>(), new Set<string>()];

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
      <header className="border-b border-white/10 sticky top-0 bg-zinc-950/85 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/70 z-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="font-mono text-[15px] font-semibold tracking-tight">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <nav className="flex items-center gap-1 text-sm font-mono text-zinc-500">
            <Link href={`/u/${user}`} className="transition-[color] hover:text-zinc-100">
              @{user}
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="text-zinc-300">{slug}</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 pb-24 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:px-8">
        <div className="min-w-0">
          <section className="relative overflow-hidden rounded-[2rem] bg-zinc-950/86 p-5 shadow-[var(--trail-shadow-border)] sm:p-7">
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
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#a7f300]/10 px-2 py-0.5 font-mono text-[11px] text-[#a7f300] shadow-[0_0_0_1px_rgba(167,243,0,0.24)] transition-[background-color] hover:bg-[#a7f300]/20"
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

          <section className="mt-4 rounded-[2rem] bg-[#071000]/82 p-5 shadow-[0_0_0_1px_rgba(167,243,0,0.16)] sm:p-6">
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
                  href={lessonRows.length > 0 ? "#lessons" : "#check"}
                  className="inline-flex min-h-10 items-center rounded-full bg-[#a7f300] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-950 transition-[background-color,transform] hover:bg-[#c8ff5e] active:scale-[0.96]"
                >
                  {lessonRows.length > 0 ? "Steal the moves" : "Read verdict"}
                </a>
                <a
                  href="#conversation"
                  className="inline-flex min-h-10 items-center rounded-full px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-lime-50 shadow-[0_0_0_1px_rgba(236,252,203,0.18)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[0_0_0_1px_rgba(236,252,203,0.34)] active:scale-[0.96]"
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
              <ReviewStep href="#lessons" step="02" title="Steal the lesson">
                Copy the extracted move, prompt pattern, or failure mode before opening proof.
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
                  className="bg-black/20 text-lime-50 shadow-[0_0_0_1px_rgba(236,252,203,0.18)] hover:text-white hover:shadow-[0_0_0_1px_rgba(236,252,203,0.34)]"
                />
              ) : null}
              <ForkButton user={user} slug={slug} title={sessionRow.title ?? slug} />
              <a
                href={tweetIntent(`${title} - a trail by @${user}`, fullUrl)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black/20 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-lime-50 shadow-[0_0_0_1px_rgba(236,252,203,0.18)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[0_0_0_1px_rgba(236,252,203,0.34)] active:scale-[0.96]"
              >
                Share to X
              </a>
              {isOwner ? (
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-10 items-center rounded-full bg-black/20 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-300 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.22)] active:scale-[0.96]"
                >
                  Open Studio
                </Link>
              ) : null}
            </div>
          </section>

          {lessonRows.length > 0 ? (
            <section className="mt-10">
              <SectionHeader id="lessons" eyebrow="02 / lessons" title="What can I steal?">
                Trail extracted reusable moves from the session. Read these before opening the raw
                timeline; proof is cited only when you need confidence.
              </SectionHeader>
              <div className="grid gap-4">
                {lessonRows.map((lesson, index) => (
                  <article
                    key={lesson.id}
                    className="overflow-hidden rounded-[1.75rem] border border-[#a7f300]/20 bg-[linear-gradient(135deg,rgba(167,243,0,0.07),transparent_38%),#080908]"
                  >
                    <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
                      <div className="p-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[#a7f300]/25 bg-[#a7f300]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#a7f300]">
                            lesson {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-lime-50/55">
                            {lesson.transferabilityScore}/5 transferable
                          </span>
                          <span className="rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-lime-50/55">
                            {lesson.confidence} confidence
                          </span>
                          <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-amber-100/75">
                            {Number(lesson.reuseCount) > 0
                              ? `${formatCount(Number(lesson.reuseCount))} used`
                              : "ready to use"}
                          </span>
                        </div>
                        <h3 className="mt-4 text-2xl font-semibold tracking-[-0.05em] text-white">
                          {lesson.title}
                        </h3>
                        <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
                          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">
                            What to steal
                          </div>
                          <p className="mt-2 text-base leading-7 text-lime-50/85">
                            {lesson.whatToSteal}
                          </p>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                              Use when
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-300">{lesson.useWhen}</p>
                          </div>
                          {lesson.failureMode ? (
                            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.045] p-4">
                              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-100/70">
                                Watch out
                              </div>
                              <p className="mt-2 text-sm leading-6 text-amber-50/80">
                                {lesson.failureMode}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="border-t border-lime-100/10 bg-black/25 p-5 lg:border-l lg:border-t-0">
                        {lesson.promptPattern ? (
                          <div>
                            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-lime-200/60">
                              Copy prompt move
                            </div>
                            <div className="mt-3 rounded-2xl border border-white/10 bg-black/35 p-3">
                              <p className="text-sm leading-6 text-lime-50/75">
                                {lesson.promptPattern}
                              </p>
                              <CopyButton
                                value={lesson.promptPattern}
                                label="Copy move"
                                copiedLabel="Copied"
                                className="mt-3"
                              />
                            </div>
                          </div>
                        ) : null}
                        {lesson.decision ? (
                          <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
                            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                              Decision
                            </div>
                            <p className="mt-2 text-sm leading-5 text-zinc-300">
                              {lesson.decision}
                            </p>
                          </div>
                        ) : null}
                        <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3">
                          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                            Proof
                          </div>
                          <p className="mt-2 text-sm leading-5 text-zinc-300">{lesson.proof}</p>
                          {lesson.sourceEventIdxs.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {lesson.sourceEventIdxs.slice(0, 3).map((idx) => (
                                <a
                                  key={idx}
                                  href={`#event-${idx}`}
                                  className="rounded-full border border-lime-200/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#a7f300] transition hover:border-lime-100/50"
                                >
                                  event #{idx}
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
                          <CopyButton
                            value={agentPromptFromLesson(lesson)}
                            label="Use in agent"
                            copiedLabel="Copied agent prompt"
                            className="min-h-9 rounded-full px-3 uppercase tracking-[0.12em]"
                          />
                          <SaveLessonButton
                            lessonId={lesson.id}
                            initialSaved={savedLessonIds.has(lesson.id)}
                            signedIn={Boolean(viewer?.user?.id)}
                            signInHref={signInHref(`/u/${user}/${slug}#lessons`)}
                          />
                          <UseLessonButton
                            lessonId={lesson.id}
                            initialUsed={usedLessonIds.has(lesson.id)}
                            signedIn={Boolean(viewer?.user?.id)}
                            signInHref={signInHref(`/u/${user}/${slug}#lessons`)}
                          />
                          <a
                            href="#conversation"
                            className="inline-flex min-h-9 items-center rounded-full border border-zinc-700 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-300 transition hover:border-[#a7f300]/60 hover:text-[#a7f300]"
                          >
                            Discuss lesson
                          </a>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {[...(lesson.stack ?? []), ...(lesson.tags ?? [])]
                            .slice(0, 5)
                            .map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-zinc-500"
                              >
                                {tag}
                              </span>
                            ))}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-10">
            <SectionHeader id="outcome" eyebrow="03 / outcome" title="What happened?">
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
            <SectionHeader id="reuse" eyebrow="04 / reuse" title="What can I do with it?">
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
            <SectionHeader id="proof" eyebrow="05 / proof" title="Need more confidence?">
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
              className="group mt-6 rounded-[1.5rem] bg-zinc-950/70 p-4 shadow-[var(--trail-shadow-border)]"
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
                      <div key={e.id} id={`event-${e.idx}`} className="scroll-mt-28">
                        <FileDiff path={ev.path} before={ev.before} after={ev.after} />
                      </div>
                    );
                  }
                  return (
                    <div key={e.id} id={`event-${e.idx}`} className="scroll-mt-28">
                      <TimelineEvent idx={e.idx} data={ev} />
                    </div>
                  );
                })}
              </div>
            </details>
          </section>

          {isOwner ? (
            <details className="group mt-8 rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-4">
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

          <div id="conversation" className="mt-10 scroll-mt-28 space-y-6">
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
