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

export default async function CliAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ callback?: string }>;
}) {
  const { callback } = await searchParams;

  if (!isValidCallback(callback)) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full border border-zinc-900 rounded-lg p-8">
          <h1 className="text-xl font-semibold mb-2">Invalid CLI request</h1>
          <p className="text-sm text-zinc-400">
            This page must be opened by the Trail CLI. Run{" "}
            <code className="text-[#a7f300]">trail login</code> in your terminal.
          </p>
        </div>
      </div>
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const successUrl = `/cli-auth/success?callback=${encodeURIComponent(callback)}`;

  if (session?.user) {
    redirect(successUrl);
  }

  const signInUrl = `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(successUrl)}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full border border-zinc-900 rounded-lg p-8">
        <h1 className="text-2xl font-semibold mb-3">Authorize Trail CLI</h1>
        <p className="text-sm text-zinc-400 mb-6">
          The Trail CLI is requesting access to your account. After signing in,
          your CLI will be able to upload sessions on your behalf.
        </p>
        <Link
          href={signInUrl}
          className="inline-flex items-center justify-center w-full h-10 rounded-md bg-[#a7f300] text-zinc-950 font-medium hover:bg-[#b8ff14] transition"
        >
          Continue with GitHub
        </Link>
        <p className="text-xs text-zinc-500 mt-6">
          You can revoke this anytime by running{" "}
          <code className="text-zinc-300">trail logout</code> in your terminal.
        </p>
      </div>
    </div>
  );
}
