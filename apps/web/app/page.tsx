import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const demos = [
  { slug: "sample-1", tool: "claude-code", title: "Refactor auth flow", events: 42 },
  { slug: "sample-2", tool: "codex", title: "Implement vector search", events: 28 },
  { slug: "sample-3", tool: "cursor", title: "Migrate Postgres schema", events: 67 },
];

const tiers = [
  { name: "Free", price: "$0", desc: "5 share links / month", features: ["Public sessions", "Basic search", "Community support"] },
  { name: "Pro", price: "$15", desc: "For solo builders", features: ["Unlimited share links", "Custom domain", "Private sessions", "Priority support"], featured: true },
  { name: "Team", price: "$30", desc: "Per user, per month", features: ["Everything in Pro", "Workspace", "Team search", "SSO"] },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-900">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="font-mono text-lg font-semibold">
            <span className="text-[#a7f300]">/</span>trail
          </Link>
          <nav className="flex items-center gap-6">
            <a href="https://github.com/janfaris/trail" className="text-sm text-zinc-400 hover:text-zinc-100">
              GitHub
            </a>
            <a href="/api/auth/sign-in/github">
              <Button size="sm">Sign in with GitHub</Button>
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-4xl mx-auto px-6 pt-24 pb-20">
          <Badge className="mb-6">v0.1 · open source</Badge>
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05] mb-6">
            The GitHub for{" "}
            <span className="text-[#a7f300]">AI coding sessions</span>.
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl mb-10 leading-relaxed">
            Record. Search. Share. Your AI work as portable, public proof-of-work.
          </p>

          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 font-mono text-sm mb-10 max-w-xl">
            <span className="text-zinc-500 select-none">$ </span>
            <span className="text-zinc-100">npm install -g @trail/cli</span>
          </div>

          <div className="flex gap-3">
            <a href="/api/auth/sign-in/github">
              <Button size="lg">Get started — it&apos;s free</Button>
            </a>
            <a href="https://github.com/janfaris/trail">
              <Button size="lg" variant="outline">View on GitHub</Button>
            </a>
          </div>
        </section>

        {/* Demo sessions */}
        <section className="max-w-6xl mx-auto px-6 py-20 border-t border-zinc-900">
          <h2 className="text-2xl font-semibold mb-2">Recent sessions</h2>
          <p className="text-zinc-500 mb-10">A few public trails from the community.</p>
          <div className="grid md:grid-cols-3 gap-4">
            {demos.map((d) => (
              <Link key={d.slug} href={`/u/demo/${d.slug}`}>
                <Card className="hover:border-zinc-700 transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <Badge>{d.tool}</Badge>
                      <span className="text-xs text-zinc-500 font-mono">{d.events} events</span>
                    </div>
                    <CardTitle className="text-base">{d.title}</CardTitle>
                    <CardDescription>@demo</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section className="max-w-6xl mx-auto px-6 py-20 border-t border-zinc-900">
          <h2 className="text-2xl font-semibold mb-2">Pricing</h2>
          <p className="text-zinc-500 mb-10">Start free. Upgrade when you need more.</p>
          <div className="grid md:grid-cols-3 gap-4">
            {tiers.map((t) => (
              <Card key={t.name} className={t.featured ? "border-[#a7f300]/40" : ""}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{t.name}</CardTitle>
                    {t.featured && <Badge className="border-[#a7f300]/40 text-[#a7f300]">Popular</Badge>}
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-semibold">{t.price}</span>
                    <span className="text-zinc-500 text-sm">/mo</span>
                  </div>
                  <CardDescription>{t.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm text-zinc-300">
                    {t.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <span className="text-[#a7f300]">→</span> {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-900 mt-20">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between text-sm text-zinc-500">
          <span className="font-mono">/trail</span>
          <a href="https://github.com/janfaris/trail" className="hover:text-zinc-100">
            View on GitHub →
          </a>
        </div>
      </footer>
    </div>
  );
}
