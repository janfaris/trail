import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db/client";
import { eq, desc } from "drizzle-orm";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function UserProfile({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  const userRow = await db.query.user.findFirst({ where: eq(schema.user.handle, user) });
  if (!userRow) return notFound();

  const sessions = await db
    .select()
    .from(schema.trailSession)
    .where(eq(schema.trailSession.userId, userRow.id))
    .orderBy(desc(schema.trailSession.startedAt))
    .limit(50);

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-900">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono text-lg font-semibold">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-center gap-4 mb-12">
          {userRow.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userRow.image} alt={userRow.name} className="w-16 h-16 rounded-full border border-zinc-800" />
          )}
          <div>
            <h1 className="text-3xl font-semibold">@{userRow.handle}</h1>
            <p className="text-zinc-500">{sessions.length} public session{sessions.length === 1 ? "" : "s"}</p>
          </div>
        </div>

        {sessions.length === 0 ? (
          <p className="text-zinc-500 font-mono text-sm">No public sessions yet.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {sessions.map((s) => (
              <Link key={s.id} href={`/u/${userRow.handle}/${s.slug}`}>
                <Card className="hover:border-zinc-700 transition-colors h-full">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <Badge>{s.tool}</Badge>
                      <span className="text-xs text-zinc-500 font-mono">
                        {s.eventCount} events
                      </span>
                    </div>
                    <CardTitle className="text-base">{s.title || s.summary?.slice(0, 60) || s.slug}</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      {new Date(s.startedAt).toISOString().slice(0, 10)}
                      {s.repo ? ` · ${s.repo}` : ""}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
