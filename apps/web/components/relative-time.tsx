"use client";

import { useEffect, useState } from "react";
import { absoluteTime, relativeTime } from "@/lib/time";

export function RelativeTime({ date, className }: { date: string | number | Date; className?: string }) {
  const iso = typeof date === "string" ? date : new Date(date).toISOString();
  const [label, setLabel] = useState(() => relativeTime(iso));
  useEffect(() => {
    setLabel(relativeTime(iso));
    const id = setInterval(() => setLabel(relativeTime(iso)), 60_000);
    return () => clearInterval(id);
  }, [iso]);
  return (
    <time dateTime={iso} title={absoluteTime(iso)} className={className}>
      {label}
    </time>
  );
}
