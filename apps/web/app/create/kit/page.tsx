export const dynamic = "force-dynamic";

import { SiteNav } from "@/components/site-nav";
import { auth } from "@/lib/auth";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateKitClient } from "./create-kit-client";

export const metadata: Metadata = {
  title: "Build a Kit | Trail",
  description: "Turn a repo's rules + stack into a reusable Build Kit other builders can steal.",
};

export default async function CreateKitPage() {
  let signedIn = false;
  try {
    const sess = await auth.api.getSession({ headers: await headers() });
    signedIn = Boolean(sess?.user);
  } catch {
    signedIn = false;
  }
  if (!signedIn) {
    redirect("/api/auth/sign-in/github?callbackURL=/create/kit");
  }

  return (
    <div className="min-h-screen bg-[#080808] text-zinc-50">
      <SiteNav currentPath="/create" />
      <main className="mx-auto w-full max-w-[640px] px-0 sm:px-4">
        <div className="min-h-[calc(100vh-3.5rem)] border-white/[0.08] bg-[#0b0b0a] sm:border-x">
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
            <Link
              href="/create"
              className="text-[14px] font-medium text-zinc-300 hover:text-zinc-100"
            >
              <span aria-hidden className="text-zinc-500">
                ←
              </span>{" "}
              Build a Kit
            </Link>
          </div>
          <div className="border-b border-white/[0.08] px-4 py-5 sm:px-5">
            <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-zinc-50">
              Turn a repo into a Build Kit
            </h1>
            <p className="mt-2 text-[14px] leading-6 text-zinc-400">
              A Build Kit is the reusable setup behind your work — agent rules, stack, and the
              prompts that worked. Other builders can steal it into their tool in one click.
            </p>
          </div>
          <div className="px-4 py-5 sm:px-5">
            <CreateKitClient />
          </div>
        </div>
      </main>
    </div>
  );
}
