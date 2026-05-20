import { CopyButton } from "@/components/copy-button";
import { ToolIcon } from "@/components/tool-icon";

type Session = {
  title: string;
  recipeTldr: string | null;
  recipeOutcome: string | null;
  tool: string;
  repo: string | null;
  durationSeconds: number | null;
  eventCount: number;
};

type KeyPrompt = { idx: number; text: string };

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function RecipeCard({
  session,
  keyPrompts,
}: {
  session: Session;
  keyPrompts: KeyPrompt[];
}) {
  if (session.recipeTldr == null) return null;

  const duration = formatDuration(session.durationSeconds);

  return (
    <section className="relative rounded-lg border border-zinc-800 bg-zinc-900/30 p-5 sm:p-6">
      {session.recipeOutcome ? (
        <span className="absolute top-4 right-4 inline-flex items-center rounded-full bg-zinc-900/50 px-2.5 py-0.5 text-xs font-mono text-[#a7f300] border border-[#a7f300]/20">
          {session.recipeOutcome}
        </span>
      ) : null}

      <h2 className="text-zinc-100 text-[22px] sm:text-[26px] leading-snug font-semibold pr-24">
        {session.recipeTldr}
      </h2>

      {keyPrompts.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400 font-mono">
            Key prompts
          </h3>
          <ul className="mt-3 space-y-2">
            {keyPrompts.map((p) => {
              const anchor = String(p.idx).padStart(2, "0");
              return (
                <li
                  key={p.idx}
                  className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3"
                >
                  <p className="text-sm text-zinc-200 line-clamp-3 whitespace-pre-wrap">
                    {p.text}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <CopyButton value={p.text} label="Copy" />
                    <a
                      href={`#${anchor}`}
                      className="inline-flex items-center h-7 px-2.5 rounded-md border border-zinc-800 bg-zinc-900/50 text-xs font-mono text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
                    >
                      jump →
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 pt-4 border-t border-zinc-800 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-zinc-500">
        <span className="uppercase tracking-wide text-zinc-400">Setup</span>
        <span className="inline-flex items-center gap-1.5 text-zinc-300">
          <ToolIcon name={session.tool} />
          {session.tool}
        </span>
        {session.repo ? (
          <>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-300">{session.repo}</span>
          </>
        ) : null}
        {duration ? (
          <>
            <span className="text-zinc-700">·</span>
            <span>{duration}</span>
          </>
        ) : null}
        <span className="text-zinc-700">·</span>
        <span>{session.eventCount} events</span>
      </div>
    </section>
  );
}
