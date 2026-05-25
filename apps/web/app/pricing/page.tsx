import type { Metadata } from "next";
import Link from "next/link";
import { UpgradeButton } from "./UpgradeButton";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "Pricing — Trail",
  description:
    "Trail is free for your first 3 public receipts. Upgrade to Pro for unlimited public + private receipts.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteNav currentPath="/pricing" />
      <main className="mx-auto max-w-4xl px-6 py-16 w-full">
        <header className="mb-12">
          <h1 className="text-4xl font-semibold tracking-tight">Simple pricing</h1>
          <p className="mt-3 text-neutral-600">
            Start free. Upgrade when you want unlimited receipts or private trails.
          </p>
        </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 p-6">
          <h2 className="text-xl font-semibold">Free</h2>
          <p className="mt-1 text-3xl font-bold">$0</p>
          <p className="text-sm text-neutral-500">forever</p>
          <ul className="mt-6 space-y-2 text-sm">
            <li>✓ Up to 3 public receipts</li>
            <li>✓ Public profile at /u/your-handle</li>
            <li>✓ Full CLI access</li>
            <li className="text-neutral-400">— No private receipts</li>
          </ul>
          <div className="mt-6">
            <Link
              href="/install"
              className="inline-block rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium"
            >
              Get started
            </Link>
          </div>
        </section>

        <section className="rounded-xl border-2 border-black p-6">
          <h2 className="text-xl font-semibold">Pro</h2>
          <p className="mt-1 text-3xl font-bold">
            $9<span className="text-base font-normal text-neutral-500">/mo</span>
          </p>
          <p className="text-sm text-neutral-500">cancel anytime</p>
          <ul className="mt-6 space-y-2 text-sm">
            <li>✓ Unlimited public receipts</li>
            <li>✓ Private receipts (share by link only)</li>
            <li>✓ Priority receipt generation</li>
            <li>✓ Everything in Free</li>
          </ul>
          <div className="mt-6">
            <UpgradeButton />
          </div>
        </section>
      </div>

      <p className="mt-10 text-center text-xs text-neutral-500">
        Payments handled by Stripe. We never see your card details.
      </p>
      </main>
    </div>
  );
}
