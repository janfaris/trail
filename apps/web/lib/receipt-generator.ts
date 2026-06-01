import { asc, eq, sql } from "drizzle-orm";
import { db, schema } from "../db/client";
import { aiClient, textModel } from "./ai-client";
import { verifyShipped } from "./github-verify";
import { createReceiptAiReview } from "./receipt-ai-review";
import { buildTranscript, parseLlmReceipt } from "./receipt-parse";
import { buildReceiptSystemPrompt, loadToneSpec } from "./receipt-prompt";
import { type ReceiptDraft, validateReceipt } from "./receipt-validator";

export const RECEIPT_STATUS = {
  Shipped: "shipped",
  Draft: "draft",
  Unverified: "unverified",
} as const;

export type ReceiptStatus = (typeof RECEIPT_STATUS)[keyof typeof RECEIPT_STATUS];

export type ReceiptGenerationResult =
  | { ok: true; sessionId: string; status: ReceiptStatus; warnings: string[] }
  | {
      ok: false;
      sessionId: string;
      reason:
        | "no-ai-client"
        | "not-found"
        | "no-events"
        | "no-llm-content"
        | "llm-invalid-json"
        | "exception";
      message?: string;
    };

function classifyStatus(linkedCommitSha: string | null, shipped: boolean): ReceiptStatus {
  if (!linkedCommitSha) return RECEIPT_STATUS.Unverified;
  return shipped ? RECEIPT_STATUS.Shipped : RECEIPT_STATUS.Draft;
}

/**
 * Resolve the session owner's GitHub identity for commit-ownership binding:
 * their OAuth token (read scope), numeric GitHub id (`account.account_id`), and
 * login (`user.handle`). Missing pieces degrade to null so verifyShipped fails
 * closed rather than throwing.
 */
async function loadOwnerIdentity(userId: string): Promise<{
  token: string | null;
  githubId: number | null;
  login: string | null;
}> {
  const [acct, usr] = await Promise.all([
    db.query.account.findFirst({
      where: (a, { and, eq: eqOp }) => and(eqOp(a.userId, userId), eqOp(a.providerId, "github")),
      columns: { accessToken: true, accountId: true },
    }),
    db.query.user.findFirst({
      where: (u, { eq: eqOp }) => eqOp(u.id, userId),
      columns: { handle: true },
    }),
  ]);
  const parsedId = acct?.accountId ? Number(acct.accountId) : Number.NaN;
  return {
    token: acct?.accessToken ?? null,
    githubId: Number.isFinite(parsedId) ? parsedId : null,
    login: usr?.handle ?? null,
  };
}

