export const dynamic = "force-dynamic";

import { KitCard } from "@/components/kit-card";
import { SiteNav } from "@/components/site-nav";
import { auth } from "@/lib/auth";
import { listKitsByUser } from "@/lib/kit-queries";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Your Build Kits | Trail",
  description:
    "Your reusable setups — searchable, reusable, and ready to steal back into any build.",
};

export default async function LibraryPage() {
  let userId: string | null = null;
  try {
    const sess = await auth.api.getSession({ headers: await headers() });
    userId = sess?.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    redirect("/api/auth/sign-in/github?callbackURL=/library");
  }

  const kits = await listKitsByUser(userId, { includePrivate: true, limit: 60 });

  return (
    <div className="min-h-screen bg-[#080808] text-zinc-50">
      <SiteNav currentPath="/library" />
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#a7f300]">
              Your library
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              Your Build Kits
            </h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-zinc-400">
              Every setup you've captured — reusable across your own builds, or shared so others can
              steal them.
            </p>
          </div>
          <Link
            href="/create/kit"
            className="inline-flex min-h-10 shrink-0 items-center rounded-full bg-[#a7f300] px-4 text-[13px] font-medium text-black transition-[background-color,transform] hover:bg-[#b6ff14] active:scale-[0.97]"
          >
            New Kit →
          </Link>
        </div>

        {kits.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-white/10 bg-zinc-950/60 p-10 text-center">
            <p className="text-lg font-semibold text-zinc-200">No kits yet.</p>
            <p className="mt-2 text-sm text-zinc-500">
              Turn one of your repos into a reusable setup — Trail reads its rules and stack for
              you.
            </p>
            <Link
              href="/create/kit"
              className="mt-4 inline-flex min-h-10 items-center rounded-full bg-[#a7f300] px-4 text-[13px] font-medium text-black hover:bg-[#b6ff14]"
            >
              Build your first Kit →
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {kits.map((kit) => (
              <KitCard key={kit.id} kit={kit} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
