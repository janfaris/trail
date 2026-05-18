"use client";

import { useTransition } from "react";
import { toggleFeatured } from "@/app/u/[user]/actions";

export function FeatureToggle({
  sessionId,
  isFeatured,
}: {
  sessionId: string;
  isFeatured: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(() => {
          void toggleFeatured(sessionId);
        });
      }}
      aria-label={isFeatured ? "Hide from profile" : "Show on profile"}
      title={isFeatured ? "Hide from profile" : "Show on profile"}
      className={
        "text-base leading-none px-1.5 py-0.5 rounded hover:bg-zinc-800 transition-colors " +
        (isFeatured ? "text-[#a7f300]" : "text-zinc-600 hover:text-zinc-300") +
        (pending ? " opacity-50" : "")
      }
    >
      ★
    </button>
  );
}
