import { createServer, type Server } from "node:http";
import { z } from "zod";
import { DEFAULT_TRAIL_API_URL, ENDPOINTS } from "@trail/client";
import { saveAuth } from "./auth-storage.js";

// Payload the web's /cli-auth/success page POSTs back to the CLI's local callback.
const CallbackPayload = z.object({
  cookie: z.string().min(1),
  userHandle: z.string().min(1),
});

export interface LoginOptions {
  baseUrl?: string;
  port?: number;
  openBrowser?: (url: string) => Promise<unknown>;
  timeoutMs?: number;
}

export interface LoginResult {
  userHandle: string;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export async function runLoginFlow(opts: LoginOptions = {}): Promise<LoginResult> {
  const baseUrl = (opts.baseUrl ?? DEFAULT_TRAIL_API_URL).replace(/\/+$/, "");
  const port = opts.port ?? 0; // 0 = OS-assigned random port
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;

  return new Promise<LoginResult>((resolve, reject) => {
    let server: Server | null = null;
    const timer = setTimeout(() => {
      server?.close();
      reject(new Error("Login timed out after 5 minutes"));
    }, timeoutMs);

    server = createServer((req, res) => {
      if (req.method === "OPTIONS") {
        res.writeHead(204, CORS_HEADERS);
        res.end();
        return;
      }
      if (req.method !== "POST" || !req.url?.startsWith("/cli-callback")) {
        res.writeHead(404, CORS_HEADERS);
        res.end();
        return;
      }
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const parsed = CallbackPayload.parse(JSON.parse(body));
          saveAuth({ cookie: parsed.cookie, userHandle: parsed.userHandle });
          res.writeHead(200, { "content-type": "application/json", ...CORS_HEADERS });
          res.end(JSON.stringify({ ok: true }));
          clearTimeout(timer);
          server?.close();
          resolve({ userHandle: parsed.userHandle });
        } catch (e) {
          res.writeHead(400, CORS_HEADERS);
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    });

    server.listen(port, "127.0.0.1", async () => {
      const addr = server!.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to bind callback server"));
        return;
      }
      const callback = `http://127.0.0.1:${addr.port}/cli-callback`;
      const url = `${baseUrl}${ENDPOINTS.CLI_AUTH_PAGE}?callback=${encodeURIComponent(callback)}`;
      // eslint-disable-next-line no-console
      console.log(`Opening browser to ${url}`);
      console.log(`(If your browser didn't open, paste the URL above.)`);
      if (opts.openBrowser) {
        opts.openBrowser(url).catch(() => { /* user can paste */ });
      }
    });
  });
}
