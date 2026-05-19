import { randomBytes } from "node:crypto";
import { z } from "zod";
import { DEFAULT_TRAIL_API_URL, ENDPOINTS } from "@trail/client";
import { saveAuth } from "./auth-storage.js";

// Device-code style login. The CLI generates a random token, opens the
// browser at /cli-auth?token=<id>, then polls /api/cli-auth/poll?token=<id>
// until the server returns the freshly-issued session cookie + handle.
//
// This replaces the previous loopback-callback flow, which was broken on
// HTTPS production because https://gettrail.vercel.app's success page
// cannot fetch http://127.0.0.1 (mixed content blocked by every browser).

const PollPending = z.object({ status: z.literal("pending") });
const PollReady = z.object({
  status: z.literal("ready"),
  cookie: z.string().min(1),
  userHandle: z.string().min(1),
});

export interface LoginOptions {
  baseUrl?: string;
  openBrowser?: (url: string) => Promise<unknown>;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export interface LoginResult {
  userHandle: string;
}

export async function runLoginFlow(opts: LoginOptions = {}): Promise<LoginResult> {
  const baseUrl = (opts.baseUrl ?? DEFAULT_TRAIL_API_URL).replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const pollIntervalMs = opts.pollIntervalMs ?? 2000;

  const token = randomBytes(24).toString("hex"); // 48 hex chars
  const authUrl = `${baseUrl}${ENDPOINTS.CLI_AUTH_PAGE}?token=${token}`;
  const initUrl = `${baseUrl}${ENDPOINTS.CLI_AUTH_INIT}`;
  const pollUrl = `${baseUrl}${ENDPOINTS.CLI_AUTH_POLL}?token=${token}`;

  // Register the token server-side before opening the browser. The web
  // page refuses to render the authorize button for unknown tokens, so
  // this step is what turns the URL into something the browser can use.
  const initRes = await fetch(initUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!initRes.ok) {
    const body = await initRes.text().catch(() => "");
    throw new Error(`failed to init login: ${initRes.status} ${body}`);
  }

  // eslint-disable-next-line no-console
  console.log(`Opening browser to ${authUrl}`);
  console.log(`(If your browser didn't open, paste the URL above.)`);
  if (opts.openBrowser) {
    opts.openBrowser(authUrl).catch(() => { /* user can paste */ });
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs);
    const res = await fetch(pollUrl, { method: "GET" });
    if (res.status === 202) continue; // pending
    if (res.status === 410) {
      // Token vanished server-side: either it expired or someone else
      // consumed it. Either way we can't recover this attempt.
      const body = await res.text().catch(() => "");
      throw new Error(`login token no longer valid: ${body}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`poll failed: ${res.status} ${body}`);
    }
    const parsed = PollReady.safeParse(await res.json());
    if (!parsed.success) {
      // Could be a transient pending payload — keep polling.
      continue;
    }
    saveAuth({ cookie: parsed.data.cookie, userHandle: parsed.data.userHandle });
    return { userHandle: parsed.data.userHandle };
  }
  throw new Error("Login timed out after 5 minutes");
}

// Suppress no-unused-vars for the imported schema; it's intentionally
// retained for future stricter response validation.
void PollPending;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
