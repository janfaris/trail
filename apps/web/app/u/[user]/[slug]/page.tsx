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
import { SiteNav } from "@/components/site-nav";
import { type EventData, TimelineEvent } from "@/components/timeline-event";
import { TimelineToggle } from "@/components/timeline-toggle";
import { ToolIcon } from "@/components/tool-icon";
import { Avatar } from "@/components/ui/avatar";
import { UseLessonButton } from "@/components/use-lesson-button";
import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { deriveTitle } from "@/lib/derive-title";
import { isReceiptAiReview } from "@/lib/receipt-ai-review-types";
import { githubAvatar, shareUrl, tweetIntent } from "@/lib/share";
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
  if (status === "shipped") return "text-[#a7f300]";
  if (status === "partial") return "text-sky-200";
  if (status === "failed") return "text-red-200";
  if (status === "draft") return "text-amber-200";
  if (status === "needs-proof") return "text-amber-200";
  return "text-zinc-300";
}

function reviewVerdictLabel(verdict: string | null | undefined) {
  if (verdict === "shipped") return "Shipped";
  if (verdict === "partial") return "Partial";
  if (verdict === "failed") return "Failed";
  if (verdict === "needs-proof") return "Needs proof";
  return statusLabel(verdict);
}

function isManualBuildPost(postKind: string | null | undefined): boolean {
  return postKind === "manual_build";
}

function ProofFact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border-l border-white/10 pl-3">
      <div className="text-[12px] text-zinc-600">{label}</div>
      <div className="mt-1 text-[13px] leading-5 text-zinc-300">{children}</div>
    </div>
  );
}

type ProofFactData = { label: string; value: ReactNode };

function SectionHeader({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-28 border-b border-white/[0.08] px-4 py-4 sm:px-5">
      <h2 className="text-[18px] font-medium tracking-[-0.025em] text-zinc-50">{title}</h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-5 text-zinc-500">{children}</p>
    </div>
  );
}

