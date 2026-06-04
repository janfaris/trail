"use client";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";

export type ReceiptComment = {
  id: string;
  parentId: string | null;
  body: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  author: {
    id: string;
    name: string;
    handle: string | null;
    image: string | null;
  };
};

type CommentViewer = {
  id: string;
  name: string;
  handle: string | null;
  image: string | null;
};

type CommentThreadProps = {
  slug: string;
  authorHandle: string | null;
  ownerId: string;
  initialComments: ReceiptComment[];
  viewer: CommentViewer | null;
  signInHref: string;
  threadStarters?: string[] | null;
};

const MAX_COMMENT_LENGTH = 1600;
const THREAD_STARTERS = [
  "What tradeoff made this work?",
  "Where would you fork this next?",
  "What broke before the final fix?",
];

function sortComments(comments: ReceiptComment[]) {
  return [...comments].sort((a, b) => {
    const createdDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

    if (createdDiff !== 0) {
      return createdDiff;
    }

    return a.id.localeCompare(b.id);
  });
}

function relativeTime(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(delta / 60_000));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function authorHref(handle: string | null) {
  return handle ? `/u/${handle}` : null;
}

export function CommentThread({
  slug,
  authorHandle,
  ownerId,
  initialComments,
  viewer,
  signInHref,
  threadStarters,
}: CommentThreadProps) {
  const [comments, setComments] = useState(() => sortComments(initialComments));
  const [draft, setDraft] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setComments(sortComments(initialComments));
  }, [initialComments]);

  const query = authorHandle ? `?user=${encodeURIComponent(authorHandle)}` : "";
  const commentsUrl = `/api/sessions/${encodeURIComponent(slug)}/comments${query}`;
  const commentUrl = (commentId: string) =>
    `/api/sessions/${encodeURIComponent(slug)}/comments/${encodeURIComponent(commentId)}${query}`;

  const commentsById = useMemo(() => {
    const map = new Map<string, ReceiptComment>();

    for (const comment of comments) {
      map.set(comment.id, comment);
    }

    return map;
  }, [comments]);

  const repliesByParent = useMemo(() => {
    const map = new Map<string, ReceiptComment[]>();

    for (const comment of comments) {
      if (!comment.parentId) {
        continue;
      }

      const replies = map.get(comment.parentId) ?? [];
      replies.push(comment);
      map.set(comment.parentId, replies);
    }

    return map;
  }, [comments]);

  const roots = comments.filter((comment) => !comment.parentId);
  const visibleCount = comments.filter((comment) => !comment.deletedAt).length;
  const visibleReplies = comments.filter(
    (comment) => comment.parentId && !comment.deletedAt,
  ).length;
  const starterPrompts = threadStarters?.length ? threadStarters.slice(0, 3) : THREAD_STARTERS;

  function useThreadStarter(prompt: string) {
    if (!viewer) {
      window.location.assign(signInHref);
      return;
    }

    setDraft(prompt);
    setError(null);
  }

  async function submitComment(event: FormEvent<HTMLFormElement>, parentId: string | null) {
    event.preventDefault();
    setError(null);

    if (!viewer) {
      window.location.assign(signInHref);
      return;
    }

    const body = (parentId ? replyDraft : draft).trim();

    if (!body) {
      setError("Add a comment before posting.");
      return;
    }

    setPendingTarget(parentId ?? "root");
    const response = await fetch(commentsUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body, parentId }),
    });

    if (response.status === 401) {
      window.location.assign(signInHref);
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Could not post comment.");
      setPendingTarget(null);
      return;
    }

    const payload = (await response.json()) as { comment: ReceiptComment };
    setComments((current) =>
      sortComments([
        ...current.filter((comment) => comment.id !== payload.comment.id),
        payload.comment,
      ]),
    );

    if (parentId) {
      setReplyDraft("");
      setReplyingTo(null);
    } else {
      setDraft("");
    }

    setPendingTarget(null);
  }

  async function deleteComment(commentId: string) {
    if (!viewer) {
      window.location.assign(signInHref);
      return;
    }

    setError(null);
    setPendingTarget(commentId);
    const response = await fetch(commentUrl(commentId), { method: "DELETE" });

    if (response.status === 401) {
      window.location.assign(signInHref);
      return;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Could not delete comment.");
      setPendingTarget(null);
      return;
    }

    const payload = (await response.json()) as { comment: ReceiptComment };
    setComments((current) =>
      sortComments(
        current.map((comment) => (comment.id === payload.comment.id ? payload.comment : comment)),
      ),
    );
    setPendingTarget(null);
  }

  function canDelete(comment: ReceiptComment) {
    return Boolean(
      viewer && !comment.deletedAt && (viewer.id === comment.author.id || viewer.id === ownerId),
    );
  }

  function renderComment(comment: ReceiptComment, level: "root" | "reply") {
    const href = authorHref(comment.author.handle);
    const deleted = Boolean(comment.deletedAt);
    const replies = repliesByParent.get(comment.id) ?? [];
    const isPending = pendingTarget === comment.id;

    return (
      <article
        key={comment.id}
        className={cn(
          "border-l border-white/10 py-1 pl-3",
          level === "reply" && "ml-8 border-dashed border-white/[0.08]",
        )}
      >
        <div className="flex items-start gap-3">
          <Avatar
            src={comment.author.image}
            alt={comment.author.name}
            size={36}
            fallback={comment.author.handle ?? comment.author.name}
            className="border-white/10"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {href ? (
                <Link href={href} className="font-medium text-zinc-200 hover:text-white">
                  {comment.author.name}
                </Link>
              ) : (
                <span className="font-medium text-zinc-200">{comment.author.name}</span>
              )}
              {comment.author.handle ? (
                <span className="text-neutral-500">@{comment.author.handle}</span>
              ) : null}
              <span className="text-neutral-600">/</span>
              <span className="text-neutral-500">{relativeTime(comment.createdAt)}</span>
            </div>

            {deleted ? (
              <p className="mt-2 text-sm italic text-neutral-500">Comment deleted.</p>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-zinc-300">
                {comment.body}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
              {level === "root" && !deleted ? (
                <button
                  type="button"
                  onClick={() => {
                    setReplyingTo((current) => (current === comment.id ? null : comment.id));
                    setError(null);
                  }}
                  className="rounded-full px-2.5 py-1.5 text-zinc-600 transition-[background-color,color] hover:bg-white/[0.04] hover:text-zinc-200"
                >
                  Reply
                </button>
              ) : null}
              {canDelete(comment) ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => void deleteComment(comment.id)}
                  className="rounded-full px-2.5 py-1.5 text-red-300/70 transition-[background-color,color] hover:bg-red-400/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Delete
                </button>
              ) : null}
            </div>

            {replyingTo === comment.id ? (
              <form className="mt-4" onSubmit={(event) => void submitComment(event, comment.id)}>
                <CommentTextarea
                  value={replyDraft}
                  onChange={setReplyDraft}
                  placeholder={`Reply to ${comment.author.name}`}
                  disabled={pendingTarget === comment.id}
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingTo(null);
                      setReplyDraft("");
                    }}
                    className="text-sm font-medium text-neutral-500 hover:text-neutral-300"
                  >
                    Cancel
                  </button>
                  <SubmitButton pending={pendingTarget === comment.id}>Post reply</SubmitButton>
                </div>
              </form>
            ) : null}
          </div>
        </div>

        {replies.length > 0 ? (
          <div className="mt-3 space-y-3">
            {replies.map((reply) => renderComment(reply, "reply"))}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <section className="scroll-mt-24">
      <div className="flex flex-col gap-3 border-b border-white/[0.08] pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[18px] font-medium tracking-[-0.025em] text-zinc-50">
            Turn this build into a conversation
          </h2>
          <p className="mt-1 max-w-xl text-[13px] leading-5 text-zinc-500">
            Ask what changed, leave a proof check, or suggest the next fork while the builder
            context is fresh.
          </p>
        </div>
        <div className="text-[12px] text-zinc-600">
          {visibleCount} {visibleCount === 1 ? "comment" : "comments"} · {visibleReplies}{" "}
          {visibleReplies === 1 ? "reply" : "replies"}
        </div>
      </div>

      <div className="mt-5">
        {viewer ? (
          <form onSubmit={(event) => void submitComment(event, null)}>
            <CommentTextarea
              value={draft}
              onChange={setDraft}
              placeholder="Add a note, question, or proof check..."
              disabled={pendingTarget === "root"}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-zinc-600">
              <span>{MAX_COMMENT_LENGTH - draft.length} characters left</span>
              <SubmitButton pending={pendingTarget === "root"}>Post comment</SubmitButton>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => useThreadStarter(prompt)}
                  className="rounded-full px-2.5 py-1.5 text-left text-[12px] text-zinc-600 transition-[background-color,color] hover:bg-white/[0.04] hover:text-zinc-200"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </form>
        ) : (
          <div className="border-l border-white/10 pl-3 text-sm text-zinc-300">
            <p className="font-medium text-zinc-100">Join the build conversation.</p>
            <p className="mt-1 text-zinc-500">
              Sign in to ask a question, leave proof, or reply to the builder.
            </p>
            <a
              href={signInHref}
              className="mt-3 inline-flex min-h-8 items-center rounded-full bg-zinc-100 px-3 text-[13px] font-medium text-zinc-950 transition-[background-color,transform] hover:bg-[#a7f300] active:scale-[0.97]"
            >
              Sign in to comment
            </a>
          </div>
        )}

        {error ? (
          <div className="mt-4 border-l border-red-400/40 pl-3 text-sm text-red-100">{error}</div>
        ) : null}

        <div className="mt-6 space-y-3">
          {roots.length > 0 ? (
            roots.map((comment) => renderComment(comment, "root"))
          ) : (
            <div className="border-l border-dashed border-white/10 pl-3 text-sm text-zinc-500">
              <p className="font-medium text-zinc-200">No thread yet.</p>
              <p className="mt-1">
                Be the first builder to ask for context, leave a proof check, or suggest the next
                fork.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => useThreadStarter(prompt)}
                    className="rounded-full px-2.5 py-1.5 text-left text-[12px] text-zinc-600 transition-[background-color,color] hover:bg-white/[0.04] hover:text-zinc-200"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CommentTextarea({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.currentTarget.value.slice(0, MAX_COMMENT_LENGTH))}
      placeholder={placeholder}
      disabled={disabled}
      rows={3}
      className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-700 focus:border-white/25 focus:ring-4 focus:ring-white/[0.04] disabled:cursor-not-allowed disabled:opacity-60"
      maxLength={MAX_COMMENT_LENGTH}
    />
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-zinc-100 px-3 py-2 text-[13px] font-medium text-zinc-950 transition-[background-color,transform] hover:bg-[#a7f300] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Posting..." : children}
    </button>
  );
}
