import { SiteNav } from "@/components/site-nav";
import type { Metadata } from "next";
import { headers } from "next/headers";
/* Hallmark · macrostructure: feed-led community landing · genre: technical/editorial · theme: trail-dark-lime
 * paper: oklch(15% 0.01 280) #09090b · accent: oklch(94% 0.27 130) #a7f300
 * display: Fraunces · body: Geist · sections: hero-feed · create-paths · community · proof · footer
 * motion: none — typography only · contrast: pass
 */
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Trail — share what you built with AI",
  description:
    "Trail is a social build feed for AI builders: post what you built, import from GitHub or X, join the Puerto Rico community, and learn from other builders.",
  openGraph: {
    title: "Trail — share what you built with AI",
    description:
      "A social build feed for AI builders, vibe coders, and local communities starting in Puerto Rico.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Trail — share what you built with AI",
    description:
      "Post builds, import GitHub/X proof, follow builders, and learn from what people are shipping with AI.",
  },
};

export const dynamic = "force-dynamic";

const SIGNIN_HREF = "/api/auth/sign-in/github?callbackURL=/feed";

const feedCards = [
  {
    label: "Native build post",
    title: "What I built, why it matters, and what I learned.",
    body: "Write the post directly in Trail. Add proof links only when they help the reader trust or reuse it.",
    href: "/create",
    cta: "Post a build",
  },
  {
    label: "GitHub import",
    title: "Turn a repo, PR, release, issue, or commit into a draft.",
    body: "Paste a public GitHub URL, let Trail pull the useful context, then edit before publishing.",
    href: "/create",
    cta: "Paste GitHub",
  },
  {
    label: "X discussion",
    title: "Bring useful AI-builder posts into the feed.",
    body: "Curate public X posts clearly as external source material, then add your own builder commentary.",
    href: "/create",
    cta: "Paste X URL",
  },
];

const createPaths = [
  {
    n: "01",
    title: "Write the build",
    body: "Start with the outcome. What changed? Who is it for? What should another builder steal?",
  },
  {
    n: "02",
    title: "Attach proof",
    body: "Add GitHub, demo, X, or screenshot links. Logs are optional proof, not the onboarding path.",
  },
  {
    n: "03",
    title: "Start the thread",
    body: "Publish to the feed so people can react, ask questions, save it, fork the idea, or follow you.",
  },
];

const communityLoop = [
  "Meetup demo becomes a Trail post.",
  "The post gives people something concrete to discuss.",
  "Builders follow each other by project, stack, and location.",
  "The next meetup starts with a warmer room.",
];

const proofLayers = [
  {
    label: "Default",
    title: "No-install build post",
    body: "Title, summary, lessons, tags, links, and a discussion thread. This is enough to participate.",
  },
  {
    label: "Credibility",
    title: "GitHub/X/demo links",
    body: "Public links make the post easier to trust without forcing anyone through setup.",
  },
  {
    label: "Advanced",
    title: "Optional proof appendix",
    body: "Agent logs, generated receipts, changed files, and timelines stay collapsed until a reader asks for deeper proof.",
  },
];

