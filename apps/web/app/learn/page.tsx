import { RelativeTime } from "@/components/relative-time";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import { db, schema } from "@/db/client";
import { type ReceiptAiReview, isReceiptAiReview } from "@/lib/receipt-ai-review-types";
import { type SQL, and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Learn from AI builders — Trail",
  description:
    "Reusable lessons, patterns, prompts, and failure modes extracted from public AI coding receipts.",
};

type SP = Record<string, string | string[] | undefined>;

type Facet = { value: string; count: number };

type LessonRow = {
  id: string;
  slug: string;
  title: string | null;
  summary: string | null;
  tool: string;
  repo: string | null;
  taskType: string | null;
  outcome: string | null;
  toolsUsed: string[] | null;
  frameworks: string[] | null;
  startedAt: Date;
  sharedAt: Date | null;
  eventCount: number;
  promptCount: number | null;
  failedToolCalls: number | null;
  receiptStatus: string | null;
  receiptOutcome: string | null;
  receiptTldr: string | null;
  receiptDecisionSummary: string[] | null;
  receiptChangedFiles: string[] | null;
  receiptAiReview: unknown;
  handle: string;
  name: string | null;
};

type PatternRow = {
  kind: string;
  key: string;
  label: string;
  receipts: unknown;
  builders: unknown;
  shipped: unknown;
  avgEvents: unknown;
  avgPrompts: unknown;
  checked: unknown;
};

type NetworkStats = {
  receiptCount: unknown;
  builderCount: unknown;
  checkedCount: unknown;
  shippedCount: unknown;
  patternCount: unknown;
};

type LearnData = {
  rows: LessonRow[];
  facets: {
    tools: Facet[];
    taskTypes: Facet[];
    frameworks: Facet[];
  };
  stats: NetworkStats;
  patterns: PatternRow[];
};

const emptyStats: NetworkStats = {
  receiptCount: 0,
  builderCount: 0,
  checkedCount: 0,
  shippedCount: 0,
  patternCount: 0,
};

const emptyData: LearnData = {
  rows: [],
  facets: { tools: [], taskTypes: [], frameworks: [] },
  stats: emptyStats,
  patterns: [],
};