export async function generateReceipt(sessionId: string): Promise<ReceiptGenerationResult> {
  try {
    const client = aiClient();
    if (!client) return { ok: false, sessionId, reason: "no-ai-client" };

    const row = await db.query.trailSession.findFirst({
      where: eq(schema.trailSession.id, sessionId),
    });
    if (!row) return { ok: false, sessionId, reason: "not-found" };

    const events = await db
      .select({
        idx: schema.event.idx,
        kind: schema.event.kind,
        data: schema.event.data,
      })
      .from(schema.event)
      .where(eq(schema.event.sessionId, sessionId))
      .orderBy(asc(schema.event.idx));
    if (events.length === 0) return { ok: false, sessionId, reason: "no-events" };

    const transcript = buildTranscript(events);
    const validIdxs = new Set<number>(events.map((e) => e.idx));
    const toneSpec = await loadToneSpec();

    const userPrompt = [
      `Title: ${row.title || row.slug}`,
      `Summary: ${row.summary || ""}`,
      `Linked repo: ${row.linkedRepo || "(none)"}`,
      `Linked commit: ${row.linkedCommitSha || "(none)"}`,
      "",
      "Transcript:",
      transcript,
    ].join("\n");

    const completion = await client.chat.completions.create({
      model: textModel(),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildReceiptSystemPrompt(toneSpec) },
        { role: "user", content: userPrompt },
      ],
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) return { ok: false, sessionId, reason: "no-llm-content" };

    const llm = parseLlmReceipt(content, validIdxs);
    if (!llm) return { ok: false, sessionId, reason: "llm-invalid-json" };

    // Diagnostic only. Per user rule: quality lives in the prompt + tone spec,
    // never in post-LLM regex rewrites. We log warnings and persist them.
    const draft: ReceiptDraft = { outcome: llm.outcome, decisions: llm.decisionSummary };
    const { warnings } = validateReceipt(draft);
    if (warnings.length > 0) {
      console.warn(
        `[receipt-generator] validator diagnostics for ${sessionId}:`,
        warnings.join(", "),
      );
    }

    // Verification gate: 'shipped' only when GitHub confirms the owner shipped
    // this commit to a public default branch. We self-fetch the owner's GitHub
    // identity + OAuth token so both the upload and regenerate paths verify
    // identically with no caller plumbing.
    let shipped = false;
    let verification: typeof schema.trailSession.$inferInsert.receiptVerification = {
      shipped: false,
      sha: row.linkedCommitSha,
      repo: row.linkedRepo,
      checkedAt: new Date().toISOString(),
    };
    if (row.linkedRepo && row.linkedCommitSha) {
      const ownerIdentity = await loadOwnerIdentity(row.userId);
      const result = await verifyShipped(row.linkedRepo, row.linkedCommitSha, {
        userToken: ownerIdentity.token,
        owner: { githubId: ownerIdentity.githubId, login: ownerIdentity.login },
      });
      shipped = result.shipped;
      verification = {
        shipped: result.shipped,
        reason: result.reason,
        matchedBy: result.matchedBy ?? null,
        defaultBranch: result.defaultBranch ?? null,
        private: result.private ?? null,
        sha: row.linkedCommitSha,
        repo: row.linkedRepo,
        checkedAt: new Date().toISOString(),
      };
    }
    const status = classifyStatus(row.linkedCommitSha, shipped);
    const aiReview = await createReceiptAiReview({
      title: row.title || row.slug,
      summary: row.summary,
      tool: row.tool,
      repo: row.repo,
      linkedRepo: row.linkedRepo,
      linkedCommitSha: row.linkedCommitSha,
      receiptStatus: status,
      receiptOutcome: llm.outcome || null,
      receiptTldr: llm.tldr || null,
      receiptDecisionSummary: llm.decisionSummary.length > 0 ? llm.decisionSummary : null,
      receiptChangedFiles: llm.changedFiles.length > 0 ? llm.changedFiles : null,
      receiptVerification: verification,
      events,
    });

    if (!aiReview.ok) {
      console.warn(
        `[receipt-ai-review] generation failed for ${sessionId}:`,
        aiReview.message ?? aiReview.reason,
      );
    }

    await db
      .update(schema.trailSession)
      .set({
        receiptOutcome: llm.outcome || null,
        receiptTldr: llm.tldr || null,
        receiptDecisionSummary: llm.decisionSummary.length > 0 ? llm.decisionSummary : null,
        receiptChangedFiles: llm.changedFiles.length > 0 ? llm.changedFiles : null,
        receiptVerification: verification,
        receiptValidatorWarnings: warnings.length > 0 ? warnings : null,
        receiptStatus: status,
        receiptAiReview: aiReview.ok ? aiReview.review : null,
        receiptAiReviewGeneratedAt: aiReview.ok ? sql`NOW()` : null,
        receiptAiReviewModel: aiReview.ok ? aiReview.model : (aiReview.model ?? null),
        receiptAiReviewError: aiReview.ok ? null : (aiReview.message ?? aiReview.reason),
        receiptGeneratedAt: sql`NOW()`,
        receiptVerifiedAt: shipped ? sql`NOW()` : null,
        receiptVerifiedSha: shipped ? row.linkedCommitSha : null,
        recipeOutcome: llm.outcome || null,
        recipeTldr: llm.tldr || null,
        recipeKeyPromptIdxs: llm.keyPromptIdxs.length > 0 ? llm.keyPromptIdxs : null,
      })
      .where(eq(schema.trailSession.id, sessionId));

    return { ok: true, sessionId, status, warnings };
  } catch (err) {
    const message = (err as Error).message;
    console.error("[receipt-generator] failed for", sessionId, message);
    return { ok: false, sessionId, reason: "exception", message };
  }
}

/**
 * Idempotent: skips generation if a receipt already exists. Used by the
 * share/upload flow so re-uploads don't burn tokens.
 */
export async function ensureReceipt(sessionId: string): Promise<ReceiptGenerationResult | null> {
  const row = await db.query.trailSession.findFirst({
    where: eq(schema.trailSession.id, sessionId),
    columns: { receiptGeneratedAt: true },
  });
  if (!row) return { ok: false, sessionId, reason: "not-found" };
  if (row.receiptGeneratedAt) return null;
  return generateReceipt(sessionId);
}
