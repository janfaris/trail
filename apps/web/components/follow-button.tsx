"use client";

import { toggleFollow } from "@/app/u/[user]/actions";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function FollowButton({
  targetUserId,
  initialFollowing,
  className,
}: {
  targetUserId: string;
  initialFollowing: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        // Optimistic flip; reconcile with the server result below.
        const next = !following;
        setFollowing(next);
        start(async () => {
          try {
            const res = await toggleFollow(targetUserId);
            if (res.ok) {
              setFollowing(res.following);
              // force-dynamic profile pages won't reflect updated counts from
              // revalidatePath alone for the current view → refresh the route.
              router.refresh();
            } else {
              setFollowing(!next);
            }
          } catch {
            // A thrown server action (expired session, network) must revert the
            // optimistic flip rather than leave the UI in a wrong state.
            setFollowing(!next);
          }
        });
      }}
      aria-pressed={following}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-[border-color,background-color,color,opacity,transform] active:scale-[0.96]",
        following
          ? "border-white/10 text-zinc-300 hover:border-white/25 hover:text-white"
          : "border-[#a7f300] bg-[#a7f300] text-black hover:bg-[#b6ff14]",
        pending && "opacity-60",
        className,
      )}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
