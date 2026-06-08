"use client";

import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

// Owner-only affordance on a receipt whose session links a GitHub repo: capture
// a Build Kit from that repo (server-side) and jump to the new kit page.
export function MakeKitButton({
  repo,
  sessionId,
  signedIn,
  signInHref,
  className,
}: {
  repo: string;
  sessionId: string;
  signedIn: boolean;
  signInHref: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!signedIn) {
      window.location.href = signInHref;
      return;
    }
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/kit/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo, sessionId }),
      });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
      if (!res.ok || !body?.id) {
        setError(
          body?.error === "kit_storage_unavailable"
            ? "Kit storage isn't set up yet."
            : "Could not build the kit.",
        );
        setPending(false);
        return;
      }
      router.push(`/kit/${body.id}`);
    } catch {
      setError("Could not build the kit.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={cn(
          "inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#a7f300] px-3.5 text-[13px] font-medium text-black transition-[background-color,transform] hover:bg-[#b6ff14] active:scale-[0.97] disabled:opacity-60",
          className,
        )}
      >
        {pending ? "Building kit…" : "Make a Build Kit"}
      </button>
      {error ? <span className="text-[12px] text-red-300">{error}</span> : null}
    </div>
  );
}
