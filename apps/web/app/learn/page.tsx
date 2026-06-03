import { CopyButton } from "@/components/copy-button";
import { RelativeTime } from "@/components/relative-time";
import { SaveLessonButton } from "@/components/save-lesson-button";
import { SiteNav } from "@/components/site-nav";
import { ToolIcon } from "@/components/tool-icon";
import { UseLessonButton } from "@/components/use-lesson-button";
import { db, schema } from "@/db/client";
import { type SQL, and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Trail Lessons - learn from AI builders",
  description:
    "Reusable prompt moves, decisions, and failure modes extracted from public AI coding sessions.",
};

type SP = Record<string, string | string[] | undefined>;
type Facet = { value: string; count: number };

type LessonRow = {
  id: string;
  lessonIndex: number;
  title: string;
  whatToSteal: string;
  useWhen: string;
  promptPattern: string | null;
  decision: string | null;
  failureMode: string | null;
  proof: string;
  stack: string[];
  tags: string[];
  sourceEventIdxs: number[];
  transferabilityScore: number;
  confidence: string;
  generatedAt: Date;
  sessionId: string;
  authorId: string;
  slug: string;
  sessionTitle: string | null;
  sessionSummary: string | null;
  tool: string;
  repo: string | null;
  linkedRepo: string | null;
  taskType: string | null;
  outcome: string | null;
  frameworks: string[] | null;
  toolsUsed: string[] | null;
  receiptStatus: string | null;
  eventCount: number;
  promptCount: number | null;
  toolCallCount: number;
  toolResultCount: number;
  fileDiffCount: number;
  decisionCount: number;
  savedCount: number;
  reuseCount: number;
  sharedAt: Date | null;
  handle: string;
  name: string | null;
};

type LearnStats = {
  lessons: unknown;
  receipts: unknown;
  builders: unknown;
  promptMoves: unknown;
  avgTransferability: unknown;
};

type PatternRow = {
  key: string;
  label: string;
  kind: string;
  lessons: unknown;
  receipts: unknown;
  builders: unknown;
  avgTransferability: unknown;
};

type LearnData = {
  lessons: LessonRow[];
  stats: LearnStats;
  facets: {
    tools: Facet[];
    frameworks: Facet[];
    taskTypes: Facet[];
    tags: Facet[];
  };
  patterns: PatternRow[];
  viewer: {
    signedIn: boolean;
    viewerId: string | null;
    savedLessonIds: Set<string>;
    usedLessonIds: Set<string>;
    personalizedTags: Facet[];
  };
};

const emptyStats: LearnStats = {
  lessons: 0,
  receipts: 0,
  builders: 0,
  promptMoves: 0,
  avgTransferability: 0,
};

const emptyData: LearnData = {
  lessons: [],
  stats: emptyStats,
  facets: { tools: [], frameworks: [], taskTypes: [], tags: [] },
  patterns: [],
  viewer: {
    signedIn: false,
    viewerId: null,
    savedLessonIds: new Set(),
    usedLessonIds: new Set(),
    personalizedTags: [],
  },
};

