import SiteNav from "@/components/site-nav";
import Link from "next/link";

const COMMUNITY_STEPS = [
  "Post what you demoed or shipped this week.",
  "Comment on another Puerto Rico builder's work.",
  "Bring the best threads into the next meetup.",
];

const PROMPTS = [
  "What AI workflow saved you time this week?",
  "What would you demo in five minutes?",
  "What local problem should Puerto Rico builders solve with AI?",
];

export default function PuertoRicoPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <SiteNav currentPath="/puerto-rico" />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
        <section className="border-y border-white/10 bg-zinc-950">
          <div className="border-b border-white/10 px-5 py-8 sm:px-8">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a7f300]">
              First community wedge
            </div>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.06em] text-zinc-50 sm:text-6xl">
              Puerto Rico AI builders, in one feed.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400">
              Trail is becoming the place for local developers, vibe coders, founders, and designers
              to share what they built with AI before and after meetups.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/create"
                className="inline-flex min-h-11 items-center rounded-full bg-zinc-100 px-5 text-sm font-semibold text-zinc-950 transition-[background-color,transform] hover:bg-white active:scale-[0.98]"
              >
                Post your build
              </Link>
              <Link
                href="/feed"
                className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-medium text-zinc-300 shadow-[var(--trail-shadow-border)] transition-colors hover:text-zinc-50"
              >
                Browse the feed
              </Link>
            </div>
          </div>

          <div className="grid divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {COMMUNITY_STEPS.map((step, index) => (
              <div key={step} className="px-5 py-6 sm:px-8">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-600">
                  0{index + 1}
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-300">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="border-y border-white/10 bg-zinc-950 px-5 py-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Meetup loop
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Meetup attendees publish build posts, the feed becomes the recap, and the next event
              starts with real local work instead of a blank agenda.
            </p>
          </div>

          <div className="border-y border-white/10 bg-zinc-950 px-5 py-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Discussion prompts
            </div>
            <div className="mt-4 space-y-3">
              {PROMPTS.map((prompt) => (
                <Link
                  key={prompt}
                  href="/create"
                  className="block border-t border-white/10 pt-3 text-sm leading-6 text-zinc-300 transition-colors first:border-t-0 first:pt-0 hover:text-zinc-50"
                >
                  {prompt}
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
