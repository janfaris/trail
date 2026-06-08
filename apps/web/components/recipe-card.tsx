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
    <section className="px-4 py-5 sm:px-5">
      {session.recipeOutcome ? (
        <span className="font-mono text-[11px] text-[var(--accent-text)]">
          {session.recipeOutcome}
        </span>
      ) : null}

      <h2 className="mt-1 text-[17px] font-medium leading-6 tracking-[-0.015em] text-zinc-50">
        {session.recipeTldr}
      </h2>

      {keyPrompts.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-[12px] text-zinc-600">Key prompts</h3>
          <ul className="mt-3 divide-y divide-white/[0.08] border-l border-white/10 pl-3">
            {keyPrompts.map((p) => {
              const anchor = String(p.idx).padStart(2, "0");
              return (
                <li key={p.idx} className="py-3 first:pt-0 last:pb-0">
                  <p className="line-clamp-3 whitespace-pre-wrap text-[13px] leading-5 text-zinc-400">
                    {p.text}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <CopyButton
                      value={p.text}
                      label="Copy"
                      className="min-h-8 rounded-full px-3 text-[12px] normal-case tracking-normal"
                    />
                    <a
                      href={`#${anchor}`}
                      className="inline-flex min-h-8 items-center rounded-full px-2.5 text-[13px] text-zinc-600 transition-[background-color,color,transform] hover:bg-white/[0.04] hover:text-zinc-200 active:scale-[0.97]"
                    >
                      Jump
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.08] pt-3 text-[12px] text-zinc-600">
        <span>Setup</span>
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
