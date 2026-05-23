"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "ok" | "err";

export function EmailDigestForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [note, setNote] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || status === "submitting") return;
    setStatus("submitting");
    setNote(null);
    try {
      // TODO(pr3): wire to real backend (resend / loops / convertkit).
      // Placeholder route just logs + 200s so the UX works end-to-end.
      const res = await fetch("/api/learn/digest-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("ok");
      setNote("You're on the list. One email per week, unsub one click.");
      setEmail("");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[digest-subscribe] failed", err);
      setStatus("err");
      setNote("Something broke on our end. Try again in a minute.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2 max-w-md">
      <label htmlFor="digest-email" className="sr-only">
        Email
      </label>
      <input
        id="digest-email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@somewhere.dev"
        disabled={status === "submitting"}
        className="flex-1 h-11 px-3.5 rounded-md border border-zinc-800 bg-zinc-900/50 font-mono text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#a7f300]/60 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="h-11 px-5 rounded-md bg-[#a7f300] text-zinc-950 font-mono text-[13px] font-medium hover:bg-[#b8ff1a] disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        {status === "submitting" ? "…" : "Subscribe →"}
      </button>
      {note && (
        <p
          role="status"
          className={`sm:basis-full text-[12px] font-mono ${
            status === "ok" ? "text-[#a7f300]" : "text-red-400"
          }`}
        >
          {note}
        </p>
      )}
    </form>
  );
}
