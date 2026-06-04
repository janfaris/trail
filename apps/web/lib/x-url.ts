export type ParsedXPostUrl = {
  handle: string;
  statusId: string;
  normalizedUrl: string;
};

const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
const X_STATUS_RE = /^\d{5,30}$/;
const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
]);

function decodePathPart(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function parseXPostUrl(value: string | null | undefined): ParsedXPostUrl | null {
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!X_HOSTS.has(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const handle = decodePathPart(segments[0]);
  const statusSection = segments[1];
  const statusId = decodePathPart(segments[2]);

  if (!handle || !X_HANDLE_RE.test(handle)) return null;
  if (statusSection !== "status" && statusSection !== "statuses") return null;
  if (!statusId || !X_STATUS_RE.test(statusId)) return null;

  return {
    handle,
    statusId,
    normalizedUrl: `https://x.com/${handle}/status/${statusId}`,
  };
}
