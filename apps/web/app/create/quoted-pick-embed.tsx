export type QuotedPick = {
  author: string;
  handle: string;
  text: string;
  url: string;
};

// X-style embedded quote card. Pure presentational + server-safe so both the
// /create composer (client) and the signed-out gate (server) render the exact
// same embed without drift.
export function QuotedPickEmbed({ pick }: { pick: QuotedPick }) {
  const authorIsHandle = pick.author.trim().startsWith("@");
  const initial = (
    pick.author.replace(/^@/, "").trim().charAt(0) ||
    pick.handle.charAt(0) ||
    "?"
  ).toUpperCase();

  return (
    <a
      href={pick.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-2xl border border-white/[0.12] bg-black/30 p-3.5 transition-colors hover:border-white/25 hover:bg-black/45"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-zinc-300">
          {initial}
        </span>
        <div className="min-w-0 flex-1 truncate text-[13px]">
          <span className="font-semibold text-zinc-200">{pick.author}</span>
          {authorIsHandle ? null : <span className="text-zinc-500"> @{pick.handle}</span>}
          <span className="text-zinc-600"> · on X</span>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-3.5 w-3.5 shrink-0 text-zinc-500"
          aria-hidden="true"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </div>
      <p className="mt-2 line-clamp-5 whitespace-pre-line text-[13px] leading-6 text-zinc-300">
        {pick.text}
      </p>
    </a>
  );
}

// Repost / quote glyph (lucide `repeat`), shared by the feed Quote button and
// the /create "Quoting" caption.
export function QuoteRepostIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
