import type { Session } from "@trail/schema";
import { DEFAULT_TRAIL_API_URL, ENDPOINTS } from "./constants.js";
import { UploadSessionResponse, type UploadSessionResponse as UploadOk } from "./contracts.js";

export * from "./constants.js";
export * from "./contracts.js";

export type UploadError =
  | { kind: "unauthenticated" }
  | { kind: "invalid-session"; issues: unknown }
  | { kind: "server"; status: number; message: string }
  | { kind: "network"; message: string }
  | { kind: "bad-response"; message: string };

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface TrailClientOptions {
  baseUrl?: string;
  getAuthCookie: () => string | null;
  fetchImpl?: typeof fetch;
}

export interface TrailClient {
  uploadSession(session: Session): Promise<Result<UploadOk, UploadError>>;
}

export function createTrailClient(opts: TrailClientOptions): TrailClient {
  const baseUrl = (opts.baseUrl ?? DEFAULT_TRAIL_API_URL).replace(/\/+$/, "");
  const f = opts.fetchImpl ?? fetch;

  return {
    async uploadSession(session) {
      const cookie = opts.getAuthCookie();
      if (!cookie) return { ok: false, error: { kind: "unauthenticated" } };

      let res: Response;
      try {
        res = await f(`${baseUrl}${ENDPOINTS.UPLOAD_SESSION}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie,
          },
          body: JSON.stringify(session),
        });
      } catch (e) {
        return { ok: false, error: { kind: "network", message: (e as Error).message } };
      }

      if (res.status === 401) return { ok: false, error: { kind: "unauthenticated" } };

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { ok: false, error: { kind: "bad-response", message: `non-json from server (status ${res.status})` } };
      }

      if (res.status === 400) {
        const err = body as { issues?: unknown };
        return { ok: false, error: { kind: "invalid-session", issues: err.issues } };
      }
      if (!res.ok) {
        const err = body as { error?: string };
        return { ok: false, error: { kind: "server", status: res.status, message: err.error ?? `status ${res.status}` } };
      }

      const parsed = UploadSessionResponse.safeParse(body);
      if (!parsed.success) {
        return { ok: false, error: { kind: "bad-response", message: "response did not match contract" } };
      }
      return { ok: true, value: parsed.data };
    },
  };
}
