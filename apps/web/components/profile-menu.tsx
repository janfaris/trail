"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type MenuLink = { href: string; label: string; mobileOnly?: boolean };

const MENU_LINKS: MenuLink[] = [
  { href: "/feed", label: "Feed", mobileOnly: true },
  { href: "/create", label: "Create", mobileOnly: true },
  { href: "/discover", label: "Builders", mobileOnly: true },
  { href: "/puerto-rico", label: "Puerto Rico", mobileOnly: true },
  { href: "/notifications", label: "Notifications" },
  { href: "/saved", label: "Saved" },
  { href: "/dashboard", label: "Studio" },
  { href: "/dashboard/cost", label: "Cost" },
];

export function ProfileMenu({
  handle,
  name,
  image,
  isAdmin = false,
  signOut,
}: {
  handle: string;
  name?: string | null;
  image?: string | null;
  isAdmin?: boolean;
  signOut: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initial = (name?.trim()?.[0] ?? handle[0] ?? "?").toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="group inline-flex items-center gap-1.5 text-zinc-300 hover:text-[#a7f300] transition-colors"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-900 ring-2 ring-transparent group-hover:ring-[#a7f300]/30 transition">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[12px] font-mono font-medium text-zinc-300">{initial}</span>
          )}
        </span>
        <span
          aria-hidden
          className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-48 rounded-lg border border-white/10 bg-zinc-950/95 backdrop-blur-md p-1 shadow-xl shadow-black/40"
        >
          <div className="px-3 pt-2 pb-1.5 font-mono text-[12px] text-zinc-500 truncate">
            @{handle}
          </div>
          <Link
            href={`/u/${handle}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 text-[13px] text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
          >
            Profile
          </Link>
          {MENU_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`${l.mobileOnly ? "md:hidden " : ""}block rounded-md px-3 py-2 text-[13px] text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 text-[13px] text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 transition-colors"
          >
            Settings
          </Link>
          {isAdmin ? (
            <Link
              href="/admin/radar"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2 text-[13px] text-[#a7f300] hover:bg-zinc-900 transition-colors"
            >
              Radar admin
            </Link>
          ) : null}
          <div className="my-1 h-px bg-zinc-800" />
          <div className="px-3 py-2 text-[13px]">{signOut}</div>
        </div>
      ) : null}
    </div>
  );
}

export default ProfileMenu;
