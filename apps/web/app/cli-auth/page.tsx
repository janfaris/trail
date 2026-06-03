import Link from "next/link";
import { redirect } from "next/navigation";

const TOKEN_RE = /^[a-f0-9]{32,64}$/i;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_50%_0%,rgba(167,243,0,0.1),transparent_24rem),#050505] p-6 text-zinc-100">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-8 inline-flex font-mono text-[15px] font-semibold tracking-tight"
        >
          <span className="text-[#a7f300]">/</span>trail
        </Link>
        <div className="rounded-[2rem] bg-zinc-950/70 p-8 shadow-[var(--trail-shadow-border)]">
          {children}
        </div>
      </div>
    </div>
  );
}

function InvalidShell() {
  return (
    <Shell>
      <div className="mb-3 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          invalid request
        </span>
      </div>
      <h1 className="mb-2 text-lg font-semibold tracking-tight">Invalid CLI request</h1>
      <p className="text-sm leading-relaxed text-zinc-400">
        This page must be opened by the Trail CLI. Run{" "}
        <code className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[#a7f300]">
          trail login
        </code>{" "}
        in your terminal.
      </p>
    </Shell>
  );
}

export default async function CliAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token || !TOKEN_RE.test(token)) {
    return <InvalidShell />;
  }

  const [{ headers }, { eq }, { auth }, { db, schema }] = await Promise.all([
    import("next/headers"),
    import("drizzle-orm"),
    import("@/lib/auth"),
    import("@/db/client"),
  ]);

  // Token must have been pre-registered by the CLI via /api/cli-auth/init.
  // This keeps the cli-auth page a pure consumer and lets a stale or
  // unknown token render the same "invalid request" message instead of
  // silently creating a row that no one is polling.
  const existing = await db.query.cliToken.findFirst({
    where: eq(schema.cliToken.id, token),
  });
  if (!existing || existing.expiresAt.getTime() < Date.now()) {
    return <InvalidShell />;
  }

  const successUrl = `/cli-auth/success?token=${encodeURIComponent(token)}`;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) {
    redirect(successUrl);
  }

  const signInUrl = `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(successUrl)}`;

  return (
    <Shell>
      <div className="mb-4 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          authorize cli
        </span>
      </div>
      <h1 className="mb-2 text-xl font-semibold tracking-tight">Authorize Trail CLI</h1>
      <p className="mb-7 text-sm leading-relaxed text-zinc-400">
        The Trail CLI is requesting access to your account. After signing in, your CLI will be able
        to upload sessions on your behalf.
      </p>
      <Link
        href={signInUrl}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#a7f300] font-medium text-zinc-950 transition-[background-color,transform] hover:bg-[#b9ff1f] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7f300]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" role="img">
          <title>GitHub</title>
          <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.34c-2.23.49-2.7-1.07-2.7-1.07-.37-.93-.9-1.18-.9-1.18-.73-.5.06-.49.06-.49.81.06 1.24.83 1.24.83.72 1.23 1.88.88 2.34.67.07-.52.28-.88.51-1.08-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.52.56.83 1.28.83 2.15 0 3.07-1.87 3.74-3.65 3.94.29.25.54.74.54 1.49v2.21c0 .21.15.46.55.38A8 8 0 0 0 8 0z" />
        </svg>
        Continue with GitHub
      </Link>
      <p className="mt-6 font-mono text-[11px] leading-relaxed text-zinc-500">
        Revoke anytime with <code className="text-zinc-300">trail logout</code>.
      </p>
    </Shell>
  );
}
