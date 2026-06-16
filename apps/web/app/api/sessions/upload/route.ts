import { randomUUID } from "node:crypto";
import { db, schema } from "@/db/client";
import { auth } from "@/lib/auth";
import { type PriceSnapshot, computeCostUsd, lookupModelPrice } from "@/lib/cost/price-lookup";
import { deriveTitle } from "@/lib/derive-title";
import { generateSessionEmbedding, toVectorLiteral } from "@/lib/embeddings";
import { resolvePullRequest } from "@/lib/github-verify";
import { flagSensitive, generateSessionMeta } from "@/lib/openai";
import { checkPaywall } from "@/lib/paywall";
import { promoteSessionToPublicReceipt } from "@/lib/public-receipt-publishing";
import { ensureReceipt } from "@/lib/receipt-generator";
import {
  computeDurationSeconds,
  countDistinctFiles,
  countFailedToolCalls,
  countPrompts,
  extractLanguages,
  extractToolCallCounts,
} from "@/lib/session-metrics";
import { extractSessionTags } from "@/lib/tags";
import { anonymize } from "@trail/anonymize";
import type { UploadSessionResponse } from "@trail/client";
import { Session as SessionSchema } from "@trail/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

// Week 4 — cost-per-PR pivot. Path A of the attribution engine reads
// trail_session.estimated_cost_usd as the "native" baseline, so the upload
// route is responsible for populating it whenever the CLI emits per-event
// token counts AND we know the model + vendor. We only do this for tools
// that publish per-token usage natively: claude-code (Anthropic), codex
// (OpenAI). Cursor uses Claude under the hood but doesn't surface per-event
// token splits in our event stream (v1: skip). copilot-cli / copilot-chat /
// hermes / aider / opencode / continue / windsurf / zed / cline have no
// per-token data either — skip them all, the fanout path attributes those.
const COST_ELIGIBLE_TOOL_VENDOR: Record<string, "anthropic" | "openai"> = {
  "claude-code": "anthropic",
  claude: "anthropic",
  codex: "openai",
};
type UploadVisibility = NonNullable<UploadSessionResponse["visibility"]>;
type ShareAudience = NonNullable<UploadSessionResponse["audience"]>;

