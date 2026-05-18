import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db/client";
import { eq, and, asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { FileDiff } from "@/components/file-diff";

type EventData =
  | { kind: "prompt"; at: string; text: string }
  | { kind: "completion"; at: string; text: string }
  | { kind: "tool_call"; at: string; name: string; args: unknown; result?: unknown }
  | { kind: "file_diff"; at: string; path: string; before: string; after: string }
  | { kind: "decision"; at: string; note: string };

export default async function SessionView({
  params,
}: {
  params: Promise<{ user: string; slug: string }>;
}) {
  const { user, slug } = await params;

  const userRow = await db.query.user.findFirst({ where: eq(schema.user.handle, user) });
  if (!userRow) return notFound();

  const sessionRow = await db.query.trailSession.findFirst({
    where: and(eq(schema.trailSession.userId, userRow.id), eq(schema.trailSession.slug, slug)),
  });
  if (!sessionRow) return notFound();

  const events = await db
    .select()
    .from(schema.event)
    .where(eq(schema.event.sessionId, sessionRow.id))
    .orderBy(asc(schema.event.idx));

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-900 sticky top-0 bg-zinc-950/80 backdrop-blur z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono text-lg font-semibold">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <Link href={`/u/${user}`} className="text-sm text-zinc-400 hover:text-zinc-100 font-mono">
            @{user}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-4">
            <Badge>{sessionRow.tool}</Badge>
            {sessionRow.repo && <Badge>{sessionRow.repo}</Badge>}
            <span className="text-xs text-zinc-500 font-mono">
              {new Date(sessionRow.startedAt).toISOString().slice(0, 16).replace("T", " ")}
            </span>
          </div>
          <h1 className="text-3xl font-semibold mb-2">
            {sessionRow.title || sessionRow.summary || sessionRow.slug}
          </h1>
          {sessionRow.summary && sessionRow.title && (
            <p className="text-zinc-400">{sessionRow.summary}</p>
          )}
        </div>

        <div className="space-y-4">
          {events.map((e) => {
            const data = e.data as EventData;
            switch (data.kind) {
              case "prompt":
                return (
                  <div key={e.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
                    <div className="text-xs font-mono text-zinc-500 mb-2">prompt</div>
                    <p className="whitespace-pre-wrap text-zinc-100">{data.text}</p>
                  </div>
                );
              case "completion":
                return (
                  <div
                    key={e.id}
                    className="rounded-lg border border-zinc-800 border-l-2 border-l-[#a7f300] bg-zinc-950 p-5"
                  >
                    <div className="text-xs font-mono text-zinc-500 mb-2">completion</div>
                    <p className="whitespace-pre-wrap text-zinc-200 leading-relaxed">{data.text}</p>
                  </div>
                );
              case "tool_call":
                return (
                  <details
                    key={e.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 group"
                  >
                    <summary className="cursor-pointer text-sm font-mono text-zinc-400 hover:text-zinc-100">
                      <span className="text-[#a7f300]">⟶</span> tool_call · {data.name}
                    </summary>
                    <pre className="mt-3 text-xs font-mono text-zinc-300 bg-zinc-950 p-3 rounded overflow-x-auto">
                      {JSON.stringify(data.args, null, 2)}
                    </pre>
                    {data.result !== undefined && (
                      <pre className="mt-2 text-xs font-mono text-zinc-400 bg-zinc-950 p-3 rounded overflow-x-auto">
                        {typeof data.result === "string"
                          ? data.result
                          : JSON.stringify(data.result, null, 2)}
                      </pre>
                    )}
                  </details>
                );
              case "file_diff":
                return <FileDiff key={e.id} path={data.path} before={data.before} after={data.after} />;
              case "decision":
                return (
                  <div key={e.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="text-xs font-mono text-zinc-500 mb-1">decision</div>
                    <p className="text-sm text-zinc-300 italic">{data.note}</p>
                  </div>
                );
              default:
                return null;
            }
          })}
        </div>
      </main>
    </div>
  );
}
