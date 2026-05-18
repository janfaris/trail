import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";

function isValidCallback(cb: string | undefined): cb is string {
  if (!cb) return false;
  try {
    const u = new URL(cb);
    if (u.protocol !== "http:") return false;
    return u.hostname === "127.0.0.1" || u.hostname === "localhost";
  } catch {
    return false;
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="inline-flex font-mono text-[15px] font-semibold tracking-tight mb-8"
        >
          <span className="text-[#a7f300]">/</span>trail
        </Link>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-8">{children}</div>
      </div>
    </div>
  );
}

export default async function CliAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ callback?: string }>;
}) {
  const { callback } = await searchParams;

  if (!isValidCallback(callback)) {
    return (
      <Shell>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">
            invalid request
          </span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight mb-2">Invalid CLI request</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          This page must be opened by the Trail CLI. Run{" "}
          <code className="font-mono text-[#a7f300] bg-zinc-900 px-1.5 py-0.5 rounded">
            trail login
          </code>{" "}
          in your terminal.
        </p>
      </Shell>
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const successUrl = `/cli-auth/success?callback=${encodeURIComponent(callback)}`;

  if (session?.user) {
    redirect(successUrl);
  }

  const signInUrl = `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(successUrl)}`;

  return (
    <Shell>
      <div className="flex items-center gap-2 mb-4">
        <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">
          authorize cli
        </span>
      </div>
      <h1 className="text-xl font-semibold tracking-tight mb-2">Authorize Trail CLI</h1>
      <p className="text-sm text-zinc-400 leading-relaxed mb-7">
        The Trail CLI is requesting access to your account. After signing in, your CLI
        will be able to upload sessions on your behalf.
      </p>
      <Link
        href={signInUrl}
        className="inline-flex items-center justify-center gap-2 w-full h-10 rounded-md bg-[#a7f300] text-zinc-950 font-medium hover:bg-[#b9ff1f] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a7f300]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.34c-2.23.49-2.7-1.07-2.7-1.07-.37-.93-.9-1.18-.9-1.18-.73-.5.06-.49.06-.49.81.06 1.24.83 1.24.83.72 1.23 1.88.88 2.34.67.07-.52.28-.88.51-1.08-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.52.56.83 1.28.83 2.15 0 3.07-1.87 3.74-3.65 3.94.29.25.54.74.54 1.49v2.21c0 .21.15.46.55.38A8 8 0 0 0 8 0z" />
        </svg>
        Continue with GitHub
      </Link>
      <p className="text-[11px] font-mono text-zinc-500 mt-6 leading-relaxed">
        Revoke anytime with{" "}
        <code className="text-zinc-300">trail logout</code>.
      </p>
    </Shell>
  );
}
