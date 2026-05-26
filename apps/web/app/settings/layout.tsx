import type { ReactNode } from "react";
import { SiteNav } from "@/components/site-nav";
import { SettingsTabs } from "./SettingsTabs";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <SiteNav currentPath="/settings" />
      <main className="max-w-3xl mx-auto px-6 pt-12 pb-24">
        <SettingsTabs />
        {children}
      </main>
    </div>
  );
}
