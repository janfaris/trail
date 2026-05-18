/**
 * Strips a leading "/Users/<anything>/" prefix from a filesystem path
 * and returns just the basename (last path segment).
 *
 * Examples:
 *   formatRepoPath("/Users/anon/lupa")        => "lupa"
 *   formatRepoPath("/Users/anon/code/blok")   => "blok"
 *   formatRepoPath("blok")                    => "blok"
 *   formatRepoPath(null)                      => null
 */
export function formatRepoPath(repo: string | null | undefined): string | null {
  if (!repo) return null;
  const stripped = repo.replace(/^\/Users\/[^/]+\//, "");
  const parts = stripped.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : stripped;
}