function normalizeModelId(raw: string): string {
  // Strip leading vendor prefixes ("anthropic/claude-sonnet-4-5" →
  // "claude-sonnet-4-5") and trailing date suffixes ("...-20250101" →
  // "..."). lookupModelPrice's prefix-match fallback will catch the
  // date-suffix case anyway, but normalizing here keeps logs readable.
  let m = raw.trim();
  m = m.replace(/^(anthropic|openai)\//, "");
  m = m.replace(/-\d{8}$/, "");
  return m;
}

async function computeSessionCost(
  tool: string,
  models: string[] | null,
  tokens: {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheCreationInputTokens: number | null;
    cacheReadInputTokens: number | null;
  },
): Promise<{ estimatedCostUsd: number; modelPriceSnapshot: PriceSnapshot } | null> {
  const vendor = COST_ELIGIBLE_TOOL_VENDOR[tool];
  if (!vendor) return null;

  if (!models || models.length === 0) return null;
  const firstRaw = models.find((m) => m && m.trim().length > 0);
  if (!firstRaw) return null;
  const modelId = normalizeModelId(firstRaw);
  if (!modelId) return null;

  if (tokens.inputTokens == null && tokens.outputTokens == null) return null;

  const snapshot = await lookupModelPrice(vendor, modelId);
  if (!snapshot) {
    console.warn(`upload-cost: unknown model ${modelId} for vendor ${vendor}`);
    return null;
  }

  const cacheCreation = tokens.cacheCreationInputTokens ?? 0;
  const cacheRead = tokens.cacheReadInputTokens ?? 0;
  const inputTotal = tokens.inputTokens ?? 0;
  // input_tokens is the FULL input (uncached + cached). Subtract the cached
  // portions to isolate the priced-at-base-rate slice. clamp >= 0 because
  // CLI clients occasionally emit slightly inconsistent splits.
  const uncachedInputTokens = Math.max(0, inputTotal - cacheRead - cacheCreation);

  const estimatedCostUsd = computeCostUsd(
    {
      uncachedInputTokens,
      cacheCreationInputTokens: cacheCreation,
      cacheReadInputTokens: cacheRead,
      outputTokens: tokens.outputTokens ?? 0,
    },
    snapshot,
  );

  return { estimatedCostUsd, modelPriceSnapshot: snapshot };
}

function genSlug() {
  return Math.random().toString(36).slice(2, 10);
}

function genId() {
  return crypto.randomUUID();
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: "database unavailable" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = SessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid session", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  // Defense-in-depth: even if the CLI forgot to scrub, we scrub server-side too.
  const { session: s, report: redactionReport } = anonymize(parsed.data);

  // Phase 0 trust gate. If the scrubbed payload still contains high-entropy
  // tokens or the LLM flag fires, hold the session in pending-review state
  // rather than publishing immediately. The owner can confirm later.
  const allowSuspects = req.headers.get("x-trail-allow-suspects")?.toLowerCase() === "true";

  // Phase 2 — GitHub linkage headers, populated by `trail share` from the
  // git remote + HEAD. All optional; treat as opaque strings + light sanity
  // checks. We never trust these for auth — just for display on the page.
  const linkedRepoHdr = req.headers.get("x-trail-linked-repo");
  const linkedCommitHdr = req.headers.get("x-trail-linked-commit");
  const linkedRepo =
    linkedRepoHdr && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(linkedRepoHdr)
      ? linkedRepoHdr
      : null;
  const linkedCommitSha =
    linkedCommitHdr && /^[a-f0-9]{7,40}$/i.test(linkedCommitHdr) ? linkedCommitHdr : null;
  const entropyReasons =
    redactionReport.suspects.length > 0 && !allowSuspects
      ? [
          `entropy guard found ${redactionReport.suspects.length} suspicious token(s) — ${redactionReport.suspects
            .slice(0, 3)
            .map((s) => `${s.location} (~${s.entropy} bits)`)
            .join(", ")}`,
        ]
      : [];
  const flag = await flagSensitive(s).catch(() => null);
  const flagReasons = flag?.has_sensitive ? flag.reasons : [];
  const pendingReasons = [...entropyReasons, ...flagReasons];
  const visibility: UploadVisibility = pendingReasons.length > 0 ? "pending" : "public";

  // Phase 1b — sharing scope (audience) is orthogonal to the moderation
  // `visibility` axis. public = listed; unlisted = link-only (hidden from every
  // public listing); private = owner-only. Legacy clients send
  // `x-trail-visibility: private`; map that to audience=private for back-compat.
  const audienceHeader = req.headers.get("x-trail-audience")?.toLowerCase();
  const legacyPrivate = req.headers.get("x-trail-visibility")?.toLowerCase() === "private";
  const desiredAudience: ShareAudience =
    audienceHeader === "unlisted" || audienceHeader === "team"
      ? "unlisted"
      : audienceHeader === "private" || legacyPrivate
        ? "private"
        : "public";

  // Task 7 — paywall gate. Free plan: max 3 public receipts, no private.
  // Pending/redacted are not counted. Pro is unlimited. Non-public audiences
  // (unlisted/private) route through the private bucket (pro-only), so free
  // workspaces can't use --team/--unlisted/--private. This is a fast-fail
  // check; intended-public uploads are enforced again when promoted after
  // receipt generation under the per-user quota lock.
  const publishAfterReceipt = desiredAudience === "public" && pendingReasons.length === 0;
  // Moderation visibility actually persisted at insert, plus the initial
  // shared_at:
  //  - public  : staged 'private' then promoted to 'public' after the receipt
  //              passes the locked quota gate (promote sets shared_at); flagged
  //              uploads are held 'pending'.
  //  - unlisted: live immediately via shared_at while moderation visibility
  //              stays 'private' (so it never enters a public listing); flagged
  //              uploads are held 'pending' with no shared_at until reviewed.
  //  - private : owner-only, never shared.
  let initialVisibility: UploadVisibility;
  let initialSharedAt: Date | null = null;
  if (desiredAudience === "public") {
    initialVisibility = publishAfterReceipt ? "private" : visibility;
  } else if (desiredAudience === "unlisted") {
    initialVisibility = pendingReasons.length > 0 ? "pending" : "private";
    initialSharedAt = pendingReasons.length > 0 ? null : new Date();
  } else {
    initialVisibility = "private";
  }
  const paywallVisibility: UploadVisibility = desiredAudience === "public" ? visibility : "private";
  const paywall = await checkPaywall(session.user.id, { visibility: paywallVisibility });
  if (!paywall.allowed) {
    const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
    return NextResponse.json(
      {
        error: "paywall",
        reason: paywall.reason,
        publicCount: paywall.publicCount,
        limit: paywall.limit,
        upgradeUrl: `${baseUrl}/pricing`,
      },
      { status: 402 },
    );
  }

  const userRow = await db.query.user.findFirst({ where: eq(schema.user.id, session.user.id) });
  if (!userRow?.handle) {
    return NextResponse.json({ error: "user has no handle" }, { status: 400 });
  }

  // Free-tier quota gate: 200 sessions per rolling 30 days. Pro/Team uncapped.
  // We count distinct trail_session rows owned by this user in the window.
  // Counting at insert time (not via a trigger) keeps the schema simple and
  // gives us a precise 409 error path for the CLI to surface to users.
  if (userRow.plan === "free") {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const countRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.trailSession)
      .where(
        and(
          eq(schema.trailSession.userId, session.user.id),
          gte(schema.trailSession.createdAt, since),
        ),
      );
    const current = Number(countRows[0]?.c ?? 0);
    const FREE_LIMIT = 200;
    if (current >= FREE_LIMIT) {
      return NextResponse.json(
        {
          error: "free_tier_session_cap",
          message: `Free tier stores up to ${FREE_LIMIT} sessions per 30 days. Upgrade for unlimited or wait for older sessions to roll off.`,
          upgrade_url: "https://gettrail.vercel.app/pricing",
          current_count: current,
          limit: FREE_LIMIT,
          window_days: 30,
        },
        { status: 409 },
      );
    }
  }

  const slug = s.shareSlug || genSlug();
  const sessionId = genId();

  const firstPrompt = s.events.find((e) => e.kind === "prompt")?.text;
  const heuristicTitle = deriveTitle(firstPrompt, s.id.slice(0, 8));

  // Best-effort AI title + summary. Failures fall back silently to heuristic.
  const prompts = s.events
    .filter(
      (e): e is typeof e & { text: string } => e.kind === "prompt" && typeof e.text === "string",
    )
    .slice(0, 3)
    .map((e) => e.text);
  const lastEventKinds = s.events.slice(-3).map((e) => e.kind);
  const ai = prompts.length > 0 ? await generateSessionMeta(prompts, lastEventKinds) : null;

  // Best-effort metrics. Bad data shouldn't block upload.
  let languages: Record<string, number> | null = null;
  let durationSeconds: number | null = null;
  let toolCallCounts: Record<string, number> | null = null;
  let distinctFiles: number | null = null;
  let promptCount: number | null = null;
  let failedToolCalls: number | null = null;
  try {
    const ev = s.events as Array<{ kind: string; payload?: unknown; at: string | Date }>;
    languages = extractLanguages(ev);
    durationSeconds = computeDurationSeconds(
      new Date(s.startedAt),
      s.endedAt ? new Date(s.endedAt) : null,
      ev,
    );
    toolCallCounts = extractToolCallCounts(ev);
    distinctFiles = countDistinctFiles(ev);
    promptCount = countPrompts(ev);
    failedToolCalls = countFailedToolCalls(ev);
  } catch (err) {
    console.error("[upload] metrics failed:", (err as Error).message);
  }

  // Week 0 cost-per-PR pivot. Sum per-event token counts into trail_session
  // top-level columns at insert time (one-shot, not derived live). If EVERY
  // event has a null value for a field, the session total stays NULL so
  // pre-token-aware CLI clients don't appear as "0 tokens used" — that
  // would be indistinguishable from "the model returned no output".
  // cache_creation and cache_read are summed together at the session level
  // (the column is `cached_tokens`); the per-event split is preserved on
  // the event table for the future cost calculator.
  const sumOrNull = (
    pick: (e: (typeof s.events)[number]) => number | null | undefined,
  ): number | null => {
    let total = 0;
    let sawValue = false;
    for (const e of s.events) {
      const v = pick(e);
      if (typeof v === "number" && Number.isFinite(v)) {
        total += v;
        sawValue = true;
      }
    }
    return sawValue ? total : null;
  };
  const inputTokensTotal = sumOrNull((e) => ("inputTokens" in e ? e.inputTokens : null));
  const outputTokensTotal = sumOrNull((e) => ("outputTokens" in e ? e.outputTokens : null));
  // Sum cache_creation and cache_read independently first (we need the split
  // for the cost calc, since they price at different rates). The legacy
  // cachedTokens column on trail_session stores their sum — schema doesn't
  // have separate cached_creation / cached_read columns.
  const cacheCreationTokensTotal = sumOrNull((e) =>
    "cacheCreationInputTokens" in e ? e.cacheCreationInputTokens : null,
  );
  const cacheReadTokensTotal = sumOrNull((e) =>
    "cacheReadInputTokens" in e ? e.cacheReadInputTokens : null,
  );
  const cachedTokensTotal =
    cacheCreationTokensTotal == null && cacheReadTokensTotal == null
      ? null
      : (cacheCreationTokensTotal ?? 0) + (cacheReadTokensTotal ?? 0);

  // Models — prefer ground-truth from per-event `model` fields (set by the
  // parser from the tool's own JSONL). Only fall back to the LLM-inferred
  // `ai.models` if events carry no model — older parsers (or sessions with
  // partial token capture) won't have it.
  const eventModels = Array.from(
    new Set(
      s.events
        .map((e) => ("model" in e && typeof e.model === "string" ? e.model : null))
        .filter((m): m is string => m != null && m.length > 0),
    ),
  );
  const aiModels =
    eventModels.length > 0 ? eventModels : ai?.models && ai.models.length > 0 ? ai.models : null;
  let costResult: Awaited<ReturnType<typeof computeSessionCost>> = null;
  try {
    costResult = await computeSessionCost(s.tool, aiModels, {
      inputTokens: inputTokensTotal,
      outputTokens: outputTokensTotal,
      cacheCreationInputTokens: cacheCreationTokensTotal,
      cacheReadInputTokens: cacheReadTokensTotal,
    });
  } catch (err) {
    console.error("[upload] cost computation failed:", (err as Error).message);
  }

  // Look up the session owner's GitHub OAuth access token from better-auth's
  // account table. This token is what `resolvePullRequest` uses to query the
  // GitHub API — running the lookup as the session owner means each user only
  // sees PRs in repos they themselves have access to (public repos, plus any
  // private repos they're a member of if they granted `repo` scope). A single
  // shared bot token does NOT scale — it would have zero access to other
  // users' private repos. Falls back to GITHUB_TOKEN env when the account
  // row is missing (shouldn't happen — users sign in via GitHub OAuth — but
  // keeps the path defensible in tests/dev).
  let githubUserToken: string | null = null;
  if (linkedRepo && linkedCommitSha) {
    const ghAccount = await db.query.account.findFirst({
      where: (a, { and, eq }) => and(eq(a.userId, session.user.id), eq(a.providerId, "github")),
      columns: { accessToken: true },
    });
    githubUserToken = ghAccount?.accessToken ?? null;
  }
  const linkedPrUrl =
    linkedRepo && linkedCommitSha
      ? await resolvePullRequest(linkedRepo, linkedCommitSha, githubUserToken)
      : null;

  await db.insert(schema.trailSession).values({
    id: sessionId,
    userId: session.user.id,
    slug,
    tool: s.tool,
    repo: s.repo,
    summary: ai?.summary ?? s.summary,
    title: ai?.title ?? heuristicTitle,
    eventCount: s.events.length,
    startedAt: new Date(s.startedAt),
    endedAt: s.endedAt ? new Date(s.endedAt) : null,
    languages: languages && Object.keys(languages).length > 0 ? languages : null,
    durationSeconds,
    toolCallCounts:
      toolCallCounts && Object.keys(toolCallCounts).length > 0 ? toolCallCounts : null,
    distinctFiles,
    promptCount,
    failedToolCalls,
    visibility: initialVisibility,
    audience: desiredAudience,
    sharedAt: initialSharedAt,
    pendingReviewReasons: pendingReasons.length > 0 ? pendingReasons : null,
    toolsUsed: ai?.tools_used && ai.tools_used.length > 0 ? ai.tools_used : null,
    frameworks: ai?.frameworks && ai.frameworks.length > 0 ? ai.frameworks : null,
    models: aiModels,
    taskType: ai?.task_type ?? null,
    // Auto-infer "shipped" when the LLM didn't tag it but the session has
    // strong signals: a linked git commit (recorded from inside a repo) or a
    // sustained run (≥20 events ≈ real work, not a one-shot question). This
    // keeps the recruiter view populated without requiring per-session
    // curation. Owners can override from /dashboard.
    outcome: ai?.outcome ?? (linkedCommitSha || s.events.length >= 20 ? "shipped" : null),
    linkedRepo,
    linkedCommitSha,
    linkedPrUrl,
    inputTokens: inputTokensTotal,
    outputTokens: outputTokensTotal,
    cachedTokens: cachedTokensTotal,
    estimatedCostUsd: costResult != null ? costResult.estimatedCostUsd.toFixed(4) : null,
    modelPriceSnapshot: costResult?.modelPriceSnapshot ?? null,
  });

  // Project this session's LLM taxonomy into the normalized session_tag corpus
  // that powers the 60-day /tools/[slug] and /frameworks/[slug] entity pages.
  // sessionId is freshly minted per upload (genId above), so a plain insert is
  // safe — there are no stale rows to clear. The backfill script is the
  // re-runnable path that uses delete+reinsert. Visibility is intentionally not
  // copied here; entity-page queries join trail_session and filter at read time.
  const sessionTags = extractSessionTags({
    tool: s.tool,
    toolsUsed: ai?.tools_used ?? null,
    frameworks: ai?.frameworks ?? null,
    models: aiModels,
  });
  if (sessionTags.length > 0) {
    // Tag projection is non-critical metadata; never fail an otherwise-good
    // upload because of it. The backfill script repairs any gaps.
    try {
      await db.insert(schema.sessionTag).values(
        sessionTags.map((t) => ({
          id: genId(),
          sessionId,
          tag: t.tag,
          label: t.label,
          kind: t.kind,
          confidence: t.confidence.toFixed(3),
          source: t.source,
        })),
      );
    } catch (err) {
      console.error("[upload] session_tag insert failed", { sessionId, err });
    }
  }

  // Insert a `native` attribution row whenever we computed a session-native
  // cost from per-event tokens. This is Path A of the cost attribution
  // engine — owner-priced, no vendor-fanout required. The dashboard
  // aggregator reads from session_cost_attribution, so without this row
  // sessions never show up in /dashboard/cost even when estimated_cost_usd
  // is populated. Idempotent via the (session_id, source, vendor_bucket_id)
  // unique index — re-uploading the same session won't double-attribute.
  if (costResult != null && costResult.estimatedCostUsd > 0) {
    await db
      .insert(schema.sessionCostAttribution)
      .values({
        id: randomUUID(),
        sessionId,
        userId: session.user.id,
        source: "native",
        vendorBucketId: null,
        attributedCostUsd: costResult.estimatedCostUsd.toFixed(6),
        attributionMethod: "session_native",
      })
      .onConflictDoNothing();
  }

  if (s.events.length > 0) {
    await db.insert(schema.event).values(
      s.events.map((e, i) => ({
        id: genId(),
        sessionId,
        idx: i,
        kind: e.kind,
        at: new Date(e.at),
        data: e as unknown as Record<string, unknown>,
        // Tokens are duplicated here (event.data carries the whole event
        // object too) so analytics queries can stay on indexable columns
        // and never have to crack open the jsonb blob.
        inputTokens: "inputTokens" in e ? (e.inputTokens ?? null) : null,
        outputTokens: "outputTokens" in e ? (e.outputTokens ?? null) : null,
        cacheCreationInputTokens:
          "cacheCreationInputTokens" in e ? (e.cacheCreationInputTokens ?? null) : null,
        cacheReadInputTokens: "cacheReadInputTokens" in e ? (e.cacheReadInputTokens ?? null) : null,
        model: "model" in e ? (e.model ?? null) : null,
      })),
    );
  }

  // Best-effort embedding. Failure is non-fatal (search just won't index this one).
  try {
    const finalTitle = ai?.title ?? heuristicTitle;
    const finalSummary = ai?.summary ?? s.summary ?? "";
    const embedding = await generateSessionEmbedding(finalTitle, finalSummary, prompts);
    if (embedding) {
      const lit = toVectorLiteral(embedding);
      await db
        .update(schema.trailSession)
        .set({ embedding: sql`${lit}::vector` })
        .where(eq(schema.trailSession.id, sessionId));
    }
  } catch (err) {
    console.error("[upload] embedding failed:", (err as Error).message);
  }

  // Share flow: generate the receipt artifact (LLM copy + verification).
  // Best-effort; failures must not block the upload response. ensureReceipt
  // is idempotent — safe to call on every upload.
  let receiptStatus: "shipped" | "draft" | "unverified" | undefined;
  let persistedVisibility: UploadVisibility = initialVisibility;
  let publishBlockedReason: "quota_or_state" | "receipt_failed" | undefined;
  try {
    await ensureReceipt(sessionId);
    const fresh = await db.query.trailSession.findFirst({
      where: eq(schema.trailSession.id, sessionId),
      columns: { receiptGeneratedAt: true, receiptStatus: true },
    });
    const s = fresh?.receiptStatus;
    if (s === "shipped" || s === "draft" || s === "unverified") {
      receiptStatus = s;
    }
    if (publishAfterReceipt) {
      if (fresh?.receiptGeneratedAt) {
        const promoted = await promoteSessionToPublicReceipt({
          databaseUrl,
          userId: session.user.id,
          sessionId,
        });
        if (promoted.published) {
          persistedVisibility = "public";
        } else {
          publishBlockedReason = "quota_or_state";
        }
      } else {
        publishBlockedReason = "receipt_failed";
      }
    }
  } catch (err) {
    console.error("[upload] receipt generation failed:", (err as Error).message);
    if (publishAfterReceipt) {
      publishBlockedReason = "receipt_failed";
    }
  }

  const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const response: UploadSessionResponse & {
    redactionsApplied?: number;
  } = {
    url: `${baseUrl}/u/${userRow.handle}/${slug}`,
    slug,
    receiptStatus,
    // Report the visibility we actually persisted. Intended-public uploads are
    // first staged privately, then promoted only after receipt generation passes
    // the locked quota gate.
    visibility: persistedVisibility,
    // Phase 1b — echo the sharing scope so the CLI prints accurate post-share
    // guidance (unlisted = link-only, private = owner-only) instead of assuming
    // public.
    audience: desiredAudience,
    pendingReviewReasons: pendingReasons.length > 0 ? pendingReasons : undefined,
    publishBlockedReason,
    profileUrl: `${baseUrl}/u/${userRow.handle}`,
    redactionsApplied: redactionReport.total,
  };
  return NextResponse.json(response);
}
