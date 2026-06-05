export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Same-origin proxy for X (Twitter) video. X serves video.twimg.com MP4s with
// Referer-based hotlink protection: a browser playing the file directly from
// Trail sends `Referer: https://gettrail.vercel.app` and gets a 403, so inline
// <video> playback fails. This route fetches the bytes server-side with an
// x.com Referer and streams them back from our own origin, forwarding Range
// requests so seeking works. Host is allowlisted to avoid being an open proxy.

const ALLOWED_HOSTS = new Set(["video.twimg.com", "video-ft.twimg.com"]);
const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

function parseAllowedSource(raw: string | null): URL | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return null;
  return parsed;
}

export async function GET(req: Request): Promise<Response> {
  const target = parseAllowedSource(new URL(req.url).searchParams.get("src"));
  if (!target) {
    return new Response("Invalid or disallowed video source", { status: 400 });
  }

  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        ...(range ? { Range: range } : {}),
        Referer: "https://x.com/",
        Origin: "https://x.com",
        "User-Agent": "Mozilla/5.0 (compatible; TrailBot/1.0; +https://gettrail.vercel.app)",
        Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
      },
    });
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }

  if (upstream.status !== 200 && upstream.status !== 206) {
    return new Response("Upstream rejected the request", { status: 502 });
  }

  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("content-type")) headers.set("content-type", "video/mp4");
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=86400, s-maxage=86400");
  headers.set("x-content-type-options", "nosniff");

  return new Response(upstream.body, { status: upstream.status, headers });
}
