import { cn } from "@/lib/utils";
import type * as React from "react";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-xs font-mono text-zinc-300",
        className,
      )}
      {...props}
    />
  );
}
