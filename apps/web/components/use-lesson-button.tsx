"use client";

import { setLessonReused } from "@/app/learn/actions";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  lessonId: string;
  initialUsed: boolean;
  signedIn: boolean;
  signInHref: string;
  className?: string;
  usedLabel?: string;
  unusedLabel?: string;
  refreshOnChange?: boolean;
};

export function UseLessonButton({
  lessonId,
  initialUsed,
  signedIn,
  signInHref,
  className,
  usedLabel = "Used this",
  unusedLabel = "I used this",
  refreshOnChange = false,
}: Props) {
  const router = useRouter();
  const [used, setUsed] = useState(initialUsed);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-pressed={used}
      onClick={() => {
        if (!signedIn) {
          window.location.href = signInHref;
          return;
        }

        const next = !used;
        setUsed(next);
        startTransition(async () => {
          try {
            const result = await setLessonReused(lessonId, next);
            if (!result.ok) {
              setUsed(!next);
              return;
            }
            setUsed(result.reused);
            if (refreshOnChange) router.refresh();
          } catch {
            setUsed(!next);
          }
        });
      }}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full px-3 font-mono text-[11px] uppercase tracking-[0.12em] transition-[background-color,border-color,color,opacity,transform] active:scale-[0.96]",
        used
          ? "border border-amber-300/50 bg-amber-300/10 text-amber-100"
          : "border border-white/10 bg-transparent text-zinc-300 hover:border-amber-300/70 hover:text-amber-100",
        pending && "opacity-60",
        className,
      )}
    >
      {used ? usedLabel : unusedLabel}
    </button>
  );
}
