import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  src?: string | null;
  alt: string;
  size?: number;
  fallback?: string;
  className?: string;
};

export function Avatar({ src, alt, size = 48, fallback, className }: Props) {
  const initial = (fallback ?? alt ?? "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 font-mono",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
