"use client";

import { type ThemePref, readThemePref, setThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const OPTIONS: Array<{ value: ThemePref; label: string; hint: string }> = [
  { value: "light", label: "Light", hint: "Always use the light theme." },
  { value: "dark", label: "Dark", hint: "Always use the dark theme." },
  { value: "system", label: "System", hint: "Match your device appearance." },
];

export function ThemeControls() {
  // Gate the selected highlight on mount so SSR markup (which can't know the
  // per-device cookie at static build time) matches first client render.
  const [mounted, setMounted] = useState(false);
  const [pref, setPref] = useState<ThemePref>("dark");

  useEffect(() => {
    setPref(readThemePref());
    setMounted(true);
  }, []);

  const select = (next: ThemePref) => {
    setPref(next);
    setThemePref(next);
  };

  const activeHint = OPTIONS.find((o) => o.value === pref)?.hint;

  return (
    <div>
      <div className="inline-flex w-full max-w-md items-center gap-1 rounded-full bg-black/45 p-1 shadow-[var(--trail-shadow-border)]">
        {OPTIONS.map((o) => {
          const active = mounted && pref === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => select(o.value)}
              className={cn(
                "relative inline-flex min-h-10 flex-1 items-center justify-center rounded-full px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition-[background-color,color,transform] active:scale-[0.97]",
                active ? "bg-zinc-100 text-zinc-950" : "text-zinc-500 hover:text-zinc-200",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-500" aria-live="polite">
        {mounted ? activeHint : "\u00a0"}
      </p>
    </div>
  );
}
