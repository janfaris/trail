"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getCliAuthPayload } from "./actions";

type State =
  | { kind: "loading" }
  | { kind: "success"; handle: string }
  | { kind: "error"; message: string };

function isValidCallback(cb: string | null): cb is string {
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

export default function CliAuthSuccessPage() {
  return (
    <Suspense fallback={null}>
      <CliAuthSuccessInner />
    </Suspense>
  );
}

function CliAuthSuccessInner() {
  const router = useRouter();
  const params = useSearchParams();
  const callback = params.get("callback");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!isValidCallback(callback)) {
      setState({ kind: "error", message: "Invalid or missing callback." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const payload = await getCliAuthPayload();
        if (cancelled) return;
        if (!payload.ok) {
          if (payload.error === "not authenticated") {
            router.replace(`/cli-auth?callback=${encodeURIComponent(callback)}`);
            return;
          }
          setState({ kind: "error", message: payload.error });
          return;
        }
        const res = await fetch(callback, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ cookie: payload.cookie, userHandle: payload.userHandle }),
        });
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: `CLI callback responded ${res.status}` });
          return;
        }
        setState({ kind: "success", handle: payload.userHandle });
      } catch (e) {
        if (cancelled) return;
        setState({ kind: "error", message: (e as Error).message || "Failed to authorize" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callback, router]);

  useEffect(() => {
    if (state.kind !== "success") return;
    const t = setTimeout(() => {
      try {
        window.close();
      } catch {
        /* some browsers block */
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [state.kind]);

  return (
    <Shell>
      {state.kind === "loading" && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">
              authorizing
            </span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight mb-2">Authorizing CLI…</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Sending credentials back to your terminal.
          </p>
        </>
      )}
      {state.kind === "success" && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-[#a7f300] shadow-[0_0_8px_#a7f300]" />
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#a7f300]">
              authorized
            </span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight mb-2">
            Logged in as <span className="text-[#a7f300]">@{state.handle}</span>
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            You can close this tab and return to your terminal.
          </p>
        </>
      )}
      {state.kind === "error" && (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-500">
              error
            </span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight mb-2">Failed to authorize</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">{state.message}</p>
          <p className="text-[11px] font-mono text-zinc-500 mt-5">
            Run <code className="text-zinc-300">trail login</code> again.
          </p>
        </>
      )}
    </Shell>
  );
}