function pick(sp: SP, key: string): string | null {
  const value = sp[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function cleanQuery(sp: SP): string | null {
  const raw = pick(sp, "q");
  if (!raw) return null;
  const cleaned = raw
    .replace(/[^\p{L}\p{N}\s._+#/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 80) : null;
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

function formatCount(value: unknown): string {
  const count = toNumber(value);
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(count);
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

function titleize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function receiptHref(row: Pick<LessonRow, "handle" | "slug">): string {
  return `/u/${row.handle}/${row.slug}`;
}

function signInHref(callbackURL: string): string {
  return `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(callbackURL)}`;
}

function agentPromptForLesson(lesson: LessonRow): string {
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
    "",
    `Proof receipt: ${receiptHref(lesson)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function selectedSummary(sp: SP): string {
  const parts = [
    cleanQuery(sp) ? `search "${cleanQuery(sp)}"` : null,
    pick(sp, "tool"),
    pick(sp, "framework"),
    pick(sp, "task_type"),
    pick(sp, "tag"),
    pick(sp, "outcome") && pick(sp, "outcome") !== "any" ? pick(sp, "outcome") : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "all reusable lessons";
}

function buildHref(sp: SP, key: string, value: string | null): string {
  const params = new URLSearchParams();
  for (const param of ["q", "tool", "framework", "task_type", "tag", "outcome"]) {
    const current = pick(sp, param);
    if (current) params.set(param, current);
  }
  if (value === null) params.delete(key);
  else params.set(key, value);
  const query = params.toString();
  return query ? `/learn?${query}` : "/learn";
}

function publicLessonConditions(sp: SP): SQL[] {
  const tool = pick(sp, "tool");
  const framework = pick(sp, "framework");
  const taskType = pick(sp, "task_type");
  const tag = pick(sp, "tag");
  const outcome = pick(sp, "outcome") ?? "any";
  const q = cleanQuery(sp);

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
  if (tag) {
    conds.push(sql`exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(${schema.sessionLesson.tags}, '[]'::jsonb) ||
        coalesce(${schema.sessionLesson.stack}, '[]'::jsonb)
      ) lesson_tag(tag)
      where lesson_tag.tag = ${tag}
    )`);
  }
  if (q) {
    const pattern = `%${q}%`;
    conds.push(sql`(
      ${schema.sessionLesson.title} ilike ${pattern}
      or ${schema.sessionLesson.whatToSteal} ilike ${pattern}
      or ${schema.sessionLesson.useWhen} ilike ${pattern}
      or coalesce(${schema.sessionLesson.promptPattern}, '') ilike ${pattern}
      or coalesce(${schema.sessionLesson.decision}, '') ilike ${pattern}
      or coalesce(${schema.sessionLesson.failureMode}, '') ilike ${pattern}
      or coalesce(${schema.sessionLesson.proof}, '') ilike ${pattern}
      or coalesce(${schema.trailSession.title}, '') ilike ${pattern}
      or coalesce(${schema.trailSession.summary}, '') ilike ${pattern}
      or exists (
        select 1
        from jsonb_array_elements_text(
          coalesce(${schema.sessionLesson.tags}, '[]'::jsonb) ||
          coalesce(${schema.sessionLesson.stack}, '[]'::jsonb)
        ) lesson_search_tag(tag)
        where lesson_search_tag.tag ilike ${pattern}
      )
    )`);
  }
  return conds;
}

async function loadLessons(sp: SP): Promise<LessonRow[]> {
  const rows = await db
    .select({
      id: schema.sessionLesson.id,
      lessonIndex: schema.sessionLesson.lessonIndex,
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
      generatedAt: schema.sessionLesson.generatedAt,
      sessionId: schema.trailSession.id,
      authorId: schema.trailSession.userId,
      slug: schema.trailSession.slug,
      sessionTitle: schema.trailSession.title,
      sessionSummary: schema.trailSession.summary,
      tool: schema.trailSession.tool,
      repo: schema.trailSession.repo,
      linkedRepo: schema.trailSession.linkedRepo,
      taskType: schema.trailSession.taskType,
      outcome: schema.trailSession.outcome,
      frameworks: schema.trailSession.frameworks,
      toolsUsed: schema.trailSession.toolsUsed,
      receiptStatus: schema.trailSession.receiptStatus,
      eventCount: schema.trailSession.eventCount,
      promptCount: schema.trailSession.promptCount,
      toolCallCount: sql<number>`(
        select count(*)::int
        from event ev
        where ev.session_id = ${schema.trailSession.id}
          and ev.kind = 'tool_call'
      )`,
      toolResultCount: sql<number>`(
        select count(*)::int
        from event ev
        where ev.session_id = ${schema.trailSession.id}
          and ev.kind = 'tool_call'
          and ev.data ? 'result'
          and coalesce(nullif(ev.data->>'result', ''), '') <> ''
      )`,
      fileDiffCount: sql<number>`(
        select count(*)::int
        from event ev
        where ev.session_id = ${schema.trailSession.id}
          and ev.kind = 'file_diff'
      )`,
      decisionCount: sql<number>`(
        select count(*)::int
        from event ev
        where ev.session_id = ${schema.trailSession.id}
          and ev.kind = 'decision'
      )`,
      savedCount: sql<number>`(
        select count(*)::int
        from saved_lesson saved
        where saved.lesson_id = ${schema.sessionLesson.id}
      )`,
      reuseCount: sql<number>`(
        select count(*)::int
        from lesson_reuse used
        where used.lesson_id = ${schema.sessionLesson.id}
      )`,
      sharedAt: schema.trailSession.sharedAt,
      handle: schema.user.handle,
      name: schema.user.name,
    })
    .from(schema.sessionLesson)
    .innerJoin(schema.trailSession, eq(schema.sessionLesson.sessionId, schema.trailSession.id))
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(and(...publicLessonConditions(sp)))
    .orderBy(
      desc(schema.sessionLesson.transferabilityScore),
      desc(schema.sessionLesson.generatedAt),
      desc(schema.trailSession.sharedAt),
    )
    .limit(80);

  return rows.flatMap((row) => (row.handle ? [{ ...row, handle: row.handle }] : []));
}

async function loadStats(): Promise<LearnStats> {
  return firstRowOf<LearnStats>(
    await db.execute(sql`
      with public_lessons as (
        select sl.*, ts.user_id
        from session_lesson sl
        join trail_session ts on ts.id = sl.session_id
        join "user" u on u.id = ts.user_id
        where ts.visibility = 'public'
          and ts.shared_at is not null
          and ts.redacted_at is null
          and u.handle is not null
          and u.handle <> ''
      )
      select
        count(*)::int as lessons,
        count(distinct session_id)::int as receipts,
        count(distinct user_id)::int as builders,
        count(*) filter (where prompt_pattern is not null)::int as "promptMoves",
        coalesce(avg(transferability_score), 0)::numeric(10,1) as "avgTransferability"
      from public_lessons
    `),
    emptyStats,
  );
}

async function loadFacets(): Promise<LearnData["facets"]> {
  const publicWhere = sql`
    ts.visibility = 'public'
    and ts.shared_at is not null
    and ts.redacted_at is null
    and u.handle is not null
    and u.handle <> ''
  `;
  const [tools, frameworks, taskTypes, tags] = await Promise.all([
    db.execute<Facet>(sql`
      select ts.tool as value, count(distinct sl.id)::int as count
      from session_lesson sl
      join trail_session ts on ts.id = sl.session_id
      join "user" u on u.id = ts.user_id
      where ${publicWhere}
      group by ts.tool
      order by count desc
      limit 12
    `),
    db.execute<Facet>(sql`
      select framework as value, count(distinct sl.id)::int as count
      from session_lesson sl
      join trail_session ts on ts.id = sl.session_id
      join "user" u on u.id = ts.user_id
      cross join lateral jsonb_array_elements_text(coalesce(ts.frameworks, '[]'::jsonb)) framework
      where ${publicWhere}
      group by framework
      order by count desc
      limit 14
    `),
    db.execute<Facet>(sql`
      select ts.task_type as value, count(distinct sl.id)::int as count
      from session_lesson sl
      join trail_session ts on ts.id = sl.session_id
      join "user" u on u.id = ts.user_id
      where ${publicWhere}
        and ts.task_type is not null
        and ts.task_type <> ''
      group by ts.task_type
      order by count desc
      limit 12
    `),
    db.execute<Facet>(sql`
      select lesson_tag.tag as value, count(distinct sl.id)::int as count
      from session_lesson sl
      join trail_session ts on ts.id = sl.session_id
      join "user" u on u.id = ts.user_id
      cross join lateral jsonb_array_elements_text(
        coalesce(sl.tags, '[]'::jsonb) || coalesce(sl.stack, '[]'::jsonb)
      ) lesson_tag(tag)
      where ${publicWhere}
      group by lesson_tag.tag
      order by count desc
      limit 18
    `),
  ]);

  return {
    tools: rowsOf(tools),
    frameworks: rowsOf(frameworks),
    taskTypes: rowsOf(taskTypes),
    tags: rowsOf(tags),
  };
}

async function loadPatterns(): Promise<PatternRow[]> {
  return rowsOf<PatternRow>(
    await db.execute(sql`
      with public_lessons as (
        select sl.*, ts.user_id, ts.task_type
        from session_lesson sl
        join trail_session ts on ts.id = sl.session_id
        join "user" u on u.id = ts.user_id
        where ts.visibility = 'public'
          and ts.shared_at is not null
          and ts.redacted_at is null
          and u.handle is not null
          and u.handle <> ''
      ),
      tag_patterns as (
        select
          lesson_tag.tag as key,
          lesson_tag.tag as label,
          'topic' as kind,
          count(distinct pl.id)::int as lessons,
          count(distinct pl.session_id)::int as receipts,
          count(distinct pl.user_id)::int as builders,
          avg(pl.transferability_score)::numeric(10,1) as "avgTransferability"
        from public_lessons pl
        cross join lateral jsonb_array_elements_text(
          coalesce(pl.tags, '[]'::jsonb) || coalesce(pl.stack, '[]'::jsonb)
        ) lesson_tag(tag)
        group by lesson_tag.tag
      ),
      task_patterns as (
        select
          pl.task_type as key,
          pl.task_type as label,
          'workflow' as kind,
          count(distinct pl.id)::int as lessons,
          count(distinct pl.session_id)::int as receipts,
          count(distinct pl.user_id)::int as builders,
          avg(pl.transferability_score)::numeric(10,1) as "avgTransferability"
        from public_lessons pl
        where pl.task_type is not null and pl.task_type <> ''
        group by pl.task_type
      )
      select * from tag_patterns
      union all
      select * from task_patterns
      order by lessons desc, "avgTransferability" desc
      limit 12
    `),
  );
}

async function loadViewerContext(lessonIds: string[]): Promise<LearnData["viewer"]> {
  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return {
      signedIn: false,
      viewerId: null,
      savedLessonIds: new Set(),
      usedLessonIds: new Set(),
      personalizedTags: [],
    };
  }

  const [savedRows, usedRows, tagRows] = await Promise.all([
    lessonIds.length > 0
      ? db
          .select({ lessonId: schema.savedLesson.lessonId })
          .from(schema.savedLesson)
          .where(
            and(
              eq(schema.savedLesson.userId, session.user.id),
              inArray(schema.savedLesson.lessonId, lessonIds),
            ),
          )
      : Promise.resolve([]),
    lessonIds.length > 0
      ? db
          .select({ lessonId: schema.lessonReuse.lessonId })
          .from(schema.lessonReuse)
          .where(
            and(
              eq(schema.lessonReuse.userId, session.user.id),
              inArray(schema.lessonReuse.lessonId, lessonIds),
            ),
          )
      : Promise.resolve([]),
    db.execute<Facet>(sql`
      select tag.value, count(*)::int as count
      from trail_session ts
      cross join lateral jsonb_array_elements_text(
        coalesce(ts.frameworks, '[]'::jsonb) ||
        coalesce(ts.tools_used, '[]'::jsonb)
      ) tag(value)
      where ts.user_id = ${session.user.id}
      group by tag.value
      order by count desc
      limit 8
    `),
  ]);

  return {
    signedIn: true,
    viewerId: session.user.id,
    savedLessonIds: new Set(savedRows.map((row) => row.lessonId)),
    usedLessonIds: new Set(usedRows.map((row) => row.lessonId)),
    personalizedTags: rowsOf(tagRows),
  };
}

async function loadLearnData(sp: SP): Promise<LearnData> {
  const [lessons, stats, facets, patterns] = await Promise.all([
    loadLessons(sp),
    loadStats(),
    loadFacets(),
    loadPatterns(),
  ]);
  const viewer = await loadViewerContext(lessons.map((lesson) => lesson.id));
  return { lessons, stats, facets, patterns, viewer };
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
    <div className="rounded-[1.25rem] bg-black/30 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
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
  children: ReactNode;
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

function LessonCard({
  lesson,
  index,
  signedIn,
  saved,
  used,
}: {
  lesson: LessonRow;
  index: number;
  signedIn: boolean;
  saved: boolean;
  used: boolean;
}) {
  const href = receiptHref(lesson);
  const discussHref = `${href}#conversation`;
  const copyValue = lesson.promptPattern ?? lesson.whatToSteal;
  const tags = Array.from(new Set([...lesson.stack, ...lesson.tags])).slice(0, 6);
  const proofSignals = [
    `${formatCount(lesson.sourceEventIdxs.length)} cited events`,
    lesson.toolResultCount > 0
      ? `${formatCount(lesson.toolResultCount)}/${formatCount(lesson.toolCallCount)} tool results`
      : lesson.toolCallCount > 0
        ? `${formatCount(lesson.toolCallCount)} tool calls`
        : null,
    lesson.fileDiffCount > 0 ? `${formatCount(lesson.fileDiffCount)} diffs` : null,
    lesson.decisionCount > 0 ? `${formatCount(lesson.decisionCount)} decisions` : null,
    lesson.savedCount > 0 ? `${formatCount(lesson.savedCount)} saves` : null,
    lesson.reuseCount > 0 ? `${formatCount(lesson.reuseCount)} used this` : null,
  ].filter(Boolean);

  return (
    <article
      id={`lesson-${lesson.id}`}
      className="group scroll-mt-24 overflow-hidden rounded-[2rem] bg-[linear-gradient(135deg,rgba(167,243,0,0.045),transparent_34%),#080908] shadow-[var(--trail-shadow-border)] transition-[box-shadow] hover:shadow-[var(--trail-shadow-border-hover)]"
    >
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-black/30 px-2.5 py-1 font-mono text-[10px] text-zinc-500 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              #{String(index + 1).padStart(2, "0")}
            </span>
            <span className="rounded-full bg-[#a7f300]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#a7f300] shadow-[0_0_0_1px_rgba(167,243,0,0.18)]">
              {lesson.transferabilityScore}/5 stealable
            </span>
            <span className="rounded-full bg-black/30 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              evidence {lesson.confidence}
            </span>
            <span className="rounded-full bg-amber-300/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-amber-100/75 shadow-[0_0_0_1px_rgba(252,211,77,0.16)]">
              {lesson.reuseCount > 0 ? `${formatCount(lesson.reuseCount)} used` : "ready to use"}
            </span>
            <span className="font-mono text-[11px] text-zinc-500">
              @{lesson.handle} - <RelativeTime date={lesson.sharedAt ?? lesson.generatedAt} />
            </span>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-black/25 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-950 text-[#a7f300] shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
              <ToolIcon name={lesson.tool} size={18} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-200">
                {lesson.sessionTitle ?? lesson.sessionSummary ?? "AI coding session"}
              </div>
              <div className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                {lesson.name ?? `@${lesson.handle}`}
                {lesson.linkedRepo || lesson.repo ? ` - ${lesson.linkedRepo ?? lesson.repo}` : ""}
              </div>
            </div>
          </div>

          <Link href={href}>
            <h3 className="mt-5 text-2xl font-semibold leading-tight tracking-[-0.055em] text-white transition-[color] group-hover:text-[#a7f300]">
              {lesson.title}
            </h3>
          </Link>

          <div className="mt-5 rounded-2xl bg-black/30 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)]">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#a7f300]">
              What to steal
            </div>
            <p className="mt-2 text-base leading-7 text-lime-50/85">{lesson.whatToSteal}</p>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-black/25 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                Use when
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-300">{lesson.useWhen}</p>
            </div>
            {lesson.failureMode ? (
              <div className="rounded-2xl bg-amber-300/[0.045] p-4 shadow-[0_0_0_1px_rgba(252,211,77,0.14)]">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-100/70">
                  Watch out
                </div>
                <p className="mt-2 text-sm leading-6 text-amber-50/80">{lesson.failureMode}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-t border-lime-100/10 bg-black/25 p-5 sm:p-6 lg:border-l lg:border-t-0">
          {lesson.promptPattern ? (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-lime-200/60">
                Copy prompt move
              </div>
              <div className="mt-3 rounded-2xl bg-black/35 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
                <p className="text-sm leading-6 text-lime-50/75">{lesson.promptPattern}</p>
                <CopyButton
                  value={copyValue}
                  label="Copy move"
                  copiedLabel="Copied"
                  className="mt-3"
                />
              </div>
            </div>
          ) : (
            <CopyButton value={copyValue} label="Copy lesson" copiedLabel="Copied" />
          )}

          {lesson.decision ? (
            <div className="mt-4 rounded-2xl bg-black/25 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                Decision
              </div>
              <p className="mt-2 text-sm leading-5 text-zinc-300">{lesson.decision}</p>
            </div>
          ) : null}

          <details className="group mt-4 rounded-2xl bg-black/25 p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500 transition-[color] hover:text-zinc-200">
              Proof, if you need it
              <span className="text-[#a7f300] transition group-open:translate-x-0.5">-&gt;</span>
            </summary>
            <p className="mt-3 text-sm leading-6 text-zinc-300">{lesson.proof}</p>
            {proofSignals.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {proofSignals.map((signal) => (
                  <span
                    key={signal}
                    className="rounded-full bg-black/30 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                  >
                    {signal}
                  </span>
                ))}
              </div>
            ) : null}
            {lesson.sourceEventIdxs.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {lesson.sourceEventIdxs.slice(0, 3).map((idx) => (
                  <Link
                    key={idx}
                    href={`${href}#event-${idx}`}
                    className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#a7f300] shadow-[0_0_0_1px_rgba(167,243,0,0.16)] transition-[box-shadow] hover:shadow-[0_0_0_1px_rgba(167,243,0,0.32)]"
                  >
                    event #{idx}
                  </Link>
                ))}
              </div>
            ) : null}
          </details>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Link
                key={tag}
                href={buildHref({}, "tag", tag)}
                className="rounded-full px-2 py-0.5 font-mono text-[10px] text-zinc-500 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] transition-[box-shadow,color] hover:text-[#a7f300] hover:shadow-[0_0_0_1px_rgba(167,243,0,0.22)]"
              >
                {tag}
              </Link>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2 border-t border-white/10 pt-4">
            <Link
              href={href}
              className="inline-flex min-h-10 items-center rounded-full bg-zinc-100 px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-black transition-[background-color,transform] hover:bg-[#a7f300] active:scale-[0.96]"
            >
              Open proof
            </Link>
            <CopyButton
              value={agentPromptForLesson(lesson)}
              label="Use in agent"
              copiedLabel="Copied agent prompt"
              className="min-h-10 rounded-full px-3 uppercase tracking-[0.12em]"
            />
            <SaveLessonButton
              lessonId={lesson.id}
              initialSaved={saved}
              signedIn={signedIn}
              signInHref={signInHref(`/learn#lesson-${lesson.id}`)}
            />
            <UseLessonButton
              lessonId={lesson.id}
              initialUsed={used}
              signedIn={signedIn}
              signInHref={signInHref(`/learn#lesson-${lesson.id}`)}
            />
            <Link
              href={discussHref}
              className="inline-flex min-h-10 items-center rounded-full px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-zinc-300 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] transition-[box-shadow,color,transform] hover:text-[#a7f300] hover:shadow-[0_0_0_1px_rgba(167,243,0,0.24)] active:scale-[0.96]"
            >
              Discuss
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function PatternCard({ pattern }: { pattern: PatternRow }) {
  return (
    <Link
      href={buildHref({}, pattern.kind === "workflow" ? "task_type" : "tag", pattern.key)}
      className="group rounded-[1.5rem] bg-black/30 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.07)] transition-[background-color,box-shadow] hover:bg-black/42 hover:shadow-[0_0_0_1px_rgba(167,243,0,0.22)]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">
          {pattern.kind}
        </span>
        <span className="rounded-full px-2 py-0.5 font-mono text-[10px] text-zinc-500 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
          {formatCount(pattern.lessons)} lessons
        </span>
      </div>
      <h3 className="mt-3 text-lg font-semibold tracking-[-0.04em] text-white transition-[color] group-hover:text-[#a7f300]">
        {titleize(pattern.label)}
      </h3>
      <p className="mt-2 text-sm leading-5 text-zinc-400">
        {formatCount(pattern.receipts)} receipts - {formatCount(pattern.builders)} builders -{" "}
        {formatCount(pattern.avgTransferability)}/5 avg transferability
      </p>
    </Link>
  );
}

function SearchBox({ sp }: { sp: SP }) {
  const q = cleanQuery(sp) ?? "";
  return (
    <form action="/learn" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
      {["tool", "framework", "task_type", "tag", "outcome"].map((key) => {
        const value = pick(sp, key);
        return value ? <input key={key} type="hidden" name={key} value={value} /> : null;
      })}
      <label className="block">
        <span className="sr-only">Search Trail lessons</span>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search prompts, failures, stacks, commands..."
          className="h-12 w-full rounded-full bg-black/45 px-5 text-sm text-zinc-100 shadow-[0_0_0_1px_rgba(255,255,255,0.08)] outline-none transition-[box-shadow] placeholder:text-zinc-600 focus:shadow-[0_0_0_1px_rgba(167,243,0,0.38)]"
        />
      </label>
      <button
        type="submit"
        className="h-12 rounded-full bg-[#a7f300] px-5 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-950 transition-[background-color,transform] hover:bg-[#c8ff5e] active:scale-[0.96]"
      >
        Search lessons
      </button>
    </form>
  );
}

function PersonalizedChips({ tags, sp }: { tags: Facet[]; sp: SP }) {
  if (tags.length === 0) return null;
  return (
    <div className="mt-4 rounded-[1.25rem] border border-lime-300/15 bg-lime-300/[0.04] p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-lime-100/60">
        From your stack
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Link
            key={tag.value}
            href={buildHref(sp, "tag", tag.value)}
            className="rounded-full border border-lime-300/20 px-2.5 py-1 font-mono text-[11px] text-lime-100/80 transition hover:border-lime-200/60 hover:text-[#a7f300]"
          >
            {tag.value}
          </Link>
        ))}
      </div>
    </div>
  );
}

function InsightRail({ lessons }: { lessons: LessonRow[] }) {
  const promptMoves = lessons
    .map((lesson) => lesson.promptPattern)
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);
  const failureModes = lessons
    .map((lesson) => lesson.failureMode)
    .filter((item): item is string => Boolean(item))
    .slice(0, 4);

  return (
    <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
      <section className="rounded-[1.75rem] border border-zinc-800 bg-zinc-950/90 p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#a7f300]">
          Prompt moves
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">
          Copy the instruction pattern
        </h2>
        <div className="mt-4 space-y-2">
          {(promptMoves.length
            ? promptMoves
            : ["Ask the agent to preserve behavior, make the smallest change, and run proof."]
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
          Failure modes
        </div>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">
          What to avoid copying blindly
        </h2>
        <div className="mt-4 space-y-2">
          {(failureModes.length
            ? failureModes
            : ["Do not trust a session as shipped until proof links, tests, or commits line up."]
          ).map((mode) => (
            <div
              key={mode}
              className="rounded-2xl border border-zinc-900 bg-black/30 p-3 text-sm leading-5 text-zinc-300"
            >
              {mode}
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
    console.error("Failed to load Trail lessons", error);
  }

  return (
    <div className="min-h-screen bg-[#070806] text-zinc-50">
      <SiteNav currentPath="/learn" />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="relative overflow-hidden rounded-[2.25rem] bg-zinc-950/86 p-5 shadow-[var(--trail-shadow-border)] sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(167,243,0,0.1),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.035),transparent_42%)]" />
          <div className="absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,0.75)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.75)_1px,transparent_1px)] [background-size:38px_38px]" />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#a7f300]/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.28em] text-[#a7f300] shadow-[0_0_0_1px_rgba(167,243,0,0.18)]">
                Trail Lessons
              </div>
              <h1 className="mt-6 max-w-4xl text-4xl font-semibold leading-[0.95] tracking-[-0.07em] text-white sm:text-6xl">
                Stop reading logs. Steal the move.
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-zinc-300">
                GPT-5.4 mini extracts reusable lessons from public AI coding sessions: what to
                steal, when to use it, the prompt pattern, and the proof only if you need it.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="lessons" value={formatCount(data.stats.lessons)} />
              <StatCard label="receipts" value={formatCount(data.stats.receipts)} />
              <StatCard label="builders" value={formatCount(data.stats.builders)} />
              <StatCard
                label="avg stealable"
                value={`${formatCount(data.stats.avgTransferability)}/5`}
              />
            </div>
          </div>
        </section>

        <section className="mt-5 rounded-[1.75rem] bg-zinc-950/72 p-4 shadow-[var(--trail-shadow-border)] sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">
                Search the playbook
              </div>
              <p className="mt-1 text-sm text-zinc-400">
                Type the problem you are facing, then narrow by stack or workflow.
              </p>
            </div>
            <Link
              href="/learn"
              className="inline-flex min-h-10 items-center rounded-full px-3 font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-400 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[0_0_0_1px_rgba(255,255,255,0.22)] active:scale-[0.96]"
            >
              Reset filters
            </Link>
          </div>
          <SearchBox sp={sp} />
          <PersonalizedChips tags={data.viewer.personalizedTags} sp={sp} />
          <div className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
            Showing {selectedSummary(sp)}
          </div>
          <div className="mt-4 grid gap-5 lg:grid-cols-5">
            <FacetGroup label="Tool" options={data.facets.tools} paramKey="tool" sp={sp} />
            <FacetGroup
              label="Framework"
              options={data.facets.frameworks}
              paramKey="framework"
              sp={sp}
            />
            <FacetGroup
              label="Workflow"
              options={data.facets.taskTypes}
              paramKey="task_type"
              sp={sp}
            />
            <FacetGroup label="Topic" options={data.facets.tags} paramKey="tag" sp={sp} />
            <FacetGroup
              label="Outcome"
              options={[
                { value: "shipped", count: toNumber(data.stats.receipts) },
                { value: "any", count: toNumber(data.stats.lessons) },
              ]}
              paramKey="outcome"
              sp={sp}
            />
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-8">
            <section>
              <SectionHeader kicker="Reusable lessons" title="Read this first. Proof later.">
                Each card is a playbook object extracted from raw session logs. The receipt remains
                the audit trail; the lesson is what another builder can use.
              </SectionHeader>
              {data.lessons.length === 0 ? (
                <div className="mt-5 rounded-[1.75rem] border border-dashed border-zinc-800 bg-zinc-950/70 p-6 text-sm leading-6 text-zinc-500">
                  No extracted lessons match this search yet. Try a broader problem like "lint",
                  "publish", or "database", or publish/backfill public sessions so Trail can turn
                  their raw logs into reusable moves.
                </div>
              ) : (
                <div className="mt-5 grid gap-4">
                  {data.lessons.map((lesson, index) => (
                    <LessonCard
                      key={lesson.id}
                      lesson={lesson}
                      index={index}
                      signedIn={data.viewer.signedIn}
                      saved={data.viewer.savedLessonIds.has(lesson.id)}
                      used={data.viewer.usedLessonIds.has(lesson.id)}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <SectionHeader kicker="Pattern clusters" title="Where the network is learning.">
                Lessons cluster by stack, workflow, and topic so the same move can become a shared
                playbook instead of a one-off receipt.
              </SectionHeader>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.patterns.map((pattern) => (
                  <PatternCard key={`${pattern.kind}:${pattern.key}`} pattern={pattern} />
                ))}
              </div>
            </section>
          </div>

          <InsightRail lessons={data.lessons} />
        </section>
      </main>
    </div>
  );
}
