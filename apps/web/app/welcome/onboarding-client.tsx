"use client";

import { completeOnboarding } from "@/app/welcome/actions";
import { normalizeHandle } from "@/lib/handle";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const inputClassName =
  "min-h-12 w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-zinc-50 outline-2 outline-offset-2 outline-transparent transition-[background-color,border-color,box-shadow] placeholder:text-zinc-600 hover:border-white/15 focus:border-[var(--trail-green)] focus:outline-[var(--trail-green)]";

export function OnboardingClient({
  initialHandle,
  next,
}: {
  initialHandle: string;
  next: string;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState(initialHandle);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // When the input still matches the existing handle, the server grandfathers
  // it (keeps the exact stored value), so the preview should show that real
  // handle — not the normalized form — to avoid implying the URL will change.
  const normalized = normalizeHandle(handle);
  const isGrandfathered = Boolean(initialHandle) && normalized === normalizeHandle(initialHandle);
  const preview = isGrandfathered ? initialHandle : normalized || "your-handle";

  function submit() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("handle", handle);
      const result = await completeOnboarding(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(next);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="space-y-5"
    >
      <div>
        <label
          htmlFor="onboarding-handle"
          className="block font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500"
        >
          Handle
        </label>
        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-3">
          <span className="shrink-0 font-mono text-[13px] text-zinc-600">/u/</span>
          <input
            id="onboarding-handle"
            value={handle}
            onChange={(event) => {
              setHandle(event.target.value);
              setError(null);
            }}
            maxLength={30}
            placeholder="your-handle"
            autoComplete="off"
            spellCheck={false}
            className={`${inputClassName} border-0 bg-transparent px-1 font-mono hover:border-0 focus:outline-none`}
          />
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          2–30 lowercase letters, numbers, or hyphens. Lands at{" "}
          <span className="font-mono text-zinc-400">/u/{preview}</span>.
        </p>
      </div>

      {error ? (
        <div
          aria-live="polite"
          className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending || normalized.length < 2}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[var(--trail-green)] px-5 text-sm font-semibold text-black transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Claiming…" : "Claim handle and post your first build"}
      </button>
      <p className="text-center text-xs leading-5 text-zinc-600">
        Next: write what you shipped. Takes about a minute.
      </p>
    </form>
  );
}
