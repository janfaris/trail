import { db, schema } from "@/db/client";
import { assembleKitFromRepo } from "@/lib/kit-assembler";
import { redactSecrets } from "@/lib/kit-matchers";
import { and, eq } from "drizzle-orm";

// Shared "assemble a repo into a kit and persist it" logic used by both the
// single and bulk capture routes, so the privacy rules (private→private,
// prompt redaction) live in exactly one place.

const MAX_PROMPT_CHARS = 4000;
const MAX_PROMPTS_TOTAL_CHARS = 24_000;

/** Redact + cap user-pasted prompts before they are persisted and shown. */
export function sanitizePrompts(raw: string[]): string[] {
  const out: string[] = [];
  let total = 0;
  for (const p of raw) {
    const cleaned = redactSecrets(p.trim()).slice(0, MAX_PROMPT_CHARS);
    if (!cleaned) continue;
    if (total + cleaned.length > MAX_PROMPTS_TOTAL_CHARS) break;
    total += cleaned.length;
    out.push(cleaned);
    if (out.length >= 12) break;
  }
  return out;
}

export type CaptureResult =
  | { ok: true; id: string; reproducibility: string; skipped?: boolean }
  | { ok: false; error: string; status?: number };

/**
 * Assemble `repo` with the user's token and persist a Build Kit. When
 * `skipIfExists` is set, an existing kit for the same (user, repo) is returned
 * instead of creating a duplicate — used by bulk seeding so re-running a batch
 * is idempotent.
 */
export async function captureAndPersistKit(opts: {
  token: string;
  userId: string;
  repo: string;
  sessionId?: string | null;
  prompts?: string[];
  skipIfExists?: boolean;
}): Promise<CaptureResult> {
  const result = await assembleKitFromRepo(opts.token, opts.repo, {
    pastedPrompts: opts.prompts ?? [],
  });
  if (!result.ok) {
    return { ok: false, error: result.error, status: result.status };
  }
  const kit = result.kit;

  if (opts.skipIfExists) {
    try {
      const [existing] = await db
        .select({ id: schema.buildKit.id })
        .from(schema.buildKit)
        .where(
          and(
            eq(schema.buildKit.userId, opts.userId),
            eq(schema.buildKit.sourceRepo, kit.sourceRepo),
          ),
        )
        .limit(1);
      if (existing) {
        return { ok: true, id: existing.id, reproducibility: kit.reproducibility, skipped: true };
      }
    } catch {
      // Table missing → fall through; the insert below surfaces the real error.
    }
  }

  const id = crypto.randomUUID();
  try {
    await db.insert(schema.buildKit).values({
      id,
      userId: opts.userId,
      sessionId: opts.sessionId ?? null,
      sourceRepo: kit.sourceRepo,
      sourceCommitSha: kit.sourceCommitSha,
      defaultBranch: kit.defaultBranch,
      isPrivateRepo: kit.isPrivateRepo,
      title: kit.title,
      summary: kit.summary,
      rulesFiles: kit.rulesFiles,
      stackManifest: kit.stackManifest ?? null,
      orderedPrompts: sanitizePrompts(opts.prompts ?? []),
      reproducibility: kit.reproducibility,
      // Privacy boundary: a kit from a PRIVATE repo must not be public — its
      // rules/stack could leak internal architecture even after redaction.
      visibility: kit.isPrivateRepo ? "private" : "public",
    });
  } catch (err) {
    console.error("kit persist failed", err);
    return { ok: false, error: "kit_storage_unavailable", status: 503 };
  }

  return { ok: true, id, reproducibility: kit.reproducibility };
}