export default async function Home() {
  let signedIn = false;
  if (process.env.DATABASE_URL && process.env.BETTER_AUTH_SECRET) {
    try {
      const { auth } = await import("@/lib/auth");
      const sess = await auth.api.getSession({ headers: await headers() });
      signedIn = Boolean(sess?.user);
    } catch {
      signedIn = false;
    }
  }
  if (signedIn) redirect("/feed");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <SiteNav currentPath="/" />

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-16 sm:px-6 md:pt-24 lg:grid-cols-[minmax(0,1fr)_430px] lg:px-10">
          <div className="min-w-0">
            <div className="mb-8 max-w-fit rounded-full border border-[#a7f300]/20 bg-[#a7f300]/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#a7f300]">
              Build feed for AI-native builders
            </div>

            <h1 className="font-display max-w-[10ch] text-[58px] leading-[0.92] tracking-[-0.05em] text-zinc-50 sm:text-[76px] md:text-[96px]">
              Share what you built with AI.
            </h1>

            <p className="mt-6 max-w-[58ch] text-pretty text-[18px] leading-[1.55] text-zinc-300 md:text-[22px]">
              Trail is where builders post shipped work, import proof from GitHub or X, and learn
              from each other in public. Puerto Rico is the first community wedge.
            </p>

            <p className="mt-5 max-w-[72ch] font-mono text-[12px] leading-7 text-zinc-500">
              No install required to join the loop. Write a build post, paste a public URL, follow
              builders, reply with useful questions, and keep optional logs as proof only when they
              matter.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/create"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#a7f300] px-5 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-950 transition-colors hover:bg-[#c8ff5e]"
              >
                Post a build
              </Link>
              <Link
                href="/puerto-rico"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.07]"
              >
                Join Puerto Rico
              </Link>
              <Link
                href="/feed"
                className="inline-flex min-h-11 items-center justify-center rounded-full px-5 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-100"
              >
                Browse feed
              </Link>
            </div>
          </div>

          <div className="min-w-0 rounded-3xl border border-white/10 bg-black/30 p-3 shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
            <div className="rounded-2xl border border-white/[0.08] bg-[#0b0b0a]">
              <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-4 py-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                    Feed preview
                  </p>
                  <h2 className="mt-1 font-display text-[25px] leading-none text-zinc-50">
                    Builders are the product.
                  </h2>
                </div>
                <span className="rounded-full border border-[#a7f300]/30 bg-[#a7f300]/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#a7f300]">
                  Live loop
                </span>
              </div>

              <div className="divide-y divide-white/[0.08]">
                {feedCards.map((card) => (
                  <Link
                    key={card.label}
                    href={card.href}
                    className="group block px-4 py-4 transition-colors hover:bg-white/[0.025]"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#a7f300]">
                        {card.label}
                      </span>
                      <span className="rounded-full bg-white/[0.04] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500 group-hover:text-zinc-200">
                        {card.cta}
                      </span>
                    </div>
                    <h3 className="font-display text-[20px] leading-tight text-zinc-50">
                      {card.title}
                    </h3>
                    <p className="mt-2 text-[13px] leading-6 text-zinc-500">{card.body}</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:px-10">
            <div className="grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-600">
                  Create without install
                </p>
                <h2 className="mt-3 font-display text-[36px] leading-[1.02] tracking-[-0.035em] text-zinc-50 md:text-[48px]">
                  Publishing should feel easier than writing a thread.
                </h2>
              </div>
              <div className="grid gap-px overflow-hidden rounded-2xl bg-white/[0.06] shadow-[var(--trail-shadow-border)] md:grid-cols-3">
                {createPaths.map((path) => (
                  <article key={path.n} className="bg-zinc-950 p-5">
                    <div className="mb-8 flex items-center justify-between gap-4">
                      <span className="font-mono text-[11px] text-[#a7f300]">{path.n}</span>
                      <span className="h-px flex-1 bg-white/10" />
                    </div>
                    <h3 className="font-display text-[22px] leading-tight text-zinc-50">
                      {path.title}
                    </h3>
                    <p className="mt-3 text-[13px] leading-6 text-zinc-500">{path.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-white/10">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:px-10">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-600">
                Puerto Rico wedge
              </p>
              <h2 className="mt-3 max-w-[12ch] font-display text-[42px] leading-[0.98] tracking-[-0.04em] text-zinc-50 md:text-[62px]">
                A local room with a public feed.
              </h2>
              <p className="mt-5 max-w-[62ch] text-[15px] leading-7 text-zinc-400">
                Trail should be the home base for Puerto Rico AI builders: meetup demos, local
                projects, people to follow, and conversations that continue after the event ends.
              </p>
              <div className="mt-8">
                <Link
                  href="/puerto-rico"
                  className="inline-flex min-h-10 items-center rounded-full border border-[#a7f300]/40 px-4 font-mono text-[12px] uppercase tracking-[0.14em] text-[#a7f300] transition-colors hover:bg-[#a7f300]/10"
                >
                  Open the community hub
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                Community loop
              </p>
              <div className="mt-5 space-y-4">
                {communityLoop.map((item, index) => (
                  <div key={item} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 font-mono text-[11px] text-[#a7f300]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className="pt-1 text-[14px] leading-6 text-zinc-400">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 lg:px-10">
            <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-600">
                  Proof, not friction
                </p>
                <h2 className="mt-3 max-w-[13ch] font-display text-[38px] leading-[1] tracking-[-0.035em] text-zinc-50 md:text-[54px]">
                  Logs are optional. Trust is layered.
                </h2>
              </div>
              <p className="max-w-[45ch] text-[14px] leading-6 text-zinc-500">
                The public page should read like a post first. If someone wants deeper evidence,
                they can open proof details without forcing every reader through raw logs.
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-2xl bg-white/[0.06] shadow-[var(--trail-shadow-border)] md:grid-cols-3">
              {proofLayers.map((layer) => (
                <article key={layer.label} className="bg-zinc-950 p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#a7f300]">
                    {layer.label}
                  </p>
                  <h3 className="mt-4 font-display text-[22px] leading-tight text-zinc-50">
                    {layer.title}
                  </h3>
                  <p className="mt-3 text-[13px] leading-6 text-zinc-500">{layer.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/10">
          <div className="mx-auto max-w-5xl px-5 py-20 text-center sm:px-6 lg:px-10">
            <p className="mx-auto max-w-[48ch] font-display text-[34px] leading-[1.08] tracking-[-0.035em] text-zinc-50 md:text-[48px]">
              Start with one post. Let the network form around the work.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/create"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#a7f300] px-5 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-950 transition-colors hover:bg-[#c8ff5e]"
              >
                Post a build
              </Link>
              <a
                href={SIGNIN_HREF}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-5 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-zinc-50"
              >
                Sign in with GitHub
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-5 py-8 sm:flex-row sm:items-center sm:px-6 lg:px-10">
          <div className="font-display text-[15px] text-zinc-400">
            <Link href="/" className="text-zinc-200 hover:text-zinc-50">
              Trail
            </Link>
            <span className="mx-3 text-zinc-700">/</span>
            <span className="font-mono text-[12px] text-zinc-500">
              AI builder community, starting in Puerto Rico
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-5 font-mono text-[12px] text-zinc-500">
            <Link href="/feed" className="hover:text-zinc-200">
              feed
            </Link>
            <Link href="/create" className="hover:text-zinc-200">
              create
            </Link>
            <Link href="/puerto-rico" className="hover:text-zinc-200">
              puerto rico
            </Link>
            <Link href="/install" className="hover:text-zinc-200">
              advanced install
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
