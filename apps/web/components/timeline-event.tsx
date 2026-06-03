import { FileDiff } from "@/components/file-diff";
import { Markdown } from "@/components/markdown";
import { absoluteTime } from "@/lib/time";

export type EventData =
  | { kind: "prompt"; at: string; text: string }
  | { kind: "completion"; at: string; text: string }
  | { kind: "tool_call"; at: string; name: string; args: unknown; result?: unknown }
  | { kind: "file_diff"; at: string; path: string; before: string; after: string }
  | { kind: "decision"; at: string; note: string };

function Rail({ at, idx }: { at?: string; idx: number }) {
  return (
    <div className="hidden md:flex md:flex-col md:items-end md:pr-5 md:pt-1 select-none">
      <a
        href={`#event-${idx}`}
        className="text-[11px] font-mono text-zinc-600 hover:text-[#a7f300] tabular-nums tracking-tight transition-colors"
      >
        #{idx.toString().padStart(2, "0")}
      </a>
      {at && (
        <time
          dateTime={at}
          title={absoluteTime(at)}
          className="mt-1 text-[10px] font-mono text-zinc-600 tabular-nums"
        >
          {new Date(at).toISOString().slice(11, 19)}
        </time>
      )}
    </div>
  );
}

function Kind({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10px] uppercase tracking-[0.14em] font-mono text-zinc-500">
      {children}
    </div>
  );
}

export function TimelineEvent({
  idx,
  data,
}: {
  idx: number;
  data: EventData;
}) {
  const anchor = `event-${idx}`;
  const grid = "grid md:grid-cols-[5rem_1fr] gap-0";

  switch (data.kind) {
    case "prompt":
      return (
        <section id={anchor} className={`scroll-mt-24 ${grid}`}>
          <Rail at={data.at} idx={idx} />
          <div className="rounded-md border border-white/10 border-l-2 border-l-zinc-700 bg-zinc-900/60 p-5">
            <Kind>prompt</Kind>
            <Markdown>{data.text}</Markdown>
          </div>
        </section>
      );
    case "completion":
      return (
        <section id={anchor} className={`scroll-mt-24 ${grid}`}>
          <Rail at={data.at} idx={idx} />
          <div className="rounded-md border border-white/10 border-l-2 border-l-[#a7f300]/60 bg-zinc-900/40 p-5">
            <Kind>completion</Kind>
            <Markdown>{data.text}</Markdown>
          </div>
        </section>
      );
    case "tool_call":
      return (
        <section id={anchor} className={`scroll-mt-24 ${grid}`}>
          <Rail at={data.at} idx={idx} />
          <details className="group rounded-md border border-white/10 bg-zinc-900/40 open:bg-zinc-900/60">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-mono text-zinc-400 hover:text-zinc-100">
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                className="transition-transform duration-150 group-open:rotate-90"
                aria-hidden
              >
                <path
                  d="M3 1.5l3.5 3.5L3 8.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-zinc-500">→</span>
              <span className="text-zinc-200">{data.name}</span>
              <span className="ml-auto text-[10px] text-zinc-600 uppercase tracking-wider">
                tool
              </span>
            </summary>
            <div className="border-t border-white/10 px-4 py-3 space-y-2">
              <pre className="text-xs font-mono text-zinc-300 bg-zinc-950/60 border border-white/10 p-3 rounded overflow-x-auto leading-relaxed">
                {JSON.stringify(data.args, null, 2)}
              </pre>
              {data.result !== undefined && (
                <pre className="text-xs font-mono text-zinc-400 bg-zinc-950/60 border border-white/10 p-3 rounded overflow-x-auto leading-relaxed">
                  {typeof data.result === "string"
                    ? data.result
                    : JSON.stringify(data.result, null, 2)}
                </pre>
              )}
            </div>
          </details>
        </section>
      );
    case "file_diff":
      return (
        <section id={anchor} className={`scroll-mt-24 ${grid}`}>
          <Rail at={data.at} idx={idx} />
          <FileDiff path={data.path} before={data.before} after={data.after} />
        </section>
      );
    case "decision":
      return (
        <section id={anchor} className={`scroll-mt-24 ${grid}`}>
          <Rail at={data.at} idx={idx} />
          <div className="px-4 py-3 border-l-2 border-white/10">
            <Kind>decision</Kind>
            <p className="text-sm text-zinc-400 italic leading-relaxed">{data.note}</p>
          </div>
        </section>
      );
    default:
      return null;
  }
}
