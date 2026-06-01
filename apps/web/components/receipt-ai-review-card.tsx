"use client";

import {
  type ReceiptAiReviewResult,
  requestReceiptAiReview,
} from "@/app/u/[user]/[slug]/review-action";
import type { ReceiptAiReview, ReceiptAiReviewVerdict } from "@/lib/receipt-ai-review-types";
import { cn } from "@/lib/utils";
import { useState, useTransition } from "react";

type Props = {
  sessionId: string;
  pathToRevalidate: string;
  initialReview: ReceiptAiReview | null;
  canGenerate: boolean;
  fallbackSummary: string;
  questions?: string[];
};

const VERDICT_LABELS: Record<ReceiptAiReviewVerdict, string> = {
  shipped: "Shipped",
  partial: "Partial",
  failed: "Failed",
  "needs-proof": "Needs proof",
};

const VERDICT_CLASSES: Record<ReceiptAiReviewVerdict, string> = {
  shipped: "border-[#a7f300]/45 bg-[#a7f300]/10 text-[#a7f300]",
  partial: "border-sky-300/35 bg-sky-300/10 text-sky-100",
  failed: "border-red-300/35 bg-red-300/10 text-red-100",
  "needs-proof": "border-amber-300/35 bg-amber-300/10 text-amber-100",
};

const DEFAULT_QUESTIONS = [
  "What proof should I inspect first?",
  "Where would you fork this next?",
  "What changed after the first attempt?",
];

function openTimeline() {
  const details = document.querySelector<HTMLDetailsElement>("[data-timeline-details]");
  if (details) details.open = true;
}

export function ReceiptAiReviewCard({
  sessionId,
  pathToRevalidate,
  initialReview,
  canGenerate,
  fallbackSummary,
  questions,
}: Props) {
  const [review, setReview] = useState<ReceiptAiReview | null>(initialReview);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const questionStarters = review?.questions.length
    ? review.questions
    : questions?.length
      ? questions
      : DEFAULT_QUESTIONS;

  function generate() {
    setError(null);
    startTransition(async () => {
      const result: ReceiptAiReviewResult = await requestReceiptAiReview(
        sessionId,
        pathToRevalidate,
      );
      if (result.ok) {
        setReview(result.review);
        return;
      }
      setError(result.error);
    });
  }

  if (!review) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-black/25 p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-lime-200/60">
          Quick read
        </div>
        <h3 className="mt-2 text-lg font-semibold tracking-[-0.04em] text-white">
          This receipt has not been AI-checked yet.
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-lime-50/65">{fallbackSummary}</p>
        {canGenerate ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={generate}
              disabled={pending}
              className="inline-flex min-h-9 items-center rounded-full bg-[#a7f300] px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-950 transition hover:bg-[#c8ff5e] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Checking..." : "Run GPT-5.4 mini check"}
            </button>
            {error ? <p className="mt-2 text-xs text-red-200">{error}</p> : null}
          </div>
        ) : null}
      </div>
    );
  }

  const nextSteps =
    review.nextSteps.length > 0
      ? review.nextSteps
      : ["Read the outcome, inspect the cited proof, then ask the builder what to fork next."];

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-lime-200/20 bg-black/25">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">
              Trail checked this receipt for you
            </span>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
                VERDICT_CLASSES[review.verdict],
              )}
            >
              {VERDICT_LABELS[review.verdict]}
            </span>
            <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-lime-50/55">
              {review.confidence} confidence
            </span>
          </div>
          <h3 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-white">
            {review.headline}
          </h3>
          <p className="mt-2 text-sm leading-6 text-lime-50/70">{review.summary}</p>

          <div className="mt-4 grid gap-2">
            {nextSteps.map((step) => (
              <div
                key={step}
                className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm leading-5 text-lime-50/75"
              >
                {step}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-lime-100/10 bg-[#a7f300]/[0.035] p-4 sm:p-5 lg:border-l lg:border-t-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-lime-200/60">
            Evidence Trail cited
          </div>
          <div className="mt-3 space-y-2">
            {review.evidence.map((item, index) => {
              const href = item.eventIdx === null ? "#proof" : `#event-${item.eventIdx}`;
              return (
                <a
                  key={`${item.label}-${item.eventIdx ?? "receipt"}-${index}`}
                  href={href}
                  onClick={item.eventIdx === null ? undefined : openTimeline}
                  className="block rounded-2xl border border-white/10 bg-black/25 p-3 transition hover:border-[#a7f300]/45 hover:bg-[#a7f300]/10"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">{item.label}</span>
                    {item.eventIdx === null ? null : (
                      <span className="font-mono text-[10px] text-[#a7f300]">#{item.eventIdx}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-lime-50/60">{item.detail}</p>
                </a>
              );
            })}
          </div>

          <div className="mt-4 border-t border-lime-100/10 pt-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-lime-200/60">
              Ask next
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {questionStarters.slice(0, 3).map((question) => (
                <a
                  key={question}
                  href="#conversation"
                  className="rounded-full border border-white/10 px-3 py-1.5 text-left text-[11px] font-semibold text-lime-50/65 transition hover:border-[#a7f300]/45 hover:text-white"
                >
                  {question}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
