import Link from "next/link";
import { redirect } from "next/navigation";

const TOKEN_RE = /^[a-f0-9]{32,64}$/i;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_50%_0%,rgba(167,243,0,0.1),transparent_24rem),var(--page-base)] p-6 text-zinc-100">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex font-mono text-[15px] font-semibold tracking-tight"
        >
          <span className="text-[var(--accent-text)]">/</span>trail
        </Link>
        <div className="rounded-[2rem] bg-zinc-950/70 p-8 shadow-[var(--trail-shadow-border)]">
          {children}
        </div>
      </div>
    </div>
  );
}

export default async function CliAuthSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token || !TOKEN_RE.test(token)) {
    return (
      <Shell>
        <div className="mb-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            error
          </span>
        </div>
        <h1 className="mb-2 text-lg font-semibold tracking-tight">Failed to authorize</h1>
        <p className="text-sm leading-relaxed text-zinc-400">Invalid or missing token.</p>
      </Shell>
    );
  }

  const { completeCliAuth } = await import("./actions");
  const result = await completeCliAuth(token);
  if (!result.ok) {
    if (result.error === "not authenticated") {
      redirect(`/cli-auth?token=${encodeURIComponent(token)}`);
    }
    return (
      <Shell>
        <div className="mb-4 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
            error
          </span>
        </div>
        <h1 className="mb-2 text-lg font-semibold tracking-tight">Failed to authorize</h1>
        <p className="text-sm leading-relaxed text-zinc-400">{result.error}</p>
        <p className="mt-5 font-mono text-[11px] text-zinc-500">
          Run <code className="text-zinc-300">trail login</code> again.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-4 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent-text)]">
          authorized
        </span>
      </div>
      <h1 className="mb-2 text-lg font-semibold tracking-tight">
        Logged in as <span className="text-[var(--accent-text)]">@{result.userHandle}</span>
      </h1>
      <p className="text-sm leading-relaxed text-zinc-400">
        You can close this tab and return to your terminal.
      </p>
    </Shell>
  );
}
