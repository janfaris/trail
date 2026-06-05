// Best-effort Open Graph image extraction for build-post proof links.
//
// This runs server-side at publish time against a user-pasted public proof URL
// (a demo/deploy site, a GitHub page, or an X status). It must never block or
// fail publishing: every error path returns null. SSRF hardening keeps it from
// being pointed at internal services — only public http(s) hosts are fetched,
// the response is size- and time-capped, and only HTML is parsed.

const DEFAULT_TIMEOUT_MS = 4000;
const MAX_HTML_BYTES = 512 * 1024; // 512 KB is plenty for <head> metadata.
const MAX_IMAGE_URL_LENGTH = 1000;

const PRIVATE_IPV4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./, // CGNAT 100.64.0.0/10
];

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;

  // Bracketless IPv6 / loopback / link-local / unique-local.
  const v6 = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fe80:") || v6.startsWith("fc") || v6.startsWith("fd")) return true;

  if (PRIVATE_IPV4.some((pattern) => pattern.test(host))) return true;
  return false;
}

function safeParseUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (isBlockedHostname(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

async function readCappedText(response: Response): Promise<string | null> {
  const body = response.body;
  if (!body) {
    try {
      const text = await response.text();
      return text.slice(0, MAX_HTML_BYTES);
    } catch {
      return null;
    }
  }

  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let received = 0;
  let html = "";
  try {
    while (received < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
    }
  } catch {
    return html || null;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore cancel failures
    }
  }
  return html;
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  if (!match) return null;
  return match[2] ?? match[3] ?? null;
}

// Prefer og:image, then og:image:secure_url, then twitter:image.
function extractMetaImage(html: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi);
  if (!metaTags) return null;

  const candidates = new Map<string, string>();
  for (const tag of metaTags) {
    const key = (attr(tag, "property") ?? attr(tag, "name"))?.toLowerCase();
    if (!key) continue;
    if (key !== "og:image" && key !== "og:image:secure_url" && key !== "twitter:image") continue;
    const content = attr(tag, "content");
    if (content && !candidates.has(key)) candidates.set(key, content.trim());
  }

  return (
    candidates.get("og:image") ??
    candidates.get("og:image:secure_url") ??
    candidates.get("twitter:image") ??
    null
  );
}

export type FetchOgImageOptions = {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export async function fetchOgImage(
  pageUrl: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch }: FetchOgImageOptions = {},
): Promise<string | null> {
  const target = safeParseUrl(pageUrl);
  if (!target) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(timeoutMs, 500), 10_000));

  try {
    const response = await fetchImpl(target.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "TrailBot/1.0 (+https://gettrail.vercel.app)",
      },
    });

    if (!response.ok) return null;

    // Defense-in-depth: if redirects landed on a private host, drop it.
    const finalUrl = safeParseUrl(response.url || target.toString());
    if (!finalUrl) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;

    const html = await readCappedText(response);
    if (!html) return null;

    const raw = extractMetaImage(html);
    if (!raw) return null;

    let resolved: URL;
    try {
      resolved = new URL(raw, finalUrl);
    } catch {
      return null;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    if (resolved.href.length > MAX_IMAGE_URL_LENGTH) return null;

    return resolved.href;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Pick the best proof URL to scrape an image from. Demo/deploy pages usually
// have the richest OG card, then GitHub (social card), then X.
export function pickPreviewSourceUrl(urls: {
  demoUrl?: string | null;
  githubUrl?: string | null;
  xUrl?: string | null;
}): string | null {
  return urls.demoUrl || urls.githubUrl || urls.xUrl || null;
}
