"use client";

import { type ExplainResult, requestExplanation } from "@/app/u/[user]/[slug]/explain-action";
import { useState, useTransition } from "react";

interface Props {
  sessionId: string;
  pathToRevalidate: string;
  initialExplanation: string | null;
  canExplain: boolean;
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-white/10 bg-zinc-900/40 rounded-md p-5 my-8 animate-in fade-in duration-300">
      <div className="text-[11px] font-mono uppercase tracking-wider text-[#a7f300] mb-2">
        ★ AI summary
      </div>
      <p className="text-zinc-300 leading-relaxed text-[15px]">{children}</p>
    </div>
  );
}

export function ExplainButton({
  sessionId,
  pathToRevalidate,
  initialExplanation,
  canExplain,
}: Props) {
  const [explanation, setExplanation] = useState<string | null>(initialExplanation);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (explanation) {
    return <Callout>{explanation}</Callout>;
  }
  if (!canExplain) return null;

  function onClick() {
    setError(null);
    start(async () => {
      const res: ExplainResult = await requestExplanation(sessionId, pathToRevalidate);
      if (res.ok) setExplanation(res.explanation);
      else setError(res.error);
    });
  }

  return (
    <div className="my-8">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-white/10 bg-zinc-900/50 text-sm font-mono text-zinc-200 hover:text-[#a7f300] hover:border-white/20 transition-[color,background-color,border-color,transform] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? (
          <>
            <span className="inline-block h-3 w-3 rounded-full border-2 border-white/15 border-t-[#a7f300] animate-spin" />
            Generating…
          </>
        ) : (
          <>★ Explain this session</>
        )}
      </button>
      {error && <p className="mt-2 text-xs font-mono text-red-400">{error}</p>}
    </div>
  );
}
