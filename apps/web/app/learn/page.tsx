import Link from "next/link";
import { eq, and, desc, isNotNull, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { ToolIcon } from "@/components/tool-icon";
import { RelativeTime } from "@/components/relative-time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Learn — Trail" };

// /learn — task-driven discovery.
// Facets: tool x framework x task_type x outcome (default outcome=shipped).
// Server component. Search params drive the query.

type SP = Record<string, string | string[] | undefined>;

function pick(sp: SP, key: string): string | null {
  const v = sp[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

interface Row {
  slug: string;
  title: string | null;
  summary: string | null;
  tool: string;
  taskType: string | null;
  outcome: string | null;
  toolsUsed: string[] | null;
  frameworks: string[] | null;
  startedAt: Date;
  eventCount: number;
  handle: string | null;
}

async function loadRows(sp: SP): Promise<Row[]> {
  const tool = pick(sp, "tool");
  const framework = pick(sp, "framework");
  const taskType = pick(sp, "task_type");
  const outcome = pick(sp, "outcome") ?? "shipped";

  const conds: SQL[] = [
    eq(schema.trailSession.visibility, "public"),
  ];
  if (tool) conds.push(eq(schema.trailSession.tool, tool));
  if (taskType) conds.push(eq(schema.trailSession.taskType, taskType));
  if (outcome && outcome !== "any") {
    conds.push(eq(schema.trailSession.outcome, outcome));
  }
  if (framework) {
    // jsonb ?| (any-of) array containment
    conds.push(sql`${schema.trailSession.frameworks} @> ${JSON.stringify([framework])}::jsonb`);
  }

  const rows = await db
    .select({
      slug: schema.trailSession.slug,
      title: schema.trailSession.title,
      summary: schema.trailSession.summary,
      tool: schema.trailSession.tool,
      taskType: schema.trailSession.taskType,
      outcome: schema.trailSession.outcome,
      toolsUsed: schema.trailSession.toolsUsed,
      frameworks: schema.trailSession.frameworks,
      startedAt: schema.trailSession.startedAt,
      eventCount: schema.trailSession.eventCount,
      handle: schema.user.handle,
    })
    .from(schema.trailSession)
    .innerJoin(schema.user, eq(schema.trailSession.userId, schema.user.id))
    .where(and(...conds))
    .orderBy(desc(schema.trailSession.startedAt))
    .limit(60);

  return rows as Row[];
}

async function loadFacets(): Promise<{
  tools: { value: string; count: number }[];
  taskTypes: { value: string; count: number }[];
  frameworks: { value: string; count: number }[];
}> {
  // Tool + task_type are scalar columns — straight group bys.
  const tools = (await db
    .select({
      value: schema.trailSession.tool,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.trailSession)
    .where(eq(schema.trailSession.visibility, "public"))
    .groupBy(schema.trailSession.tool)
    .orderBy(sql`count(*) desc`)
    .limit(12)) as { value: string; count: number }[];

  const taskTypes = (await db
    .select({
      value: schema.trailSession.taskType,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.trailSession)
    .where(
      and(
        eq(schema.trailSession.visibility, "public"),
        isNotNull(schema.trailSession.taskType),
      ),
    )
    .groupBy(schema.trailSession.taskType)
    .orderBy(sql`count(*) desc`)
    .limit(12)) as { value: string; count: number }[];

  // Frameworks live in a jsonb array — unnest via jsonb_array_elements_text.
  const fwRaw = await db.execute<{ value: string; count: number }>(sql`
    SELECT fw AS value, count(*)::int AS count
    FROM (
      SELECT jsonb_array_elements_text(frameworks) AS fw
      FROM trail_session
      WHERE visibility = 'public' AND frameworks IS NOT NULL
    ) t
    GROUP BY fw
    ORDER BY count DESC
    LIMIT 16
  `);
  const frameworks =
    (fwRaw as unknown as { rows: { value: string; count: number }[] }).rows ??
    (fwRaw as unknown as { value: string; count: number }[]);

  return { tools, taskTypes, frameworks: frameworks as { value: string; count: number }[] };
}

function buildHref(sp: SP, key: string, value: string | null): string {
  const params = new URLSearchParams();
  for (const k of ["tool", "framework", "task_type", "outcome"]) {
    const v = pick(sp, k);
    if (v) params.set(k, v);
  }
  if (value === null) params.delete(key);
  else params.set(key, value);
  const qs = params.toString();
  return qs ? `/learn?${qs}` : "/learn";
}

function FacetGroup({
  label,
  options,
  paramKey,
  sp,
}: {
  label: string;
  options: { value: string; count: number }[];
  paramKey: string;
  sp: SP;
}) {
  const active = pick(sp, paramKey);
  return (
    <div className="mb-6">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500 mb-2">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {active && (
          <Link
            href={buildHref(sp, paramKey, null)}
            className="px-2 py-1 text-xs rounded font-mono text-zinc-400 hover:text-zinc-100 border border-zinc-800 hover:border-zinc-600"
          >
            clear
          </Link>
        )}
        {options.map((o) => {
          const isActive = active === o.value;
          return (
            <Link
              key={o.value}
              href={buildHref(sp, paramKey, isActive ? null : o.value)}
              className={`px-2 py-1 text-xs rounded font-mono border transition-colors ${
                isActive
                  ? "bg-[#a7f300] text-zinc-950 border-[#a7f300]"
                  : "text-zinc-300 border-zinc-800 hover:border-zinc-600 hover:text-zinc-100"
              }`}
            >
              {o.value}
              <span className="ml-1 opacity-60">{o.count}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  let rows: Row[] = [];
  let facets: Awaited<ReturnType<typeof loadFacets>> = {
    tools: [],
    taskTypes: [],
    frameworks: [],
  };
  try {
    [rows, facets] = await Promise.all([loadRows(sp), loadFacets()]);
  } catch {
    // Schema columns may not exist yet on first deploy before migration.
  }

  const tool = pick(sp, "tool");
  const framework = pick(sp, "framework");
  const taskType = pick(sp, "task_type");
  const outcome = pick(sp, "outcome") ?? "shipped";

  const subtitleParts: string[] = [];
  if (tool) subtitleParts.push(tool);
  if (framework) subtitleParts.push(`+ ${framework}`);
  if (taskType) subtitleParts.push(`· ${taskType}`);
  if (outcome !== "any") subtitleParts.push(`· ${outcome}`);
  const subtitle = subtitleParts.join(" ") || "all shipped trails";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-900">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Link href="/" className="font-mono text-[15px] font-semibold tracking-tight">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/learn" className="text-zinc-100 transition-colors">
              Learn
            </Link>
            <Link href="/discover" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              Discover
            </Link>
            <Link href="/search" className="text-zinc-400 hover:text-zinc-100 transition-colors">
              Search
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-10 w-full">
        <aside>
          <FacetGroup label="Tool" options={facets.tools} paramKey="tool" sp={sp} />
          <FacetGroup
            label="Framework"
            options={facets.frameworks}
            paramKey="framework"
            sp={sp}
          />
          <FacetGroup
            label="Task type"
            options={facets.taskTypes}
            paramKey="task_type"
            sp={sp}
          />
          <FacetGroup
            label="Outcome"
            options={[
              { value: "shipped", count: 0 },
              { value: "abandoned", count: 0 },
              { value: "rabbithole", count: 0 },
              { value: "any", count: 0 },
            ]}
            paramKey="outcome"
            sp={sp}
          />
        </aside>

        <section>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 mb-1">
            Trails for {subtitle}
          </h1>
          <p className="text-zinc-500 mb-8 text-sm font-mono">
            {rows.length} {rows.length === 1 ? "trail" : "trails"}
          </p>

          {rows.length === 0 ? (
            <div className="text-zinc-500 text-sm font-mono">
              No trails match these filters yet. Try clearing one, or check back after more sessions are uploaded.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-900">
              {rows.map((r) => (
                <li key={r.slug} className="py-4">
                  <Link
                    href={r.handle ? `/u/${r.handle}/${r.slug}` : "#"}
                    className="block group"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500 mb-1">
                      <ToolIcon name={r.tool} className="w-3 h-3" />
                      <span>{r.tool}</span>
                      {r.taskType && (
                        <>
                          <span>·</span>
                          <span>{r.taskType}</span>
                        </>
                      )}
                      {r.outcome && r.outcome !== "unknown" && (
                        <>
                          <span>·</span>
                          <span className={r.outcome === "shipped" ? "text-[#a7f300]" : ""}>
                            {r.outcome}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <RelativeTime date={r.startedAt} />
                      {r.handle && (
                        <>
                          <span>·</span>
                          <span>@{r.handle}</span>
                        </>
                      )}
                    </div>
                    <h3 className="text-base font-medium text-zinc-100 group-hover:text-[#a7f300] transition-colors">
                      {r.title ?? r.slug}
                    </h3>
                    {r.summary && (
                      <p className="text-sm text-zinc-400 mt-0.5 line-clamp-2">{r.summary}</p>
                    )}
                    {(r.toolsUsed?.length || r.frameworks?.length) ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {(r.toolsUsed ?? []).slice(0, 6).map((t) => (
                          <span
                            key={`t-${t}`}
                            className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded"
                          >
                            {t}
                          </span>
                        ))}
                        {(r.frameworks ?? []).slice(0, 6).map((f) => (
                          <span
                            key={`f-${f}`}
                            className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
