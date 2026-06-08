"use client";

import { Avatar } from "@/components/ui/avatar";
import {
  RADAR_REACTION_META,
  type RadarReactionKind,
  emptyRadarReactionCounts,
  isRadarReactionKind,
} from "@/lib/radar-engagement";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { type FormEvent, useState } from "react";

type RadarComment = {
  id: string;
  body: string | null;
  createdAt: string;
  deletedAt: string | null;
  author: {
    id: string;
    name: string;
    handle: string | null;
    image: string | null;
  };
};

type Props = {
  signalId: string;
  initialCounts: Record<RadarReactionKind, number>;
  initialMine: RadarReactionKind[];
  initialCommentCount: number;
  viewerId: string | null;
};

const COMMENT_MAX_LENGTH = 1600;

function signInRedirect() {
  const callbackURL = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/api/auth/sign-in/github?callbackURL=${encodeURIComponent(callbackURL)}`;
}

function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(delta / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

export function FeedPickEngagement({
  signalId,
  initialCounts,
  initialMine,
  initialCommentCount,
  viewerId,
}: Props) {
  const [counts, setCounts] = useState<Record<RadarReactionKind, number>>(() => ({
    ...emptyRadarReactionCounts(),
    ...initialCounts,
  }));
  const [mine, setMine] = useState<RadarReactionKind[]>(() => initialMine);
  const [pendingKind, setPendingKind] = useState<RadarReactionKind | null>(null);
  const [reactionError, setReactionError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comments, setComments] = useState<RadarComment[]>([]);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);

  const reactionsUrl = `/api/radar/${encodeURIComponent(signalId)}/reactions`;
  const commentsUrl = `/api/radar/${encodeURIComponent(signalId)}/comments`;

  async function toggleReaction(kind: RadarReactionKind) {
    if (!viewerId) {
      signInRedirect();
      return;
    }
    setPendingKind(kind);
    setReactionError(null);
    try {
      const res = await fetch(reactionsUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (res.status === 401) {
        signInRedirect();
        return;
      }
      if (!res.ok) {
        setReactionError("Could not save reaction.");
        return;
      }
      const data = (await res.json()) as {
        action?: "added" | "removed";
        counts?: Record<string, number>;
        mine?: string[];
      };
      if (data.action !== "added" && data.action !== "removed") {
        setReactionError("Could not save reaction.");
        return;
      }
      // Prefer authoritative server state so concurrent toggles can't drift.
      if (data.counts) {
        setCounts({
          ...emptyRadarReactionCounts(),
          ...(data.counts as Record<RadarReactionKind, number>),
        });
      } else {
        setCounts((prev) => ({
          ...prev,
          [kind]: Math.max(0, (prev[kind] ?? 0) + (data.action === "added" ? 1 : -1)),
        }));
      }
      if (data.mine) {
        setMine(data.mine.filter(isRadarReactionKind));
      } else {
        setMine((prev) =>
          data.action === "added"
            ? [...prev.filter((k) => k !== kind), kind]
            : prev.filter((k) => k !== kind),
        );
      }
    } catch {
      setReactionError("Could not save reaction.");
    } finally {
      setPendingKind(null);
    }
  }

  async function loadComments() {
    setLoading(true);
    setCommentError(null);
    try {
      const res = await fetch(commentsUrl);
      if (!res.ok) {
        setCommentError("Could not load comments.");
        return;
      }
      const data = (await res.json()) as { comments?: RadarComment[] };
      const list = data.comments ?? [];
      setComments(list);
      setCommentCount(list.length);
      setLoaded(true);
    } catch {
      setCommentError("Could not load comments.");
    } finally {
      setLoading(false);
    }
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) void loadComments();
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommentError(null);
    if (!viewerId) {
      signInRedirect();
      return;
    }
    const body = draft.trim();
    if (!body) {
      setCommentError("Write a comment before posting.");
      return;
    }
    setPosting(true);
    try {
      const res = await fetch(commentsUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.status === 401) {
        signInRedirect();
        return;
      }
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setCommentError(payload?.error ?? "Could not post comment.");
        return;
      }
      const payload = (await res.json()) as { comment: RadarComment };
      setComments((prev) => [...prev.filter((c) => c.id !== payload.comment.id), payload.comment]);
      setCommentCount((prev) => prev + 1);
      setDraft("");
    } catch {
      setCommentError("Could not post comment.");
    } finally {
      setPosting(false);
    }
  }

  async function deleteComment(commentId: string) {
    setCommentError(null);
    setDeleting(commentId);
    try {
      const res = await fetch(`${commentsUrl}/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
      });
      if (res.status === 401) {
        signInRedirect();
        return;
      }
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setCommentError(payload?.error ?? "Could not delete comment.");
        return;
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setCommentCount((prev) => Math.max(0, prev - 1));
    } catch {
      setCommentError("Could not delete comment.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="mt-4 border-t border-white/[0.06] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {RADAR_REACTION_META.map((meta) => {
          const isMine = mine.includes(meta.kind);
          const n = counts[meta.kind] ?? 0;
          return (
            <button
              key={meta.kind}
              type="button"
              disabled={pendingKind !== null}
              onClick={() => void toggleReaction(meta.kind)}
              title={meta.hint}
              aria-pressed={isMine}
              className={cn(
                "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-[border-color,background-color,color,transform] active:scale-[0.96]",
                isMine
                  ? "border-[var(--accent-border)] bg-[var(--accent)]/10 text-[var(--accent-text)]"
                  : "border-white/10 bg-black text-zinc-500 hover:border-white/20 hover:text-zinc-200",
                pendingKind !== null && "opacity-60",
              )}
            >
              <span>{meta.emoji}</span>
              <span className="hidden sm:inline">{meta.label}</span>
              <span className="tabular-nums">{n}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          className={cn(
            "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-[border-color,background-color,color,transform] active:scale-[0.96]",
            open
              ? "border-white/20 bg-white/[0.05] text-zinc-200"
              : "border-white/10 bg-black text-zinc-500 hover:border-white/20 hover:text-zinc-200",
          )}
        >
          <span>💬</span>
          <span className="hidden sm:inline">Reply</span>
          <span className="tabular-nums">{commentCount}</span>
        </button>
      </div>

      {reactionError ? <p className="mt-2 text-[11px] text-red-300">{reactionError}</p> : null}

      {open ? (
        <div className="mt-3">
          {viewerId ? (
            <form onSubmit={(event) => void submitComment(event)}>
              <textarea
                value={draft}
                onChange={(event) =>
                  setDraft(event.currentTarget.value.slice(0, COMMENT_MAX_LENGTH))
                }
                placeholder="Share your take on this pick..."
                rows={2}
                disabled={posting}
                className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-[13px] leading-6 text-white outline-none transition placeholder:text-zinc-700 focus:border-white/25 focus:ring-4 focus:ring-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
                maxLength={COMMENT_MAX_LENGTH}
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-zinc-600">
                <span>{COMMENT_MAX_LENGTH - draft.length} left</span>
                <button
                  type="submit"
                  disabled={posting}
                  className="rounded-full bg-zinc-100 px-3 py-1.5 text-[12px] font-medium text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[var(--accent)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {posting ? "Posting..." : "Post"}
                </button>
              </div>
            </form>
          ) : (
            <div className="border-l border-white/10 pl-3 text-[13px] text-zinc-400">
              <p className="text-zinc-200">Join the thread on this pick.</p>
              <button
                type="button"
                onClick={signInRedirect}
                className="mt-2 inline-flex min-h-8 items-center rounded-full bg-zinc-100 px-3 text-[12px] font-medium text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[var(--accent)] active:scale-[0.97]"
              >
                Sign in to reply
              </button>
            </div>
          )}

          {commentError ? <p className="mt-2 text-[11px] text-red-300">{commentError}</p> : null}

          <div className="mt-4 space-y-3">
            {loading ? (
              <p className="text-[12px] text-zinc-600">Loading thread...</p>
            ) : comments.length > 0 ? (
              comments.map((comment) => {
                const href = comment.author.handle ? `/u/${comment.author.handle}` : null;
                const canDelete = viewerId != null && viewerId === comment.author.id;
                return (
                  <article key={comment.id} className="border-l border-white/10 py-1 pl-3">
                    <div className="flex items-start gap-2.5">
                      <Avatar
                        src={comment.author.image}
                        alt={comment.author.name}
                        size={28}
                        fallback={comment.author.handle ?? comment.author.name}
                        className="border-white/10"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-[12px]">
                          {href ? (
                            <Link
                              href={href}
                              className="font-medium text-zinc-200 hover:text-white"
                            >
                              {comment.author.name}
                            </Link>
                          ) : (
                            <span className="font-medium text-zinc-200">{comment.author.name}</span>
                          )}
                          {comment.author.handle ? (
                            <span className="text-zinc-600">@{comment.author.handle}</span>
                          ) : null}
                          <span className="text-zinc-700">·</span>
                          <span className="text-zinc-600">{relativeTime(comment.createdAt)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-zinc-300">
                          {comment.body}
                        </p>
                        {canDelete ? (
                          <button
                            type="button"
                            disabled={deleting === comment.id}
                            onClick={() => void deleteComment(comment.id)}
                            className="mt-1.5 rounded-full px-2 py-1 text-[11px] text-red-300/70 transition-[background-color,color] hover:bg-red-400/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })
            ) : loaded ? (
              <p className="text-[12px] text-zinc-600">No replies yet. Start the thread.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