function pick(sp: SP, key: string): string | null {
  const value = sp[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

function firstRowOf<T>(result: unknown, fallback: T): T {
  return rowsOf<T>(result)[0] ?? fallback;
}

function formatCount(value: unknown): string {
  const count = toNumber(value);
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(count);
}

function pct(part: unknown, total: unknown): string {
  const denominator = toNumber(total);
  if (denominator <= 0) return "0%";
  return `${Math.round((toNumber(part) / denominator) * 100)}%`;
}

function titleize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function receiptTitle(row: LessonRow): string {
  return row.title ?? row.receiptTldr ?? row.summary ?? "Untitled learning receipt";
}

function receiptHref(row: LessonRow): string {
  return `/u/${row.handle}/${row.slug}`;
}

function receiptReview(row: LessonRow): ReceiptAiReview | null {
  return isReceiptAiReview(row.receiptAiReview) ? row.receiptAiReview : null;
}

function mainLesson(row: LessonRow): string {
  const review = receiptReview(row);
  return (
    review?.headline ??
    row.receiptTldr ??
    row.summary ??
    row.receiptOutcome ??
    "Study the receipt to extract the reusable move."
  );
}

function lessonDetail(row: LessonRow): string {
  const review = receiptReview(row);
  return (
    review?.summary ??
    row.receiptOutcome ??
    row.receiptDecisionSummary?.[0] ??
    "Trail captured the agent work as proof; open the receipt to inspect the decisions and timeline."
  );
}

function reusableMove(row: LessonRow): string {
  const review = receiptReview(row);
  return (
    review?.nextSteps[0] ??
    row.receiptDecisionSummary?.[0] ??
    row.receiptChangedFiles?.[0] ??
    "Compare the prompt, changed files, and proof before reusing the approach."
  );
}

function failureSignal(row: LessonRow): string {
  const failures = row.failedToolCalls ?? 0;
  if (failures > 0) return `${failures} failed tool calls before the final path`;
  const review = receiptReview(row);
  if (review?.verdict === "needs-proof") return "needs stronger shipping proof";
  if (review?.verdict === "partial") return "partial result worth comparing";
  if (row.receiptStatus === "shipped") return "verified shipped receipt";
  return `${formatCount(row.eventCount)} events to inspect`;
}

function tagList(row: LessonRow): string[] {
  return Array.from(new Set([row.tool, ...(row.frameworks ?? []), ...(row.toolsUsed ?? [])]))
    .filter(Boolean)
    .slice(0, 5);
}

function selectedSummary(sp: SP): string {
  const parts = [
    pick(sp, "tool"),
    pick(sp, "framework"),
    pick(sp, "task_type"),
    pick(sp, "outcome") && pick(sp, "outcome") !== "any" ? pick(sp, "outcome") : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "all public AI work";
}

function buildHref(sp: SP, key: string, value: string | null): string {
  const params = new URLSearchParams();
  for (const param of ["tool", "framework", "task_type", "outcome"]) {
    const current = pick(sp, param);
    if (current) params.set(param, current);
  }
  if (value === null) params.delete(key);
  else params.set(key, value);
  const query = params.toString();
  return query ? `/learn?${query}` : "/learn";
}

function publicConditions(sp: SP): SQL[] {
  const tool = pick(sp, "tool");
  const framework = pick(sp, "framework");
  const taskType = pick(sp, "task_type");
  const outcome = pick(sp, "outcome") ?? "any";

  const conds: SQL[] = [
    eq(schema.trailSession.visibility, "public"),
    isNotNull(schema.trailSession.sharedAt),
    isNull(schema.trailSession.redactedAt),
    isNotNull(schema.user.handle),
  ];
  if (tool) conds.push(eq(schema.trailSession.tool, tool));
  if (taskType) conds.push(eq(schema.trailSession.taskType, taskType));
  if (outcome && outcome !== "any") conds.push(eq(schema.trailSession.outcome, outcome));
  if (framework) {
    conds.push(sql`${schema.trailSession.frameworks} @> ${JSON.stringify([framework])}::jsonb`);
  }
  return conds;
}

async function loadRows(sp: SP): Promise<LessonRow[]> {
  const rows = await db
    .select({
      id: schema.trailSession.id,
      slug: schema.trailSession.slug,
      title: schema.trailSession.title,
      summary: schema.trailSession.summary,
      tool: schema.trailSession.tool,
      repo: schema.trailSession.repo,
      taskType: schema.trailSession.taskType,
      outcome: schema.trailSession.outcome,
      toolsUsed: schema.trailSession.toolsUsed,
      frameworks: schema.trailSession.frameworks,
      startedAt: schema.trailSession.startedAt,
      sharedAt: schema.trailSession.sharedAt,
      eventCount: schema.trailSession.eventCount,
      promptCount: schema.trailSession.promptCount,
      failedToolCalls: schema.trailSession.failedToolCalls,
      receiptStatus: schema.trailSession.receiptStatus,
      receiptOutcome: schema.trailSession.receiptOutcome,
      receiptTldr: schema.trailSession.receiptTldr,
      receiptDecisionSummary: schema.trailSession.receiptDecisionSummary,
      receiptChangedFiles: schema.trailSession.receiptChangedFiles,
      receiptAiReview: schema.trailSession.receiptAiReview,
      handle: schema.user.handle,
      name: schema.user.name,
    })
    .from(schema.trailSession)
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(and(...publicConditions(sp)))
    .orderBy(
      desc(
        sql`case when ${schema.trailSession.receiptAiReviewGeneratedAt} is not null then 1 else 0 end`,
      ),
      desc(schema.trailSession.sharedAt),
    )
    .limit(80);

  return rows.flatMap((row) => (row.handle ? [{ ...row, handle: row.handle }] : []));
}

async function loadFacets(): Promise<LearnData["facets"]> {
  const base = and(
    eq(schema.trailSession.visibility, "public"),
    isNotNull(schema.trailSession.sharedAt),
    isNull(schema.trailSession.redactedAt),
  );

  const tools = (await db
    .select({
      value: schema.trailSession.tool,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.trailSession)
    .where(base)
    .groupBy(schema.trailSession.tool)
    .orderBy(sql`count(*) desc`)
    .limit(12)) as Facet[];

  const taskTypes = (await db
    .select({
      value: schema.trailSession.taskType,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.trailSession)
    .where(and(base, isNotNull(schema.trailSession.taskType)))
    .groupBy(schema.trailSession.taskType)
    .orderBy(sql`count(*) desc`)
    .limit(12)) as Facet[];

  const frameworks = rowsOf<Facet>(
    await db.execute(sql`
      SELECT fw AS value, count(*)::int AS count
      FROM (
        SELECT jsonb_array_elements_text(frameworks) AS fw
        FROM trail_session
        WHERE visibility = 'public'
          AND shared_at IS NOT NULL
          AND redacted_at IS NULL
          AND frameworks IS NOT NULL
      ) t
      GROUP BY fw
      ORDER BY count DESC
      LIMIT 16
    `),
  );

  return { tools, taskTypes: taskTypes.filter((item) => item.value), frameworks };
}

async function loadStats(): Promise<NetworkStats> {
  return firstRowOf<NetworkStats>(
    await db.execute(sql`
      with public_sessions as (
        select ts.*
        from trail_session ts
        join "user" u on u.id = ts.user_id
        where ts.visibility = 'public'
          and ts.shared_at is not null
          and ts.redacted_at is null
          and u.handle is not null
          and u.handle <> ''
      ),
      tag_patterns as (
        select distinct st.kind || ':' || lower(st.tag) as pattern_key
        from session_tag st
        join public_sessions ps on ps.id = st.session_id
        where st.kind in ('tool', 'framework', 'model')
      )
      select
        count(distinct ps.id)::int as "receiptCount",
        count(distinct ps.user_id)::int as "builderCount",
        count(distinct ps.id) filter (where ps.receipt_ai_review_generated_at is not null)::int as "checkedCount",
        count(distinct ps.id) filter (
          where ps.receipt_status = 'shipped' or ps.outcome = 'shipped'
        )::int as "shippedCount",
        (select count(*)::int from tag_patterns) as "patternCount"
      from public_sessions ps
    `),
    emptyStats,
  );
}

async function loadPatterns(): Promise<PatternRow[]> {
  return rowsOf<PatternRow>(
    await db.execute(sql`
      with public_sessions as (
        select ts.*
        from trail_session ts
        join "user" u on u.id = ts.user_id
        where ts.visibility = 'public'
          and ts.shared_at is not null
          and ts.redacted_at is null
          and u.handle is not null
          and u.handle <> ''
      ),
      tag_patterns as (
        select
          st.kind,
          lower(st.tag) as key,
          max(st.label) as label,
          count(distinct ps.id)::int as receipts,
          count(distinct ps.user_id)::int as builders,
          count(distinct ps.id) filter (
            where ps.receipt_status = 'shipped' or ps.outcome = 'shipped'
          )::int as shipped,
          avg(ps.event_count)::numeric(10,1) as "avgEvents",
          avg(ps.prompt_count)::numeric(10,1) as "avgPrompts",
          count(distinct ps.id) filter (where ps.receipt_ai_review_generated_at is not null)::int as checked
        from session_tag st
        join public_sessions ps on ps.id = st.session_id
        where st.kind in ('tool', 'framework', 'model')
        group by st.kind, lower(st.tag)
      ),
      task_patterns as (
        select
          'task' as kind,
          ps.task_type as key,
          ps.task_type as label,
          count(distinct ps.id)::int as receipts,
          count(distinct ps.user_id)::int as builders,
          count(distinct ps.id) filter (
            where ps.receipt_status = 'shipped' or ps.outcome = 'shipped'
          )::int as shipped,
          avg(ps.event_count)::numeric(10,1) as "avgEvents",
          avg(ps.prompt_count)::numeric(10,1) as "avgPrompts",
          count(distinct ps.id) filter (where ps.receipt_ai_review_generated_at is not null)::int as checked
        from public_sessions ps
        where ps.task_type is not null and ps.task_type <> ''
        group by ps.task_type
      )
      select * from tag_patterns
      union all
      select * from task_patterns
      order by receipts desc, shipped desc, builders desc
      limit 12
    `),
  );
}

async function loadLearnData(sp: SP): Promise<LearnData> {
  const [rows, facets, stats, patterns] = await Promise.all([
    loadRows(sp),
    loadFacets(),
    loadStats(),
    loadPatterns(),
  ]);
  return { rows, facets, stats, patterns };
}

function FacetGroup({
  label,
  options,
  paramKey,
  sp,
}: {
  label: string;
  options: Facet[];
  paramKey: string;
  sp: SP;
}) {
  const active = pick(sp, paramKey);
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {active ? (
          <Link
            href={buildHref(sp, paramKey, null)}
            className="rounded-full border border-zinc-800 px-2.5 py-1 font-mono text-[11px] text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-100"
          >
            clear
          </Link>
        ) : null}
        {options.map((option) => {
          const isActive = active === option.value;
          return (
            <Link
              key={option.value}
              href={buildHref(sp, paramKey, isActive ? null : option.value)}
              className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition ${
                isActive
                  ? "border-[#a7f300] bg-[#a7f300] text-zinc-950"
                  : "border-zinc-800 bg-black/25 text-zinc-300 hover:border-[#a7f300]/50 hover:text-white"
              }`}
            >
              {option.value}
              <span className="ml-1 opacity-60">{option.count}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/30 p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-white">{value}</div>
    </div>
  );
}

function SectionHeader({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#a7f300]">
        {kicker}
      </div>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em] text-white">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">{children}</p>
    </div>
  );
}

function LessonCard({ row, index }: { row: LessonRow; index: number }) {
  const review = receiptReview(row);
  const tags = tagList(row);
  const href = receiptHref(row);
  const verdict = review?.verdict ?? row.receiptStatus ?? row.outcome ?? "receipt";

  return (
    <article className="group relative overflow-hidden rounded-[1.75rem] border border-zinc-800 bg-zinc-950/75 p-5 shadow-2xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-[#a7f300]/45 hover:bg-zinc-950">
      <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-[#a7f300]/10 blur-2xl transition group-hover:bg-[#a7f300]/20" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-zinc-800 bg-black/30 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            #{String(index + 1).padStart(2, "0")}
          </span>
          <span className="rounded-full border border-[#a7f300]/25 bg-[#a7f300]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#a7f300]">
            {verdict}
          </span>
          <span className="font-mono text-[11px] text-zinc-500">
            @{row.handle} · <RelativeTime date={row.sharedAt ?? row.startedAt} />
          </span>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-zinc-900 bg-black/25 p-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-zinc-800 bg-zinc-950 text-[#a7f300]">
            <ToolIcon name={row.tool} size={18} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-200">{receiptTitle(row)}</div>
            <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
              {row.name ?? `@${row.handle}`}
              {row.repo ? ` · ${row.repo}` : ""}
            </div>
          </div>
        </div>

        <Link href={href}>
          <h3 className="mt-4 text-xl font-semibold leading-tight tracking-[-0.04em] text-white transition group-hover:text-[#a7f300]">
            {mainLesson(row)}
          </h3>
        </Link>
        <p className="mt-3 text-sm leading-6 text-zinc-400">{lessonDetail(row)}</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-black/25 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
              Reusable move
            </div>
            <p className="mt-2 text-sm leading-5 text-zinc-300">{reusableMove(row)}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-black/25 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
              Failure / proof signal
            </div>
            <p className="mt-2 text-sm leading-5 text-zinc-300">{failureSignal(row)}</p>
          </div>
        </div>

        {review?.evidence.length ? (
          <div className="mt-4 rounded-2xl border border-lime-300/20 bg-lime-300/[0.04] p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-200/70">
              Evidence to inspect
            </div>
            <div className="mt-2 grid gap-2">
              {review.evidence.slice(0, 2).map((item) => (
                <p
                  key={`${item.label}-${item.detail}`}
                  className="text-xs leading-5 text-lime-50/70"
                >
                  <span className="font-semibold text-lime-100">{item.label}:</span> {item.detail}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-900 pt-4">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-zinc-800 bg-black/30 px-2 py-0.5 font-mono text-[10px] text-zinc-500"
              >
                {tag}
              </span>
            ))}
          </div>
          <Link
            href={href}
            className="rounded-full border border-zinc-700 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-300 transition hover:border-[#a7f300]/60 hover:text-[#a7f300]"
          >
            Open proof →
          </Link>
        </div>
      </div>
    </article>
  );
}

function PatternCard({ pattern }: { pattern: PatternRow }) {
  const receipts = toNumber(pattern.receipts);
  const shipped = toNumber(pattern.shipped);
  const checked = toNumber(pattern.checked);
  const kindLabel = pattern.kind === "task" ? "workflow" : pattern.kind;
  const href =
    pattern.kind === "framework"
      ? `/frameworks/${pattern.key}`
      : pattern.kind === "tool"
        ? `/tools/${pattern.key}`
        : `/learn?task_type=${encodeURIComponent(pattern.key)}`;

  return (
    <Link
      href={href}
      className="group rounded-[1.5rem] border border-zinc-800 bg-black/30 p-4 transition hover:-translate-y-0.5 hover:border-[#a7f300]/45 hover:bg-[#a7f300]/[0.045]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">
          {kindLabel}
        </span>
        <span className="rounded-full border border-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-500">
          {receipts} receipts
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold tracking-[-0.04em] text-white group-hover:text-[#a7f300]">
        {titleize(pattern.label)}
      </h3>
      <p className="mt-2 text-sm leading-5 text-zinc-400">
        {pct(shipped, receipts)} shipped · {formatCount(pattern.builders)} builders ·{" "}
        {pct(checked, receipts)} AI-checked
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-zinc-900 bg-zinc-950 px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
            avg events
          </div>
          <div className="mt-1 text-sm text-zinc-200">{formatCount(pattern.avgEvents)}</div>
        </div>
        <div className="rounded-2xl border border-zinc-900 bg-zinc-950 px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
            avg prompts
          </div>
          <div className="mt-1 text-sm text-zinc-200">{formatCount(pattern.avgPrompts)}</div>
        </div>
      </div>
    </Link>
  );
}

function InsightRail({ rows }: { rows: LessonRow[] }) {
  const questions = Array.from(
    new Set(rows.flatMap((row) => receiptReview(row)?.questions ?? []).filter(Boolean)),
  ).slice(0, 5);
  const moves = Array.from(new Set(rows.map((row) => reusableMove(row)).filter(Boolean))).slice(
    0,
    5,
  );

  return (
    <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
      <section className="rounded-[1.75rem] border border-zinc-800 bg-zinc-950/90 p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#a7f300]">
          Prompt moves
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">
          What to copy before the code
        </h2>
        <div className="mt-4 space-y-2">
          {(moves.length
            ? moves
            : ["Ask for proof, inspect changed files, then fork the setup."]
          ).map((move) => (
            <div
              key={move}
              className="rounded-2xl border border-zinc-900 bg-black/30 p-3 text-sm leading-5 text-zinc-300"
            >
              {move}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-zinc-800 bg-zinc-950/90 p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#a7f300]">
          Ask better
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">
          Questions the network surfaced
        </h2>
        <div className="mt-4 space-y-2">
          {(questions.length ? questions : ["What broke before this worked?"]).map((question) => (
            <div
              key={question}
              className="rounded-2xl border border-zinc-900 bg-black/30 p-3 text-sm leading-5 text-zinc-300"
            >
              {question}
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  let data = emptyData;
  try {
    data = await loadLearnData(sp);
  } catch (error) {
    console.error("Failed to load learning graph", error);
  }

  const featuredRows = data.rows.slice(0, 9);
  const compareRows = data.rows.slice(0, 4);

  return (
    <div className="min-h-screen bg-[#070806] text-zinc-50">
      <SiteNav currentPath="/learn" />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="relative overflow-hidden rounded-[2.25rem] border border-lime-300/20 bg-zinc-950 p-5 shadow-[0_28px_120px_rgba(0,0,0,0.55)] sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(167,243,0,0.22),transparent_34%),radial-gradient(circle_at_78%_20%,rgba(59,130,246,0.14),transparent_26%)]" />
          <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.75)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.75)_1px,transparent_1px)] [background-size:38px_38px]" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-lime-300/30 bg-lime-300/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.28em] text-lime-100">
                Network memory
              </div>
              <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[0.95] tracking-[-0.07em] text-white sm:text-6xl">
                Learn what AI builders are actually figuring out.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300">
                Trail turns public CLI logs into lessons, reusable moves, failure signals, and
                patterns across builders. Receipts remain the proof; this page is the learning graph
                above them.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="receipts" value={formatCount(data.stats.receiptCount)} />
              <StatCard label="builders" value={formatCount(data.stats.builderCount)} />
              <StatCard label="AI checked" value={formatCount(data.stats.checkedCount)} />
              <StatCard label="patterns" value={formatCount(data.stats.patternCount)} />
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-zinc-800 bg-zinc-950/80 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                Filter the memory
              </div>
              <p className="mt-1 text-sm text-zinc-400">Currently showing {selectedSummary(sp)}.</p>
            </div>
            <Link
              href="/learn"
              className="rounded-full border border-zinc-700 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 transition hover:border-zinc-500 hover:text-white"
            >
              Reset filters
            </Link>
          </div>
          <div className="grid gap-5 lg:grid-cols-4">
            <FacetGroup label="Tool" options={data.facets.tools} paramKey="tool" sp={sp} />
            <FacetGroup
              label="Framework"
              options={data.facets.frameworks}
              paramKey="framework"
              sp={sp}
            />
            <FacetGroup
              label="Task type"
              options={data.facets.taskTypes}
              paramKey="task_type"
              sp={sp}
            />
            <FacetGroup
              label="Outcome"
              options={[
                { value: "shipped", count: toNumber(data.stats.shippedCount) },
                { value: "any", count: toNumber(data.stats.receiptCount) },
              ]}
              paramKey="outcome"
              sp={sp}
            />
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-8">
            <section>
              <SectionHeader kicker="Reusable lessons" title="Do not read logs cold. Start here.">
                Each card distills a receipt into the lesson, the reusable move, and the proof or
                failure signal that makes it worth opening.
              </SectionHeader>
              {featuredRows.length === 0 ? (
                <div className="mt-5 rounded-[1.75rem] border border-dashed border-zinc-800 bg-zinc-950/70 p-6 text-sm text-zinc-500">
                  No learning receipts match these filters yet. Clear a filter or publish a receipt
                  with a generated AI check to seed the learning graph.
                </div>
              ) : (
                <div className="mt-5 grid gap-4">
                  {featuredRows.map((row, index) => (
                    <LessonCard key={row.id} row={row} index={index} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <SectionHeader kicker="Pattern clusters" title="Compare how builders solve things.">
                Trail groups receipts by stack, model, tool, and workflow so the same problem can
                become a playbook instead of a one-off log.
              </SectionHeader>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.patterns.map((pattern) => (
                  <PatternCard key={`${pattern.kind}:${pattern.key}`} pattern={pattern} />
                ))}
              </div>
            </section>

            {compareRows.length > 0 ? (
              <section className="rounded-[1.75rem] border border-zinc-800 bg-zinc-950/80 p-5 sm:p-6">
                <SectionHeader kicker="Cross-dev comparison" title="What changes across builders?">
                  The learning layer works when receipts are comparable: task, stack, proof status,
                  prompt count, event depth, and failure signals.
                </SectionHeader>
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-left text-sm">
                    <thead className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
                      <tr>
                        <th className="px-3 py-2">Builder</th>
                        <th className="px-3 py-2">Workflow</th>
                        <th className="px-3 py-2">Stack</th>
                        <th className="px-3 py-2">Proof</th>
                        <th className="px-3 py-2">Depth</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compareRows.map((row) => (
                        <tr key={row.id} className="bg-black/30">
                          <td className="rounded-l-2xl border-y border-l border-zinc-900 px-3 py-3 text-zinc-200">
                            @{row.handle}
                          </td>
                          <td className="border-y border-zinc-900 px-3 py-3 text-zinc-300">
                            {row.taskType ?? "unknown"}
                          </td>
                          <td className="border-y border-zinc-900 px-3 py-3 text-zinc-400">
                            {tagList(row).slice(0, 3).join(" / ") || row.tool}
                          </td>
                          <td className="border-y border-zinc-900 px-3 py-3 text-zinc-400">
                            {receiptReview(row)?.verdict ?? row.receiptStatus ?? "not checked"}
                          </td>
                          <td className="rounded-r-2xl border-y border-r border-zinc-900 px-3 py-3 font-mono text-xs text-zinc-500">
                            {formatCount(row.eventCount)} events · {formatCount(row.promptCount)}{" "}
                            prompts
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </div>

          <InsightRail rows={data.rows} />
        </section>
      </main>
    </div>
  );
}