function ReviewRail({
  status,
  eventCount,
  duration,
  startedAt,
  sharedAt,
  hasLessons,
  isManualPost,
}: {
  status: string | null;
  eventCount: number;
  duration: string | null;
  startedAt: Date;
  sharedAt: Date | null;
  hasLessons: boolean;
  isManualPost: boolean;
}) {
  const items = [
    ["#outcome", "01", "60-sec read"],
    ...(hasLessons ? ([["#lessons", "02", "Lessons"]] as const) : []),
    ["#reuse", hasLessons ? "03" : "02", "Reuse"],
    ["#conversation", hasLessons ? "04" : "03", "Thread"],
    ...(!isManualPost ? ([["#proof", hasLessons ? "05" : "04", "Deep proof"]] as const) : []),
  ] as const;

  return (
    <aside className="hidden xl:block">
      <div className="sticky top-20 space-y-6 py-5 text-sm">
        <section className="border-b border-white/[0.08] pb-5">
          <h3 className="font-medium tracking-[-0.01em] text-zinc-200">
            {isManualPost ? "Post index" : "Receipt index"}
          </h3>
          <div className="mt-3 space-y-2">
            {items.map(([href, step, label]) => (
              <a
                key={href}
                href={href}
                className="group flex items-baseline justify-between gap-4 text-[13px] text-zinc-500 transition-colors hover:text-zinc-100"
              >
                <span className="font-mono text-[11px] text-zinc-700 group-hover:text-zinc-500">
                  {step}
                </span>
                <span>{label}</span>
              </a>
            ))}
          </div>
        </section>

        <section className="border-b border-white/[0.08] pb-5">
          <h3 className="font-medium tracking-[-0.01em] text-zinc-200">
            {isManualPost ? "Post pulse" : "Proof pulse"}
          </h3>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">Status</span>
            <span className={`font-mono text-[11px] tabular-nums ${statusClass(status)}`}>
              {isManualPost ? "Build post" : statusLabel(status)}
            </span>
          </div>
          <div className="mt-3 grid gap-2 font-mono text-[11px] text-zinc-600">
            {!isManualPost ? (
              <div className="flex justify-between gap-3">
                <span>Events</span>
                <span className="text-zinc-300">{formatCount(eventCount)}</span>
              </div>
            ) : null}
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
        </section>
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
    sessionRow.summary ||
    (isManualBuildPost(sessionRow.postKind)
      ? `Build post by @${user}`
      : `${sessionRow.tool} · ${sessionRow.eventCount} events · @${user}`);
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
  const manualPost = isManualBuildPost(sessionRow.postKind);

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

  const [commentRows, viewerRow, savedRow, lessonRows, buildPostLinks] = await Promise.all([
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
    db.query.buildPostLink.findMany({
      where: eq(schema.buildPostLink.sessionId, sessionRow.id),
      orderBy: asc(schema.buildPostLink.createdAt),
      columns: { id: true, kind: true, url: true, label: true },
    }),
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
    (manualPost
      ? "A public Trail build post with context, proof links, and a builder thread."
      : "A public Trail receipt with the outcome, reusable setup, proof, and conversation in one place.");
  const readerTakeaway =
    sessionRow.receiptOutcome ??
    sessionRow.receiptTldr ??
    sessionRow.summary ??
    (manualPost
      ? "Read what was built, open the proof links, then ask the builder a useful question."
      : "Skim the outcome, inspect the proof, then decide whether to save, fork, share, or ask the builder a question.");
  const aiReview =
    !sessionRow.redactedAt && isReceiptAiReview(sessionRow.receiptAiReview)
      ? sessionRow.receiptAiReview
      : null;
  const authorDisplayName = userRow.name?.trim() || `@${user}`;
  const authorAvatar = userRow.image ?? githubAvatar(userRow.githubHandle || user);
  const visibleCommentCount = comments.filter((comment) => !comment.deletedAt).length;
  const replyCount = comments.filter((comment) => comment.parentId && !comment.deletedAt).length;
  const postTypeLabel = manualPost ? "Build post" : "Proof-backed build post";

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
  const changedFiles = sessionRow.receiptChangedFiles ?? [];
  const decisions = (sessionRow.receiptDecisionSummary ?? []).filter(Boolean);
  const aiEvidenceFacts: ProofFactData[] =
    aiReview?.evidence.slice(0, 3).map((item) => ({
      label: item.label,
      value: item.detail,
    })) ?? [];
  const linkProofFacts: ProofFactData[] = buildPostLinks.map((link) => ({
    label: link.label ?? link.kind,
    value: (
      <a
        href={link.url}
        target="_blank"
        rel="noreferrer noopener"
        className="break-all text-zinc-300 underline-offset-4 hover:text-[#a7f300] hover:underline"
      >
        {link.url}
      </a>
    ),
  }));
  const fallbackProofFacts: ProofFactData[] = manualPost
    ? [
        {
          label: "Builder context",
          value: "This post was written directly by the builder. Logs are optional.",
        },
      ]
    : ([
        {
          label: "Proof trail",
          value: `${formatCount(sessionRow.eventCount)} event${
            sessionRow.eventCount === 1 ? "" : "s"
          } recorded`,
        },
        changedFiles.length > 0
          ? {
              label: "Changed files",
              value: `${formatCount(changedFiles.length)} file${
                changedFiles.length === 1 ? "" : "s"
              } touched`,
            }
          : null,
        sessionRow.linkedRepo && sessionRow.linkedCommitSha
          ? {
              label: "GitHub proof",
              value: `${sessionRow.linkedRepo}@${sessionRow.linkedCommitSha.slice(0, 7)}`,
            }
          : null,
        lessonRows.length > 0
          ? {
              label: "Reusable lessons",
              value: `${formatCount(lessonRows.length)} extracted`,
            }
          : null,
        decisions.length > 0
          ? {
              label: "Decisions",
              value: `${formatCount(decisions.length)} called out`,
            }
          : null,
      ].filter(Boolean) as ProofFactData[]);
  const proofFacts = [...linkProofFacts, ...aiEvidenceFacts, ...fallbackProofFacts].slice(0, 3);
  const proofLinkCount = buildPostLinks.length;
  const verdict = aiReview
    ? reviewVerdictLabel(aiReview.verdict)
    : manualPost
      ? "Build post"
      : statusLabel(sessionRow.receiptStatus);
  const primaryActionHref = manualPost
    ? buildPostLinks.length > 0
      ? "#reuse"
      : "#conversation"
    : lessonRows.length > 0
      ? "#lessons"
      : "#conversation";
  const primaryActionLabel = manualPost
    ? buildPostLinks.length > 0
      ? "Open proof links"
      : "Join the thread"
    : lessonRows.length > 0
      ? "Read lessons"
      : "Ask a question";

  return (
    <div className="min-h-screen bg-[#080808] text-zinc-50">
      <SiteNav currentPath="/feed" />

      <main className="min-h-[calc(100vh-3.5rem)] w-full">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 xl:grid-cols-[minmax(0,720px)_280px] xl:gap-10 xl:px-4">
          <div className="min-w-0 border-x border-white/[0.08] bg-[#0b0b0a]">
            <div className="border-b border-white/[0.08] bg-[#0b0b0a]/95 backdrop-blur-xl md:sticky md:top-14 md:z-30">
              <div className="flex items-start justify-between gap-4 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-zinc-600">
                    <Link href="/feed" className="hover:text-zinc-200">
                      Feed
                    </Link>
                    <span>/</span>
                    <Link href={`/u/${user}`} className="font-mono hover:text-zinc-200">
                      @{user}
                    </Link>
                    <span>/</span>
                    <span className="truncate text-zinc-400">{slug}</span>
                  </div>
                  <h1 className="mt-2 text-[24px] font-medium leading-tight tracking-[-0.035em] text-zinc-50">
                    {postTypeLabel}
                  </h1>
                </div>
                {!manualPost ? (
                  <span className="shrink-0 font-mono text-[12px] text-zinc-600 tabular-nums">
                    {formatCount(sessionRow.eventCount)} events
                  </span>
                ) : null}
              </div>
            </div>

            <section className="border-b border-white/[0.08] px-4 py-5 sm:px-5">
              <div id="outcome" className="scroll-mt-28">
                <div className="flex flex-wrap items-center gap-2 text-[12px] text-zinc-600">
                  <ToolIcon name={sessionRow.tool} className="text-zinc-500" />
                  <span className="text-zinc-300">{sessionRow.tool}</span>
                  {sessionRow.repo ? (
                    <>
                      <span className="text-zinc-700">·</span>
                      <span className="truncate text-zinc-400">{sessionRow.repo}</span>
                    </>
                  ) : null}
                  <span className="text-zinc-700">·</span>
                  <span
                    className={
                      manualPost
                        ? "text-zinc-300"
                        : statusClass(aiReview?.verdict ?? sessionRow.receiptStatus)
                    }
                  >
                    {verdict}
                  </span>
                  {sessionRow.linkedRepo && sessionRow.linkedCommitSha ? (
                    <>
                      <span className="text-zinc-700">·</span>
                      <a
                        href={`https://github.com/${sessionRow.linkedRepo}/commit/${sessionRow.linkedCommitSha}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-mono text-[11px] text-[#a7f300] transition-colors hover:text-zinc-100"
                        title={`Shipped in ${sessionRow.linkedRepo}@${sessionRow.linkedCommitSha}`}
                      >
                        commit {sessionRow.linkedCommitSha.slice(0, 7)}
                      </a>
                    </>
                  ) : null}
                </div>

                <h2 className="mt-3 max-w-3xl text-pretty text-[25px] font-medium leading-[1.16] tracking-[-0.04em] text-zinc-50 sm:text-[30px]">
                  {title}
                </h2>
                <div className="mt-4 flex flex-wrap items-center gap-3 border-y border-white/[0.08] py-3">
                  <Link
                    href={`/u/${user}`}
                    className="group inline-flex min-w-0 items-center gap-2.5"
                  >
                    <Avatar
                      src={authorAvatar}
                      alt={authorDisplayName}
                      size={34}
                      fallback={user}
                      className="shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-zinc-200 group-hover:text-white">
                        {authorDisplayName}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-zinc-600">
                        @{user}
                      </span>
                    </span>
                  </Link>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-600">
                    <span>
                      Published <RelativeTime date={sessionRow.sharedAt ?? sessionRow.startedAt} />
                    </span>
                    {proofLinkCount > 0 ? (
                      <span>
                        {formatCount(proofLinkCount)} proof link
                        {proofLinkCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    <a href="#conversation" className="hover:text-zinc-200">
                      {visibleCommentCount > 0
                        ? `${formatCount(visibleCommentCount)} comments`
                        : "Start the thread"}
                    </a>
                  </div>
                </div>
                <p className="mt-3 max-w-2xl text-pretty text-[14px] leading-6 text-zinc-400">
                  {heroSummary}
                </p>
              </div>

              <div id="check" className="mt-5 scroll-mt-28 border-t border-white/[0.08] pt-5">
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(16rem,0.95fr)]">
                  <div>
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] text-zinc-600">
                      <span>60-second read</span>
                      <span
                        className={`font-mono text-[11px] tabular-nums ${statusClass(aiReview?.verdict ?? sessionRow.receiptStatus)}`}
                      >
                        {verdict}
                      </span>
                      {manualPost ? (
                        <div className="mt-4 border-l border-white/10 pl-3">
                          <div className="text-[12px] text-zinc-600">Builder post</div>
                          <p className="mt-1 text-[13px] leading-5 text-zinc-500">
                            No logs required. Judge this by the builder context, links, and
                            discussion.
                          </p>
                        </div>
                      ) : aiReview ? (
                        <span className="font-mono text-[11px] text-zinc-500">
                          {aiReview.confidence} confidence
                        </span>
                      ) : null}
                      {!manualPost ? (
                        <span className="font-mono text-[11px] text-zinc-500">
                          {formatCount(sessionRow.eventCount)} events
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-2 text-[18px] font-medium leading-6 tracking-[-0.02em] text-zinc-50">
                      What happened
                    </h3>
                    <p className="mt-2 max-w-2xl whitespace-pre-line text-[14px] leading-6 text-zinc-300">
                      {readerTakeaway}
                    </p>
                    {aiReview ? (
                      <div className="mt-4 border-l border-[#a7f300]/30 pl-3">
                        <div className="text-[12px] text-zinc-600">Trail check</div>
                        <p className="mt-1 text-[13px] leading-5 text-zinc-400">
                          {aiReview.headline}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 border-l border-white/10 pl-3">
                        <div className="text-[12px] text-zinc-600">Trail check</div>
                        <p className="mt-1 text-[13px] leading-5 text-zinc-500">
                          No AI check has been generated yet. Use the generated receipt and raw
                          proof below if you need confidence.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/[0.08] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <div className="text-[12px] text-zinc-600">
                      {manualPost ? "Proof links" : "Proof facts"}
                    </div>
                    <div className="mt-3 grid gap-3">
                      {proofFacts.map((fact, index) => (
                        <ProofFact key={`${fact.label}-${index}`} label={fact.label}>
                          {fact.value}
                        </ProofFact>
                      ))}
                      <ProofFact label="Conversation">
                        {visibleCommentCount > 0
                          ? `${formatCount(visibleCommentCount)} comment${
                              visibleCommentCount === 1 ? "" : "s"
                            }${replyCount > 0 ? `, ${formatCount(replyCount)} replies` : ""}`
                          : "No comments yet. Ask the builder what they would do next."}
                      </ProofFact>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-white/[0.08] pt-3">
                  <a
                    href={primaryActionHref}
                    className="inline-flex min-h-8 items-center rounded-full bg-zinc-100 px-3 text-[13px] font-medium text-zinc-950 transition-[background-color,transform] hover:bg-[#a7f300] active:scale-[0.97]"
                  >
                    {primaryActionLabel}
                  </a>
                  <a
                    href="#conversation"
                    className="inline-flex min-h-8 items-center rounded-full px-3 text-[13px] text-zinc-600 transition-[background-color,color,transform] hover:bg-white/[0.04] hover:text-zinc-200 active:scale-[0.97]"
                  >
                    Reply
                  </a>
                  {isPubliclyShared ? (
                    <SaveReceiptButton
                      sessionId={sessionRow.id}
                      initialSaved={Boolean(savedRow)}
                      signedIn={Boolean(viewer?.user?.id)}
                      signInHref={signInHref(`/u/${user}/${slug}`)}
                      className="border-transparent bg-transparent px-2.5 text-[13px] normal-case tracking-normal text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-200"
                    />
                  ) : null}
                  {!manualPost ? (
                    <ForkButton user={user} slug={slug} title={sessionRow.title ?? slug} />
                  ) : null}
                  <CopyButton
                    value={fullUrl}
                    label="Copy"
                    copiedLabel="Copied"
                    className="min-h-8 rounded-full border-transparent bg-transparent px-2.5 text-[13px] normal-case tracking-normal text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-200"
                  />
                  <a
                    href={tweetIntent(
                      `${title} - a Trail ${manualPost ? "build post" : "receipt"} by @${user}`,
                      fullUrl,
                    )}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-8 items-center rounded-full px-2.5 text-[13px] text-zinc-600 transition-[background-color,color,transform] hover:bg-white/[0.04] hover:text-zinc-200 active:scale-[0.97]"
                  >
                    Share
                  </a>
                  {isOwner ? (
                    <Link
                      href="/dashboard"
                      className="inline-flex min-h-8 items-center rounded-full px-2.5 text-[13px] text-zinc-600 transition-[background-color,color,transform] hover:bg-white/[0.04] hover:text-zinc-200 active:scale-[0.97]"
                    >
                      Studio
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>

            {lessonRows.length > 0 ? (
              <section>
                <SectionHeader id="lessons" title="What can I steal?">
                  Trail extracted reusable moves from the session. Read these before opening the raw
                  timeline; proof is cited only when you need confidence.
                </SectionHeader>
                <div className="divide-y divide-white/[0.08]">
                  {lessonRows.map((lesson, index) => (
                    <article key={lesson.id} className="px-4 py-5 sm:px-5">
                      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(16rem,0.92fr)]">
                        <div>
                          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] text-zinc-600">
                            <span>Lesson {String(index + 1).padStart(2, "0")}</span>
                            <span>
                              <span className="font-mono text-zinc-300">
                                {lesson.transferabilityScore}/5
                              </span>{" "}
                              transferable
                            </span>
                            <span>
                              <span className="font-mono text-zinc-300">{lesson.confidence}</span>{" "}
                              confidence
                            </span>
                            <span className="text-zinc-500">
                              {Number(lesson.reuseCount) > 0
                                ? `${formatCount(Number(lesson.reuseCount))} used`
                                : "ready to use"}
                            </span>
                          </div>
                          <h3 className="mt-2 text-[17px] font-medium leading-6 tracking-[-0.015em] text-zinc-50">
                            {lesson.title}
                          </h3>
                          <div className="mt-3 border-l border-[#a7f300]/30 pl-3">
                            <div className="text-[12px] text-zinc-600">What to steal</div>
                            <p className="mt-1 text-[14px] leading-6 text-zinc-300">
                              {lesson.whatToSteal}
                            </p>
                          </div>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div className="border-l border-white/10 pl-3">
                              <div className="text-[12px] text-zinc-600">Use when</div>
                              <p className="mt-1 text-[13px] leading-5 text-zinc-400">
                                {lesson.useWhen}
                              </p>
                            </div>
                            {lesson.failureMode ? (
                              <div className="border-l border-amber-300/25 pl-3">
                                <div className="text-[12px] text-zinc-600">Watch out</div>
                                <p className="mt-1 text-[13px] leading-5 text-amber-50/75">
                                  {lesson.failureMode}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="border-t border-white/[0.08] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                          {lesson.promptPattern ? (
                            <div>
                              <div className="text-[12px] text-zinc-600">Copy prompt move</div>
                              <div className="mt-2 border-l border-white/10 pl-3">
                                <p className="text-[13px] leading-5 text-zinc-400">
                                  {lesson.promptPattern}
                                </p>
                                <CopyButton
                                  value={lesson.promptPattern}
                                  label="Copy move"
                                  copiedLabel="Copied"
                                  className="mt-3 min-h-8 rounded-full px-3 text-[12px] normal-case tracking-normal"
                                />
                              </div>
                            </div>
                          ) : null}
                          {lesson.decision ? (
                            <div className="mt-4 border-l border-white/10 pl-3">
                              <div className="text-[12px] text-zinc-600">Decision</div>
                              <p className="mt-1 text-[13px] leading-5 text-zinc-400">
                                {lesson.decision}
                              </p>
                            </div>
                          ) : null}
                          <div className="mt-4 border-l border-white/10 pl-3">
                            <div className="text-[12px] text-zinc-600">Proof</div>
                            <p className="mt-1 text-[13px] leading-5 text-zinc-400">
                              {lesson.proof}
                            </p>
                            {lesson.sourceEventIdxs.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                                {lesson.sourceEventIdxs.slice(0, 3).map((idx) => (
                                  <a
                                    key={idx}
                                    href={`#event-${idx}`}
                                    className="font-mono text-[11px] text-zinc-600 transition-colors hover:text-[#a7f300]"
                                  >
                                    event #{idx}
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.08] pt-3">
                            <CopyButton
                              value={agentPromptFromLesson(lesson)}
                              label="Use in agent"
                              copiedLabel="Copied agent prompt"
                              className="min-h-8 rounded-full px-3 text-[12px] normal-case tracking-normal"
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
                              className="inline-flex min-h-8 items-center rounded-full px-2.5 text-[13px] text-zinc-600 transition-[background-color,color,transform] hover:bg-white/[0.04] hover:text-zinc-200 active:scale-[0.97]"
                            >
                              Discuss
                            </a>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-zinc-700">
                            {[...(lesson.stack ?? []), ...(lesson.tags ?? [])]
                              .slice(0, 5)
                              .map((tag) => (
                                <span key={tag}>#{tag}</span>
                              ))}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <SectionHeader
                id="reuse"
                title={manualPost ? "Proof links" : "What can I do with it?"}
              >
                {manualPost
                  ? "Open the source, demo, or social post the builder attached, then bring feedback back to the thread."
                  : "If the work is useful, copy the setup or open the recipe in another coding agent instead of reverse-engineering the timeline."}
              </SectionHeader>
              {manualPost ? (
                <div className="divide-y divide-white/[0.08]">
                  {buildPostLinks.length > 0 ? (
                    buildPostLinks.map((link) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block px-4 py-4 transition-colors hover:bg-white/[0.025] sm:px-5"
                      >
                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                          {link.label ?? link.kind}
                        </div>
                        <div className="mt-1 break-all text-sm leading-6 text-zinc-300">
                          {link.url}
                        </div>
                      </a>
                    ))
                  ) : (
                    <div className="px-4 py-4 text-sm leading-6 text-zinc-500 sm:px-5">
                      No external links yet. Use the thread to ask the builder for a repo, demo, or
                      X post.
                    </div>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-white/[0.08]">
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
              )}
            </section>

            <div id="conversation" className="scroll-mt-28 space-y-4 px-4 py-4 sm:px-5">
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

            {!manualPost ? (
              <section>
                <SectionHeader id="proof" title="Deep proof">
                  Open this only when the first read leaves a question unanswered. The generated
                  receipt, AI evidence, and raw timeline stay out of the main reading path.
                </SectionHeader>

                <details className="group border-b border-white/[0.08] px-4 py-4 sm:px-5">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-100">
                    <span
                      className="inline-block transition-transform group-open:rotate-90"
                      aria-hidden
                    >
                      &gt;
                    </span>
                    <span className="group-open:hidden">
                      Open generated receipt and AI evidence
                    </span>
                    <span className="hidden group-open:inline">
                      Hide generated receipt and AI evidence
                    </span>
                  </summary>

                  <div className="mt-5 space-y-5">
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
                    <ExplainButton
                      sessionId={sessionRow.id}
                      pathToRevalidate={`/u/${user}/${slug}`}
                      initialExplanation={sessionRow.aiExplanation}
                      canExplain={canExplain}
                    />
                  </div>
                </details>

                {highlightIdxs.length > 0 ? (
                  <div className="border-b border-white/[0.08] px-4 py-3 sm:px-5">
                    <TimelineToggle
                      totalEvents={events.length}
                      highlightCount={highlightIdxs.length}
                    />
                  </div>
                ) : null}

                <details
                  data-timeline-details
                  className="group border-b border-white/[0.08] px-4 py-4 sm:px-5"
                >
                  <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-100">
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
            ) : null}

            {isOwner && !manualPost ? (
              <details className="group border-b border-white/[0.08] px-4 py-4 sm:px-5">
                <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-200">
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
          </div>
          <ReviewRail
            status={sessionRow.receiptStatus}
            eventCount={sessionRow.eventCount}
            duration={duration}
            startedAt={sessionRow.startedAt}
            sharedAt={sessionRow.sharedAt}
            hasLessons={lessonRows.length > 0}
            isManualPost={manualPost}
          />
        </div>
      </main>
    </div>
  );
}
