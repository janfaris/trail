"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: Array<{ href: string; label: string }> = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/connections", label: "Connections" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Settings sections"
      className="mb-6 flex w-fit items-center gap-1 rounded-full bg-black/45 p-1 shadow-[var(--trail-shadow-border)]"
    >
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex min-h-10 items-center rounded-full px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] transition-[background-color,color,transform] active:scale-[0.97]",
              active ? "bg-zinc-100 text-zinc-950" : "text-zinc-500 hover:text-zinc-200",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
