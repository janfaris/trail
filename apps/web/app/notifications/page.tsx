import { RelativeTime } from "@/components/relative-time";
import { SiteNav } from "@/components/site-nav";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notifications · Trail",
  description: "Your Trail social activity inbox.",
};

type ActivityRow = {
  id: string;
  type: "follow" | "session_reaction" | "session_comment" | "comment_reply" | string;
  readAt: Date | string | null;
  createdAt: Date | string;
  actorName: string | null;
  actorHandle: string | null;
  actorImage: string | null;
  sessionSlug: string | null;
  sessionTitle: string | null;
  sessionSummary: string | null;
  sessionTldr: string | null;
  ownerHandle: string | null;
  commentBody: string | null;
  commentDeletedAt: Date | string | null;
};

type CountRow = { count: number | string };

function rowsOf<T>(res: unknown): T[] {
  const wrapped = (res as { rows?: T[] }).rows;
  return wrapped ?? (res as T[]);
}

function signInHref(callbackURL: string): string {
  return `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(callbackURL)}`;
}

async function loadServerDeps() {
  const [{ headers }, { and, eq, isNull, sql }, { auth }, { db, schema }] = await Promise.all([
    import("next/headers"),
    import("drizzle-orm"),
    import("@/lib/auth"),
    import("@/db/client"),
  ]);

  return { and, auth, db, eq, headers, isNull, schema, sql };
}

async function requireViewer() {
  const deps = await loadServerDeps();
  const session = await deps.auth.api.getSession({ headers: await deps.headers() });

  if (!session?.user?.id) {
    redirect(signInHref("/notifications"));
  }

  return { ...deps, viewerId: session.user.id };
}

async function markNotificationsRead() {
  "use server";

  const { and, db, eq, isNull, schema, sql, viewerId } = await requireViewer();

  await db
    .update(schema.notification)
    .set({ readAt: sql`now()` })
    .where(and(eq(schema.notification.userId, viewerId), isNull(schema.notification.readAt)));

  redirect("/notifications");
}

function actorLabel(row: ActivityRow) {
  if (row.actorHandle) return `@${row.actorHandle}`;
  return row.actorName ?? "Someone";
}

function receiptTitle(row: ActivityRow) {
  return row.sessionTitle || row.sessionTldr || row.sessionSummary || "a Trail receipt";
}

function activityCopy(row: ActivityRow) {
  const actor = actorLabel(row);

  if (row.type === "follow") {
    return {
      eyebrow: "New follower",
      title: `${actor} started following you`,
      body: "Your builder graph just got a little denser.",
    };
  }

  if (row.type === "session_reaction") {
    return {
      eyebrow: "Receipt reaction",
      title: `${actor} reacted to your receipt`,
      body: receiptTitle(row),
    };
  }

  if (row.type === "comment_reply") {
    return {
      eyebrow: "Reply",
      title: `${actor} replied in a receipt thread`,
      body: row.commentDeletedAt
        ? "The comment was removed."
        : (row.commentBody ?? receiptTitle(row)),
    };
  }

  if (row.type === "session_comment") {
    return {
      eyebrow: "Comment",
      title: `${actor} commented on your receipt`,
      body: row.commentDeletedAt
        ? "The comment was removed."
        : (row.commentBody ?? receiptTitle(row)),
    };
  }

  return {
    eyebrow: "Activity",
    title: `${actor} created new Trail activity`,
    body: receiptTitle(row),
  };
}

function activityHref(row: ActivityRow) {
  if (row.type === "follow" && row.actorHandle) {
    return `/u/${row.actorHandle}`;
  }

  if (row.ownerHandle && row.sessionSlug) {
    const anchor =
      row.type === "session_comment" || row.type === "comment_reply" ? "#conversation" : "";
    return `/u/${row.ownerHandle}/${row.sessionSlug}${anchor}`;
  }

  return "/feed";
}

function ActivityItem({ row }: { row: ActivityRow }) {
  const copy = activityCopy(row);
  const unread = !row.readAt;
  const href = activityHref(row);

  return (
    <Link
      href={href}
      className={cn(
        "group grid gap-4 rounded-2xl border p-4 transition sm:grid-cols-[44px,1fr,auto]",
        unread
          ? "border-[#a7f300]/35 bg-[#a7f300]/[0.06] shadow-[0_0_35px_rgba(167,243,0,0.08)]"
          : "border-zinc-850 bg-zinc-950/70 hover:border-zinc-700",
      )}
    >
      <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-black font-mono text-[12px] text-zinc-300">
        {row.actorImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.actorImage} alt="" className="h-full w-full object-cover" />
        ) : (
          (row.actorHandle?.[0] ?? row.actorName?.[0] ?? "?").toUpperCase()
        )}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#a7f300]">
            {copy.eyebrow}
          </span>
          {unread ? (
            <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300]" aria-label="Unread" />
          ) : null}
        </span>
        <span className="mt-1 block text-[15px] font-semibold text-zinc-100">{copy.title}</span>
        <span className="mt-1 line-clamp-2 block text-[13px] leading-5 text-zinc-400">
          {copy.body}
        </span>
      </span>
      <span className="flex items-start justify-between gap-3 sm:block sm:text-right">
        <RelativeTime date={row.createdAt} className="text-[12px] text-zinc-500" />
        <span className="mt-2 hidden font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-600 transition group-hover:text-zinc-300 sm:block">
          Open
        </span>
      </span>
    </Link>
  );
}

