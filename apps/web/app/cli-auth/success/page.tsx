import Link from "next/link";
import { redirect } from "next/navigation";
import { completeCliAuth } from "./actions";

const TOKEN_RE = /^[a-f0-9]{32,64}$/i;

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

export default async function CliAuthSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token || !TOKEN_RE.test(token)) {
    return (
      <Shell>
        <div className="flex items-center gap-2 mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">
            error
          </span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight mb-2">Failed to authorize</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">Invalid or missing token.</p>
      </Shell>
    );
  }

  const result = await completeCliAuth(token);
  if (!result.ok) {
    if (result.error === "not authenticated") {
      redirect(`/cli-auth?token=${encodeURIComponent(token)}`);
    }
    return (
      <Shell>
        <div className="flex items-center gap-2 mb-4">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
          <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">
            error
          </span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight mb-2">Failed to authorize</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">{result.error}</p>
        <p className="text-[11px] font-mono text-zinc-500 mt-5">
          Run <code className="text-zinc-300">trail login</code> again.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center gap-2 mb-4">
        <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#a7f300]">
          authorized
        </span>
      </div>
      <h1 className="text-lg font-semibold tracking-tight mb-2">
        Logged in as <span className="text-[#a7f300]">@{result.userHandle}</span>
      </h1>
      <p className="text-sm text-zinc-400 leading-relaxed">
        You can close this tab and return to your terminal.
      </p>
    </Shell>
  );
}
