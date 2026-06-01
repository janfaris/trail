"use client";

import { setSavedReceipt } from "@/app/u/[user]/actions";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  sessionId: string;
  initialSaved: boolean;
  signedIn: boolean;
  signInHref: string;
  className?: string;
  savedLabel?: string;
  unsavedLabel?: string;
  refreshOnChange?: boolean;
};

export function SaveReceiptButton({
  sessionId,
  initialSaved,
  signedIn,
  signInHref,
  className,
  savedLabel = "Saved",
  unsavedLabel = "Save",
  refreshOnChange = false,
}: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={saved}
      onClick={() => {
        if (!signedIn) {
          window.location.href = signInHref;
          return;
        }

        const next = !saved;
        setSaved(next);
        startTransition(async () => {
          try {
            const result = await setSavedReceipt(sessionId, next);
            if (!result.ok) {
              setSaved(!next);
              return;
            }
            setSaved(result.saved);
            if (refreshOnChange) router.refresh();
          } catch {
            setSaved(!next);
          }
        });
      }}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full px-3 font-mono text-[11px] uppercase tracking-[0.12em] transition-[background-color,border-color,color,opacity,transform] active:scale-[0.96]",
        saved
          ? "border border-[#a7f300]/45 bg-[#a7f300]/10 text-[#a7f300]"
          : "border border-transparent bg-transparent text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100",
        pending && "opacity-60",
        className,
      )}
    >
      {saved ? savedLabel : unsavedLabel}
    </button>
  );
}
