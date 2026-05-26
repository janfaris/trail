"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS: Array<{ href: string; label: string }> = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/connections", label: "Connections" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Settings sections"
      className="flex items-center gap-1 border-b border-zinc-900 mb-8 -mx-1"
    >
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative px-3 py-2 text-sm font-mono transition-colors",
              active
                ? "text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            {t.label}
            {active && (
              <span
                aria-hidden
                className="absolute left-3 right-3 -bottom-px h-px bg-[#a7f300]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
