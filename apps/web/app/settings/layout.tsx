import { SiteNav } from "@/components/site-nav";
import type { ReactNode } from "react";
import { SettingsTabs } from "./SettingsTabs";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_18%_0%,rgba(167,243,0,0.08),transparent_24rem),var(--page-base)] text-zinc-100">
      <SiteNav currentPath="/settings" />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6 lg:px-10">
        <section className="mb-6 rounded-[2rem] bg-black/55 p-6 shadow-[var(--trail-shadow-border)] sm:p-8">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--accent-text)]">
            Builder account
          </div>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="max-w-2xl text-4xl font-semibold leading-none tracking-[-0.07em] text-white sm:text-5xl">
                Settings
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                Tune the public identity and data connections behind your shipping proof.
              </p>
            </div>
            <a
              href="/dashboard"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-zinc-950 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300 shadow-[var(--trail-shadow-border)] transition-[box-shadow,color,transform] hover:text-white hover:shadow-[var(--trail-shadow-border-hover)] active:scale-[0.97]"
            >
              Open Studio
            </a>
          </div>
        </section>
        <SettingsTabs />
        {children}
      </main>
    </div>
  );
}