export default async function NotificationsPage() {
  const { db, sql, viewerId } = await requireViewer();

  const [activityResult, unreadResult] = await Promise.all([
    db.execute<ActivityRow>(sql`
      SELECT
        n.id,
        n.type,
        n.read_at AS "readAt",
        n.created_at AS "createdAt",
        actor.name AS "actorName",
        actor.handle AS "actorHandle",
        actor.image AS "actorImage",
        s.slug AS "sessionSlug",
        s.title AS "sessionTitle",
        s.summary AS "sessionSummary",
        s.receipt_tldr AS "sessionTldr",
        owner.handle AS "ownerHandle",
        c.body AS "commentBody",
        c.deleted_at AS "commentDeletedAt"
      FROM notification n
      LEFT JOIN "user" actor ON actor.id = n.actor_id
      LEFT JOIN trail_session s ON s.id = n.session_id
      LEFT JOIN "user" owner ON owner.id = s.user_id
      LEFT JOIN session_comment c ON c.id = n.comment_id
      WHERE n.user_id = ${viewerId}
        AND (n.type <> 'follow' OR actor.handle IS NOT NULL)
        AND (
          n.type = 'follow'
          OR (
            s.id IS NOT NULL
            AND owner.handle IS NOT NULL
            AND (s.visibility = 'public' OR s.user_id = ${viewerId})
          )
        )
        AND (
          n.type NOT IN ('session_comment', 'comment_reply')
          OR c.id IS NULL
          OR c.deleted_at IS NULL
          OR s.user_id = ${viewerId}
        )
      ORDER BY n.created_at DESC
      LIMIT 50
    `),
    db.execute<CountRow>(sql`
      SELECT count(*)::int AS count
      FROM notification n
      WHERE n.user_id = ${viewerId}
        AND n.read_at IS NULL
    `),
  ]);

  const activities = rowsOf<ActivityRow>(activityResult);
  const unreadCount = Number(rowsOf<CountRow>(unreadResult)[0]?.count ?? 0);
  const unread = activities.filter((row) => !row.readAt);
  const earlier = activities.filter((row) => row.readAt);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(167,243,0,0.11),transparent_34rem),linear-gradient(180deg,#050505,#09090b_45%,#050505)] text-zinc-100">
      <SiteNav currentPath="/notifications" />
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-10">
        <div className="grid gap-5 lg:grid-cols-[0.85fr,1.35fr]">
          <aside className="rounded-3xl border border-zinc-850 bg-black/45 p-6 shadow-2xl shadow-black/40">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#a7f300]">
              Trail relay
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-zinc-50 sm:text-5xl">
              Your social signal, not a generic inbox.
            </h1>
            <p className="mt-4 max-w-sm text-[14px] leading-6 text-zinc-400">
              Follows, reactions, comments, and replies collect here so every receipt can turn into
              a conversation.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-zinc-850 bg-zinc-950/70 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Unread
                </div>
                <div className="mt-2 text-3xl font-semibold text-[#a7f300]">{unreadCount}</div>
              </div>
              <div className="rounded-2xl border border-zinc-850 bg-zinc-950/70 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Loaded
                </div>
                <div className="mt-2 text-3xl font-semibold text-zinc-100">{activities.length}</div>
              </div>
            </div>
            <form action={markNotificationsRead} className="mt-5">
              <button
                type="submit"
                disabled={unreadCount === 0}
                className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#a7f300] px-4 text-[13px] font-semibold text-zinc-950 transition hover:bg-[#b9ff1f] disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                Mark all read
              </button>
            </form>
          </aside>

          <div className="space-y-5">
            {activities.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-zinc-800 bg-zinc-950/70 p-8 text-center">
                <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
                  Quiet for now
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
                  Publish and react to wake up the network.
                </h2>
                <p className="mx-auto mt-3 max-w-md text-[14px] leading-6 text-zinc-400">
                  New follows, receipt reactions, comments, and replies will appear here as builders
                  engage with your work.
                </p>
                <Link
                  href="/feed"
                  className="mt-6 inline-flex h-10 items-center rounded-xl border border-zinc-700 px-4 text-[13px] font-medium text-zinc-200 transition hover:border-[#a7f300]/70 hover:text-[#a7f300]"
                >
                  Open the feed
                </Link>
              </div>
            ) : null}

            {unread.length > 0 ? (
              <section className="space-y-3">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Unread
                </h2>
                {unread.map((row) => (
                  <ActivityItem key={row.id} row={row} />
                ))}
              </section>
            ) : null}

            {earlier.length > 0 ? (
              <section className="space-y-3">
                <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Earlier
                </h2>
                {earlier.map((row) => (
                  <ActivityItem key={row.id} row={row} />
                ))}
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
