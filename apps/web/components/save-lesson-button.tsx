"use client";

import { setSavedLesson } from "@/app/learn/actions";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  lessonId: string;
  initialSaved: boolean;
  signedIn: boolean;
  signInHref: string;
  className?: string;
  savedLabel?: string;
  unsavedLabel?: string;
  refreshOnChange?: boolean;
};

export function SaveLessonButton({
  lessonId,
  initialSaved,
  signedIn,
  signInHref,
  className,
  savedLabel = "Saved lesson",
  unsavedLabel = "Save lesson",
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
            const result = await setSavedLesson(lessonId, next);
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
          ? "border border-[var(--accent-border)]/45 bg-[var(--accent)]/10 text-[var(--accent-text)]"
          : "border border-white/10 bg-transparent text-zinc-300 hover:border-[var(--accent-border)]/60 hover:text-[var(--accent-text)]",
        pending && "opacity-60",
        className,
      )}
    >
      {saved ? savedLabel : unsavedLabel}
    </button>
  );
}
