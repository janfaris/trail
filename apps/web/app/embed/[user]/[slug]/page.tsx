import { ToolIcon } from "@/components/tool-icon";
import { db, schema } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// /embed/[user]/[slug] — minimal card meant to render inside a 560×280 iframe.
// Public sessions only. No nav, no JS, no fonts — just a single card that
// looks good on X.com / Slack / Discord. Background transparent so dark-mode
// embeds blend with the host page.

interface Props {
  params: Promise<{ user: string; slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { user, slug } = await params;
  return { title: `${user}/${slug} — Trail` };
}

// Loosen the framing policy so iframes work; Vercel sets DENY by default
// elsewhere via middleware, but for this route we want to be embeddable.
export const viewport = { themeColor: "#08090a" };

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://gettrail.vercel.app";

export default async function Embed({ params }: Props) {
  const { user, slug } = await params;
  const userRow = await db.query.user.findFirst({
    where: eq(schema.user.handle, user),
  });
  if (!userRow) notFound();
  const sessionRow = await db.query.trailSession.findFirst({
    where: and(eq(schema.trailSession.userId, userRow.id), eq(schema.trailSession.slug, slug)),
  });
  if (!sessionRow || sessionRow.visibility !== "public" || !sessionRow.sharedAt) notFound();

  const fullUrl = `${BASE}/u/${user}/${slug}`;
  const title = sessionRow.title || slug;
  const desc = sessionRow.summary || "";
  const events = sessionRow.eventCount ?? 0;
  const prompts = sessionRow.promptCount ?? 0;
  const dur =
    typeof sessionRow.durationSeconds === "number"
      ? formatDuration(sessionRow.durationSeconds)
      : null;

  const taskType = sessionRow.taskType ?? null;
  const outcome = sessionRow.outcome ?? null;
  const tools = (sessionRow.toolsUsed ?? []).slice(0, 4);
  const fw = (sessionRow.frameworks ?? []).slice(0, 4);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          background: "transparent",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Inter', 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <a
          href={fullUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            textDecoration: "none",
            color: "#e4e4e7",
            background: "#0b0c0e",
            border: "1px solid #27272a",
            borderRadius: 12,
            padding: "16px 18px",
            boxSizing: "border-box",
            width: "100%",
            height: "100%",
            overflow: "hidden",
          }}
        >
          {/* Top row: brand mark + tool icon + meta */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: "#71717a",
              marginBottom: 10,
            }}
          >
            <span style={{ color: "#a7f300", fontWeight: 600 }}>/trail</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <ToolIcon name={sessionRow.tool} size={11} />
            <span>{sessionRow.tool}</span>
            {taskType && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>{taskType}</span>
              </>
            )}
            {outcome === "shipped" && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span style={{ color: "#a7f300" }}>shipped</span>
              </>
            )}
            <span style={{ marginLeft: "auto" }}>@{user}</span>
          </div>

          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1.3,
              color: "#fafafa",
              marginBottom: 6,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {title}
          </div>

          {desc && (
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.45,
                color: "#a1a1aa",
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                marginBottom: 10,
              }}
            >
              {desc}
            </div>
          )}

          {(tools.length > 0 || fw.length > 0) && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 10,
              }}
            >
              {[...tools, ...fw].slice(0, 6).map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: 10,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    color: "#a1a1aa",
                    background: "#18181b",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          <div
            style={{
              fontSize: 11,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              color: "#52525b",
              display: "flex",
              gap: 10,
            }}
          >
            <span>{events} events</span>
            {prompts > 0 && <span>· {prompts} prompts</span>}
            {dur && <span>· {dur}</span>}
            <span style={{ marginLeft: "auto", color: "#a7f300" }}>Open ↗</span>
          </div>
        </a>
      </body>
    </html>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
