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
  shipped: "text-[#a7f300]",
  partial: "text-sky-200",
  failed: "text-red-200",
  "needs-proof": "text-amber-200",
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
      <div className="border-l border-white/10 pl-3">
        <div className="text-[12px] text-zinc-600">Quick read</div>
        <h3 className="mt-1 text-[16px] font-medium tracking-[-0.015em] text-zinc-50">
          This receipt has not been AI-checked yet.
        </h3>
        <p className="mt-1 max-w-2xl text-[13px] leading-5 text-zinc-500">{fallbackSummary}</p>
        {canGenerate ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={generate}
              disabled={pending}
              className="inline-flex min-h-8 items-center rounded-full bg-zinc-100 px-3 text-[13px] font-medium text-zinc-950 transition-[background-color,transform] hover:bg-[#a7f300] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Checking..." : "Run AI check"}
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
    <div className="border-l border-[#a7f300]/30 pl-3">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(16rem,0.92fr)]">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px] text-zinc-600">
            <span>Trail checked this receipt</span>
            <span
              className={cn("font-mono text-[11px] tabular-nums", VERDICT_CLASSES[review.verdict])}
            >
              {VERDICT_LABELS[review.verdict]}
            </span>
            <span className="font-mono text-[11px] text-zinc-500">
              {review.confidence} confidence
            </span>
          </div>
          <h3 className="mt-2 text-[17px] font-medium leading-6 tracking-[-0.015em] text-zinc-50">
            {review.headline}
          </h3>
          <p className="mt-2 text-[13px] leading-5 text-zinc-400">{review.summary}</p>

          <div className="mt-3 grid gap-2">
            {nextSteps.map((step) => (
              <div
                key={step}
                className="border-l border-white/10 pl-3 text-[13px] leading-5 text-zinc-500"
              >
                {step}
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/[0.08] pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div className="text-[12px] text-zinc-600">Evidence Trail cited</div>
          <div className="mt-3 space-y-2">
            {review.evidence.map((item, index) => {
              const href = item.eventIdx === null ? "#proof" : `#event-${item.eventIdx}`;
              return (
                <a
                  key={`${item.label}-${item.eventIdx ?? "receipt"}-${index}`}
                  href={href}
                  onClick={item.eventIdx === null ? undefined : openTimeline}
                  className="block border-l border-white/10 pl-3 transition-colors hover:border-white/25"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-zinc-200">{item.label}</span>
                    {item.eventIdx === null ? null : (
                      <span className="font-mono text-[11px] text-zinc-600">#{item.eventIdx}</span>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-zinc-500">{item.detail}</p>
                </a>
              );
            })}
          </div>

          <div className="mt-4 border-t border-white/[0.08] pt-3">
            <div className="text-[12px] text-zinc-600">Ask next</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {questionStarters.slice(0, 3).map((question) => (
                <a
                  key={question}
                  href="#conversation"
                  className="rounded-full px-2.5 py-1.5 text-left text-[12px] text-zinc-600 transition-[background-color,color] hover:bg-white/[0.04] hover:text-zinc-200"
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
