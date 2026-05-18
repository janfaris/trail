import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db/client";
import { eq, desc } from "drizzle-orm";
import { Avatar } from "@/components/ui/avatar";
import { ToolIcon } from "@/components/tool-icon";
import { RelativeTime } from "@/components/relative-time";
import { githubAvatar } from "@/lib/share";

export default async function UserProfile({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  const userRow = await db.query.user.findFirst({ where: eq(schema.user.handle, user) });
  if (!userRow) return notFound();

  const sessions = await db
    .select()
    .from(schema.trailSession)
    .where(eq(schema.trailSession.userId, userRow.id))
    .orderBy(desc(schema.trailSession.startedAt))
    .limit(100);

  const totalEvents = sessions.reduce((n, s) => n + (s.eventCount ?? 0), 0);
  const tools = Array.from(new Set(sessions.map((s) => s.tool))).filter(Boolean);
  const avatar = userRow.image ?? githubAvatar(userRow.handle ?? user);

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-900">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-mono text-[15px] font-semibold tracking-tight">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <span className="text-sm font-mono text-zinc-500">@{userRow.handle}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-14 pb-24">
        <div className="flex items-start gap-5 mb-12">
          <Avatar src={avatar} alt={userRow.handle ?? user} size={64} fallback={userRow.handle ?? user} />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight leading-tight text-zinc-50">
              @{userRow.handle}
            </h1>
            {userRow.name && userRow.name !== userRow.handle && (
              <p className="text-sm text-zinc-400 mt-0.5">{userRow.name}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-xs font-mono text-zinc-500">
              <span>
                <span className="tabular-nums text-zinc-200">{sessions.length}</span>{" "}
                session{sessions.length === 1 ? "" : "s"}
              </span>
              <span>
                <span className="tabular-nums text-zinc-200">{totalEvents}</span> events
              </span>
              {tools.length > 0 && (
                <span className="flex items-center gap-1.5">
                  {tools.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 text-zinc-300"
                    >
                      <ToolIcon name={t} size={11} className="text-zinc-400" />
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="border-t border-zinc-900 pt-10">
            <p className="text-sm text-zinc-500">
              @{userRow.handle} hasn&apos;t shared any sessions yet.
            </p>
          </div>
        ) : (
          <div className="border-t border-zinc-900">
            <div className="hidden md:grid grid-cols-[7rem_1.5rem_1fr_5rem] gap-3 px-2 py-2.5 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-600 border-b border-zinc-900">
              <span>Date</span>
              <span />
              <span>Title</span>
              <span className="text-right">Events</span>
            </div>
            <ul>
              {sessions.map((s) => (
                <li key={s.id} className="border-b border-zinc-900 last:border-b-0">
                  <Link
                    href={`/u/${userRow.handle}/${s.slug}`}
                    title={s.repo ? `${s.repo}` : undefined}
                    className="grid md:grid-cols-[7rem_1.5rem_1fr_5rem] grid-cols-[1fr_4rem] gap-3 items-center px-2 py-3 hover:bg-zinc-900/60 border-l-2 border-transparent hover:border-l-[#a7f300] transition-colors duration-150 group"
                  >
                    <RelativeTime
                      date={s.startedAt}
                      className="hidden md:block text-xs font-mono text-zinc-500 tabular-nums group-hover:text-zinc-300"
                    />
                    <ToolIcon name={s.tool} className="hidden md:block text-zinc-500 group-hover:text-zinc-200" />
                    <span className="text-sm text-zinc-200 truncate group-hover:text-zinc-50">
                      {s.title || s.slug}
                    </span>
                    <span className="md:text-right text-xs font-mono text-zinc-500 tabular-nums group-hover:text-zinc-300">
                      {s.eventCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
