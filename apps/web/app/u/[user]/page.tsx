import Link from "next/link";
import { notFound } from "next/navigation";
import { headers, cookies } from "next/headers";
import { db, schema } from "@/db/client";
import { eq, desc } from "drizzle-orm";
import { Avatar } from "@/components/ui/avatar";
import { ToolIcon } from "@/components/tool-icon";
import { RelativeTime } from "@/components/relative-time";
import { SignOutButton } from "@/components/sign-out-button";
import { FeaturedSessionCard } from "@/components/featured-session-card";
import { FeatureToggle } from "@/components/feature-toggle";
import { ProfileIntroCard } from "@/components/profile-intro-card";
import { githubAvatar } from "@/lib/share";
import { auth } from "@/lib/auth";

export default async function UserProfile({ params }: { params: Promise<{ user: string }> }) {
  const { user } = await params;
  const userRow = await db.query.user.findFirst({ where: eq(schema.user.handle, user) });
  if (!userRow) return notFound();

  const sessionInfo = await auth.api.getSession({ headers: await headers() });
  const isSelf = sessionInfo?.user?.id === userRow.id;
  const isSignedIn = Boolean(sessionInfo?.user);

  const jar = await cookies();
  const seenIntro = jar.get("trail_seen_intro")?.value === "1";
  const showIntro = !isSignedIn && !seenIntro;

  const all = await db
    .select()
    .from(schema.trailSession)
    .where(eq(schema.trailSession.userId, userRow.id))
    .orderBy(desc(schema.trailSession.isFeatured), desc(schema.trailSession.startedAt))
    .limit(100);

  const featured = all.filter((s) => s.isFeatured);
  const recent = all.filter((s) => !s.isFeatured);

  const totalEvents = all.reduce((n, s) => n + (s.eventCount ?? 0), 0);
  const tools = Array.from(new Set(all.map((s) => s.tool))).filter(Boolean);
  const avatar = userRow.image ?? githubAvatar(userRow.handle ?? user);

  const gh = userRow.githubHandle || userRow.handle;
  const x = userRow.xHandle;
  const site = userRow.website;
  const hasSocials = Boolean(gh || x || site);

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-900">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-mono text-[15px] font-semibold tracking-tight">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <span className="text-sm font-mono text-zinc-500 flex items-center gap-4">
            {isSelf && (
              <>
                <Link
                  href="/settings"
                  className="text-zinc-400 hover:text-zinc-100 transition-colors text-xs font-mono"
                >
                  Edit profile
                </Link>
                <SignOutButton className="text-zinc-400 hover:text-zinc-100 transition-colors text-xs font-mono" />
              </>
            )}
            <span>@{userRow.handle}</span>
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-10 pb-24">
        {showIntro && <ProfileIntroCard />}

        <div className="flex items-start gap-5 mb-10">
          <Avatar src={avatar} alt={userRow.handle ?? user} size={64} fallback={userRow.handle ?? user} />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight leading-tight text-zinc-50">
              @{userRow.handle}
            </h1>
            {userRow.name && userRow.name !== userRow.handle && (
              <p className="text-sm text-zinc-400 mt-0.5">{userRow.name}</p>
            )}
            {userRow.bio ? (
              <p className="text-[15px] text-zinc-300 mt-2 leading-snug max-w-xl">{userRow.bio}</p>
            ) : isSelf ? (
              <Link
                href="/settings"
                className="inline-block text-sm text-zinc-500 hover:text-[#a7f300] mt-2 font-mono"
              >
                Add a bio →
              </Link>
            ) : null}

            {hasSocials && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs font-mono text-zinc-400">
                {gh && (
                  <a
                    href={`https://github.com/${gh}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-zinc-100"
                  >
                    GitHub
                  </a>
                )}
                {x && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <a
                      href={`https://x.com/${x}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-zinc-100"
                    >
                      X
                    </a>
                  </>
                )}
                {site && (
                  <>
                    <span className="text-zinc-700">·</span>
                    <a
                      href={site}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-zinc-100 truncate max-w-[18rem]"
                    >
                      {site.replace(/^https?:\/\//, "")}
                    </a>
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 text-xs font-mono text-zinc-500">
              <span>
                <span className="tabular-nums text-zinc-200">{all.length}</span>{" "}
                session{all.length === 1 ? "" : "s"}
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

        {featured.length > 0 && (
          <section className="mb-10 space-y-3">
            {featured.map((s) => (
              <FeaturedSessionCard key={s.id} session={s} handle={userRow.handle ?? user} />
            ))}
          </section>
        )}

        {all.length === 0 ? (
          <div className="border-t border-zinc-900 pt-10">
            <p className="text-sm text-zinc-500">
              @{userRow.handle} hasn&apos;t shared any sessions yet.
            </p>
          </div>
        ) : recent.length > 0 ? (
          <div className="border-t border-zinc-900">
            <div className="hidden md:grid grid-cols-[7rem_1.5rem_1fr_5rem_2rem] gap-3 px-2 py-2.5 text-[10px] font-mono uppercase tracking-[0.14em] text-zinc-600 border-b border-zinc-900">
              <span>Date</span>
              <span />
              <span>Title</span>
              <span className="text-right">Events</span>
              <span />
            </div>
            <ul>
              {recent.map((s) => (
                <li key={s.id} className="border-b border-zinc-900 last:border-b-0">
                  <Link
                    href={`/u/${userRow.handle}/${s.slug}`}
                    title={s.repo ? `${s.repo}` : undefined}
                    className="grid md:grid-cols-[7rem_1.5rem_1fr_5rem_2rem] grid-cols-[1fr_4rem] gap-3 items-center px-2 py-3 hover:bg-zinc-900/60 border-l-2 border-transparent hover:border-l-[#a7f300] transition-colors duration-150 group"
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
                    {isSelf ? (
                      <span className="hidden md:flex justify-end">
                        <FeatureToggle sessionId={s.id} isFeatured={s.isFeatured} />
                      </span>
                    ) : (
                      <span className="hidden md:block" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </main>
    </div>
  );
}
