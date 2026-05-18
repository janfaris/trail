"use client";

import { Suspense, useEffect, useState } from "react";
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
          body: JSON.stringify({
            cookie: payload.cookie,
            userHandle: payload.userHandle,
          }),
        });
        if (cancelled) return;
        if (!res.ok) {
          setState({
            kind: "error",
            message: `CLI callback responded ${res.status}`,
          });
          return;
        }
        setState({ kind: "success", handle: payload.userHandle });
      } catch (e) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: (e as Error).message || "Failed to authorize",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callback, router]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full border border-zinc-900 rounded-lg p-8 text-center">
        {state.kind === "loading" && (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-[#a7f300]" />
            <h1 className="text-lg font-semibold">Authorizing CLI…</h1>
            <p className="text-sm text-zinc-400 mt-2">
              Sending credentials to your terminal.
            </p>
          </>
        )}
        {state.kind === "success" && (
          <>
            <div className="mx-auto mb-4 text-3xl text-[#a7f300]">✓</div>
            <h1 className="text-lg font-semibold">
              Logged in as{" "}
              <span className="text-[#a7f300]">@{state.handle}</span>
            </h1>
            <p className="text-sm text-zinc-400 mt-2">
              You can close this tab and return to your terminal.
            </p>
          </>
        )}
        {state.kind === "error" && (
          <>
            <div className="mx-auto mb-4 text-3xl text-red-400">✗</div>
            <h1 className="text-lg font-semibold">Failed to authorize</h1>
            <p className="text-sm text-zinc-400 mt-2">{state.message}</p>
            <p className="text-xs text-zinc-500 mt-4">
              Run <code className="text-zinc-300">trail login</code> again in
              your terminal.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
