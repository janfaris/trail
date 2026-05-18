export function shareUrl(handle: string, slug: string, origin?: string): string {
  const base = origin ?? "https://trail.dev";
  return `${base}/u/${handle}/${slug}`;
}

export function tweetIntent(text: string, url: string): string {
  const u = new URL("https://twitter.com/intent/tweet");
  u.searchParams.set("text", text);
  u.searchParams.set("url", url);
  return u.toString();
}

export function githubAvatar(handle: string, size = 128): string {
  return `https://github.com/${encodeURIComponent(handle)}.png?size=${size}`;
}
