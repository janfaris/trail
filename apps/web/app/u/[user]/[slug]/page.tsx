import { CommentThread, type ReceiptComment } from "@/components/comment-thread";
import { CopyButton } from "@/components/copy-button";
import { DeletePostButton } from "@/components/delete-post-button";
import { EditPostButton } from "@/components/edit-post-button";
import { ExplainButton } from "@/components/explain-button";
import { FileDiff } from "@/components/file-diff";
import { FollowButton } from "@/components/follow-button";
import { ForkButton } from "@/components/fork-button";
import { ForkButtons } from "@/components/fork-buttons";
import { MakeKitButton } from "@/components/make-kit-button";
import { OpenDetailsOnHash } from "@/components/open-details-on-hash";
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
import { buildPostEditDeadline, canEditManualPost } from "@/lib/build-post-edit";
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
  if (status === "shipped") return "text-[var(--accent-text)]";
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
    <div id={id} className="scroll-mt-24 border-b border-white/[0.08] px-4 py-4 sm:px-5">
      <h2 className="text-[18px] font-medium tracking-[-0.025em] text-zinc-50">{title}</h2>
      <p className="mt-1 max-w-2xl text-[13px] leading-5 text-zinc-500">{children}</p>
    </div>
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
  if (!sessionRow) {
    // Phase 1b — unlisted receipts are link-only. Surface a minimal, noindex
    // preview so a shared link stays readable in chat/DMs without leaking the
    // post into search engines or the public-only OG-image route (which 404s
    // for non-public rows).
    const unlisted = await db.query.trailSession.findFirst({
      where: and(
        eq(schema.trailSession.userId, userRow.id),
        eq(schema.trailSession.slug, slug),
        eq(schema.trailSession.audience, "unlisted"),
        isNotNull(schema.trailSession.sharedAt),
      ),
      columns: { title: true, slug: true, summary: true, visibility: true },
    });
    if (!unlisted || unlisted.visibility === "redacted") return {};
    const unlistedTitle = unlisted.title || unlisted.slug;
    return {
      title: `${unlistedTitle} — @${user} on Trail`,
      description: unlisted.summary || `Unlisted receipt by @${user}`,
      robots: { index: false, follow: false },
    };
  }
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
  // Cache-bust the immutable OG image when the post is edited so social
  // previews refresh instead of serving the pre-edit render.
  const ogVersion = (sessionRow.editedAt ?? sessionRow.sharedAt ?? sessionRow.createdAt).getTime();
  const ogImage = `${base}/api/receipt/${sessionRow.id}/image.png?v=${ogVersion}`;
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
  // Phase 1b — unlisted receipts are link-only: viewable by anyone with the URL
  // but excluded from every public listing (they carry moderation
  // visibility='private', so the listing queries already skip them). Grant
  // access here based on the sharing-scope `audience`. private rows stay
  // owner-only (audience='private' or any non-unlisted non-public row).
  const isUnlistedShared =
    sessionRow.audience === "unlisted" &&
    sessionRow.sharedAt != null &&
    sessionRow.visibility !== "redacted";
  if (!isPubliclyShared && !isUnlistedShared && !isOwner) return notFound();
  const manualPost = isManualBuildPost(sessionRow.postKind);
  // Twitter-style: manual posts are editable by the owner for a short window
  // after publishing, then locked. Server-enforced in editOwnBuildPost.
  const canEdit =
    isOwner && manualPost && isPubliclyShared && canEditManualPost(sessionRow.sharedAt);
  const editableUntil =
    canEdit && sessionRow.sharedAt
      ? buildPostEditDeadline(sessionRow.sharedAt).toISOString()
      : null;

  // X-style author header shows a Follow button. Only look it up for a
  // signed-in viewer who is not the owner (self-follow is impossible).
  let isFollowing = false;
  if (viewer?.user?.id && !isOwner) {
    const followRow = await db.query.follow.findFirst({
      where: and(
        eq(schema.follow.followerId, viewer.user.id),
        eq(schema.follow.followingId, userRow.id),
      ),
      columns: { id: true },
    });
    isFollowing = Boolean(followRow);
  }

  // Build Kit linked to this receipt, if any. Defensive: the build_kit table may
  // not be pushed yet (db:push) — fall back to null so the page never 500s.
  let sessionKit: {
    id: string;
    reproducibility: string;
    reuseCount: number;
    visibility: string;
  } | null = null;
  try {
    const [kitRow] = await db
      .select({
        id: schema.buildKit.id,
        reproducibility: schema.buildKit.reproducibility,
        reuseCount: schema.buildKit.reuseCount,
        visibility: schema.buildKit.visibility,
      })
      .from(schema.buildKit)
      .where(eq(schema.buildKit.sessionId, sessionRow.id))
      .orderBy(desc(schema.buildKit.createdAt))
      .limit(1);
    sessionKit = kitRow ?? null;
  } catch {
    sessionKit = null;
  }

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
  const readerTakeaway = manualPost
    ? (sessionRow.summary ??
      sessionRow.receiptTldr ??
      "Read what was built, open the proof links, then ask the builder a useful question.")
    : (sessionRow.receiptOutcome ??
      sessionRow.receiptTldr ??
      sessionRow.summary ??
      "Skim the outcome, inspect the proof, then decide whether to save, fork, share, or ask the builder a question.");
  const aiReview =
    !sessionRow.redactedAt && isReceiptAiReview(sessionRow.receiptAiReview)
      ? sessionRow.receiptAiReview
      : null;
  const authorDisplayName = userRow.name?.trim() || `@${user}`;
  const authorAvatar = userRow.image ?? githubAvatar(userRow.githubHandle || user);
  const visibleCommentCount = comments.filter((comment) => !comment.deletedAt).length;
  const replyCount = comments.filter((comment) => comment.parentId && !comment.deletedAt).length;
  const headerLabel = manualPost ? "Build post" : "Receipt";

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
  const manualProofNote = manualPost ? sessionRow.manualProofNote?.trim() || null : null;
  const proofLinkCount = buildPostLinks.length;
  const hasManualProof = proofLinkCount > 0 || Boolean(manualProofNote);
  const verdict = aiReview
    ? reviewVerdictLabel(aiReview.verdict)
    : manualPost
      ? "Build post"
      : statusLabel(sessionRow.receiptStatus);

  // Compact "proof strip" facts — one line under the post that preserves the
  // trust signals the old right-rail used to carry (status, events, runtime).
  const proofChips: string[] = (
    manualPost
      ? [
          proofLinkCount > 0
            ? `${formatCount(proofLinkCount)} proof link${proofLinkCount === 1 ? "" : "s"}`
            : null,
          manualProofNote ? "proof note" : null,
          proofLinkCount === 0 && !manualProofNote ? "builder-written" : null,
        ]
      : [
          `${formatCount(sessionRow.eventCount)} event${sessionRow.eventCount === 1 ? "" : "s"}`,
          changedFiles.length > 0
            ? `${formatCount(changedFiles.length)} file${changedFiles.length === 1 ? "" : "s"}`
            : null,
          lessonRows.length > 0
            ? `${formatCount(lessonRows.length)} lesson${lessonRows.length === 1 ? "" : "s"}`
            : null,
          duration ? duration : null,
        ]
  ).filter((chip): chip is string => Boolean(chip));

  const proofHref = manualPost ? (hasManualProof ? "#reuse" : null) : "#proof";

  return (
    <div className="min-h-screen bg-[var(--surface-deep)] text-zinc-50">
      <SiteNav currentPath="/feed" />
      <OpenDetailsOnHash />

      <main className="mx-auto w-full max-w-[640px] px-0 sm:px-4">
        <article className="min-h-[calc(100vh-3.5rem)] border-white/[0.08] bg-[var(--surface-deep)] sm:border-x">
          {/* Thin X-style header. Not sticky on mobile to avoid stacking under
              the SiteNav (repo guidance: no double sticky bars on mobile). */}
          <div className="z-30 flex items-center justify-between gap-3 border-b border-white/[0.08] bg-[var(--surface-deep)]/90 px-4 py-3 backdrop-blur-xl md:sticky md:top-14">
            <Link
              href="/feed"
              className="inline-flex min-w-0 items-center gap-2 text-[14px] font-medium text-zinc-300 transition-colors hover:text-zinc-100"
            >
              <span aria-hidden className="text-zinc-500">
                ←
              </span>
              <span className="truncate">{headerLabel}</span>
            </Link>
            {isOwner ? (
              <div className="flex shrink-0 items-center gap-1.5">
                <Link
                  href="/dashboard"
                  className="inline-flex min-h-8 items-center rounded-full px-2.5 text-[13px] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
                >
                  Studio
                </Link>
                {canEdit && editableUntil ? (
                  <EditPostButton
                    sessionId={sessionRow.id}
                    initialTitle={sessionRow.title ?? ""}
                    initialSummary={sessionRow.summary ?? ""}
                    editableUntil={editableUntil}
                  />
                ) : null}
                <DeletePostButton
                  sessionId={sessionRow.id}
                  handle={userRow.handle ?? user}
                  isManualPost={manualPost}
                />
              </div>
            ) : null}
          </div>

          {/* Post hero — author, the take, optional media, proof strip. */}
          <div className="border-b border-white/[0.08] px-4 py-5 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/u/${user}`} className="group inline-flex min-w-0 items-center gap-3">
                <Avatar
                  src={authorAvatar}
                  alt={authorDisplayName}
                  size={44}
                  fallback={user}
                  className="shrink-0"
                />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-zinc-100 group-hover:text-white">
                    {authorDisplayName}
                  </span>
                  <span className="block truncate font-mono text-[12px] text-zinc-500">
                    @{user}
                  </span>
                </span>
              </Link>
              {isOwner ? null : viewer?.user?.id ? (
                <FollowButton targetUserId={userRow.id} initialFollowing={isFollowing} />
              ) : (
                <Link
                  href={signInHref(`/u/${user}/${slug}`)}
                  className="inline-flex min-h-9 shrink-0 items-center rounded-full border border-[var(--accent-border)] bg-[var(--accent)] px-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--on-accent)] transition-colors hover:bg-[var(--accent-bright)]"
                >
                  Follow
                </Link>
              )}
            </div>

            <h1 className="mt-4 text-pretty text-[23px] font-semibold leading-snug tracking-[-0.025em] text-zinc-50 sm:text-[27px]">
              {title}
            </h1>
            <p className="mt-3 max-w-2xl whitespace-pre-line text-[15px] leading-7 text-zinc-300">
              {readerTakeaway}
            </p>

            {sessionRow.previewImageUrl ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900">
                <img
                  src={sessionRow.previewImageUrl}
                  alt={title}
                  loading="lazy"
                  className="max-h-[26rem] w-full object-cover"
                />
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-zinc-600">
              <ToolIcon name={sessionRow.tool} className="text-zinc-500" />
              <span className="text-zinc-400">{sessionRow.tool}</span>
              {sessionRow.repo ? (
                <>
                  <span className="text-zinc-700">·</span>
                  <span className="truncate text-zinc-500">{sessionRow.repo}</span>
                </>
              ) : null}
              <span className="text-zinc-700">·</span>
              <span>
                Published <RelativeTime date={sessionRow.sharedAt ?? sessionRow.startedAt} />
              </span>
              {sessionRow.editedAt ? <span className="text-zinc-700">· edited</span> : null}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-xl border border-white/[0.08] bg-black/30 px-3.5 py-2.5 text-[12px] text-zinc-500">
              <span
                className={`font-mono text-[11px] font-medium tabular-nums ${
                  manualPost
                    ? "text-zinc-300"
                    : statusClass(aiReview?.verdict ?? sessionRow.receiptStatus)
                }`}
              >
                {verdict}
              </span>
              {proofChips.map((chip) => (
                <span key={chip} className="flex items-center gap-2.5">
                  <span aria-hidden className="text-zinc-700">
                    ·
                  </span>
                  <span>{chip}</span>
                </span>
              ))}
              {sessionRow.linkedRepo && sessionRow.linkedCommitSha ? (
                <span className="flex items-center gap-2.5">
                  <span aria-hidden className="text-zinc-700">
                    ·
                  </span>
                  <a
                    href={`https://github.com/${sessionRow.linkedRepo}/commit/${sessionRow.linkedCommitSha}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-mono text-[11px] text-[var(--accent-text)] transition-colors hover:text-zinc-100"
                  >
                    {sessionRow.linkedCommitSha.slice(0, 7)}
                  </a>
                </span>
              ) : null}
              {proofHref ? (
                <a
                  href={proofHref}
                  className="ml-auto font-mono text-[11px] uppercase tracking-[0.1em] text-zinc-500 transition-colors hover:text-[var(--accent-text)]"
                >
                  View proof →
                </a>
              ) : null}
            </div>
          </div>

          {/* Engagement bar — one consistent row of social verbs. */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.08] px-3 py-2 sm:px-4">
            <ReactionBar slug={slug} authorHandle={userRow.handle} variant="inline" />
            <a
              href="#conversation"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
            >
              <span aria-hidden>💬</span>
              <span className="tabular-nums">
                {visibleCommentCount > 0 ? formatCount(visibleCommentCount) : "Reply"}
              </span>
            </a>
            {isPubliclyShared ? (
              <SaveReceiptButton
                sessionId={sessionRow.id}
                initialSaved={Boolean(savedRow)}
                signedIn={Boolean(viewer?.user?.id)}
                signInHref={signInHref(`/u/${user}/${slug}`)}
                className="border-transparent bg-transparent normal-case tracking-normal text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
              />
            ) : null}
            {!manualPost ? (
              <ForkButton user={user} slug={slug} title={sessionRow.title ?? slug} />
            ) : null}
            <CopyButton
              value={fullUrl}
              label="Copy"
              copiedLabel="Copied"
              className="min-h-8 rounded-full border-transparent bg-transparent px-2.5 text-[13px] normal-case tracking-normal text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
            />
            <a
              href={tweetIntent(
                `${title} - a Trail ${manualPost ? "build post" : "receipt"} by @${user}`,
                fullUrl,
              )}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-8 items-center rounded-full px-2.5 text-[13px] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
            >
              Share
            </a>
          </div>

          {/* Steal this build — the reframe's primary utility surface. Either a
              link to the existing kit, or an owner affordance to make one from
              the linked repo. Hidden when there's neither a kit nor a repo. */}
          {sessionKit && (sessionKit.visibility === "public" || isOwner) ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[var(--accent)]/[0.04] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-zinc-100">Steal this build</div>
                <div className="text-[12px] text-zinc-500">
                  Rules + stack + prompts ·{" "}
                  <span className="font-mono tabular-nums">
                    {formatCount(sessionKit.reuseCount)}
                  </span>{" "}
                  {sessionKit.reuseCount === 1 ? "fork" : "forks"}
                </div>
              </div>
              <Link
                href={`/kit/${sessionKit.id}`}
                className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-[var(--accent)] px-3.5 text-[13px] font-medium text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[var(--accent-bright)] active:scale-[0.97]"
              >
                Open Build Kit →
              </Link>
            </div>
          ) : isOwner && !manualPost && sessionRow.linkedRepo ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-zinc-100">
                  Make this build stealable
                </div>
                <div className="text-[12px] text-zinc-500">
                  Capture the rules + stack from{" "}
                  <span className="font-mono">{sessionRow.linkedRepo}</span> as a Build Kit.
                </div>
              </div>
              <MakeKitButton
                repo={sessionRow.linkedRepo}
                sessionId={sessionRow.id}
                signedIn={Boolean(viewer?.user?.id)}
                signInHref={signInHref(`/u/${user}/${slug}`)}
              />
            </div>
          ) : null}

          {/* Conversation — sits right under the post, X-style. */}
          <div id="conversation" className="scroll-mt-24 space-y-4 px-4 py-4 sm:px-5">
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

          {/* Lessons stay visible — this is Trail's "post + proof artifact"
              value. Trimmed to a lighter card; deep audit lives below. */}
          {lessonRows.length > 0 ? (
            <section className="border-t border-white/[0.08]">
              <SectionHeader id="lessons" title="What can I steal?">
                Reusable moves Trail extracted from this session. Copy one straight into your agent
                or save it for later.
              </SectionHeader>
              <div className="divide-y divide-white/[0.08]">
                {lessonRows.map((lesson, index) => (
                  <article key={lesson.id} className="px-4 py-5 sm:px-5">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] text-zinc-600">
                      <span>Lesson {String(index + 1).padStart(2, "0")}</span>
                      <span>
                        <span className="font-mono text-zinc-300">
                          {lesson.transferabilityScore}/5
                        </span>{" "}
                        transferable
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
                    <div className="mt-3 border-l border-[var(--accent-border)]/30 pl-3">
                      <div className="text-[12px] text-zinc-600">What to steal</div>
                      <p className="mt-1 text-[14px] leading-6 text-zinc-300">
                        {lesson.whatToSteal}
                      </p>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="border-l border-white/10 pl-3">
                        <div className="text-[12px] text-zinc-600">Use when</div>
                        <p className="mt-1 text-[13px] leading-5 text-zinc-400">{lesson.useWhen}</p>
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
                    <div className="mt-4 flex flex-wrap items-center gap-2">
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
                        className="inline-flex min-h-8 items-center rounded-full px-2.5 text-[13px] text-zinc-600 transition-colors hover:bg-white/[0.04] hover:text-zinc-200"
                      >
                        Discuss
                      </a>
                    </div>
                    {[...(lesson.stack ?? []), ...(lesson.tags ?? [])].length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-zinc-700">
                        {[...(lesson.stack ?? []), ...(lesson.tags ?? [])]
                          .slice(0, 5)
                          .map((tag) => (
                            <span key={tag}>#{tag}</span>
                          ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {/* Manual build posts: lightweight proof (note + links), visible. */}
          {manualPost && hasManualProof ? (
            <section className="border-t border-white/[0.08]">
              <SectionHeader id="reuse" title="Proof">
                Open the source, demo, or social post the builder attached, then bring feedback back
                to the thread.
              </SectionHeader>
              <div className="divide-y divide-white/[0.08]">
                {manualProofNote ? (
                  <div className="px-4 py-4 sm:px-5">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                      Proof note
                    </div>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">{manualProofNote}</p>
                  </div>
                ) : null}
                {buildPostLinks.map((link) => (
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
                    <div className="mt-1 break-all text-sm leading-6 text-zinc-300">{link.url}</div>
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          {/* Deep proof — collapsed by default. The full audit trail: reuse,
              generated receipt, AI evidence, and the raw timeline. */}
          {!manualPost ? (
            <section className="border-t border-white/[0.08]">
              <SectionHeader id="proof" title="Deep proof">
                Open this only when the first read leaves a question unanswered — reuse, the
                generated receipt, AI evidence, and the raw timeline live here.
              </SectionHeader>

              <details className="group border-b border-white/[0.08] px-4 py-4 sm:px-5">
                <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-100">
                  <span
                    className="inline-block transition-transform group-open:rotate-90"
                    aria-hidden
                  >
                    &gt;
                  </span>
                  <span className="group-open:hidden">Reuse this build</span>
                  <span className="hidden group-open:inline">Hide reuse</span>
                </summary>
                <div className="mt-5 divide-y divide-white/[0.08]">
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
              </details>

              <details className="group border-b border-white/[0.08] px-4 py-4 sm:px-5">
                <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-100">
                  <span
                    className="inline-block transition-transform group-open:rotate-90"
                    aria-hidden
                  >
                    &gt;
                  </span>
                  <span className="group-open:hidden">Open generated receipt and AI evidence</span>
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
                        <div key={e.id} id={`event-${e.idx}`} className="scroll-mt-24">
                          <FileDiff path={ev.path} before={ev.before} after={ev.after} />
                        </div>
                      );
                    }
                    return (
                      <div key={e.id} id={`event-${e.idx}`} className="scroll-mt-24">
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
        </article>
      </main>
    </div>
  );
}
