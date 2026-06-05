"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type FeedPickMediaItem = {
  mediaKey: string;
  type: string;
  url: string;
  previewImageUrl?: string;
  videoUrl?: string;
  width?: number;
  height?: number;
  altText?: string;
};

type FeedPickMediaProps = {
  media: FeedPickMediaItem[];
  sourceHandle: string;
  signalUrl: string;
};

function PlayGlyph({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function FeedPickMedia({ media, sourceHandle, signalUrl }: FeedPickMediaProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLightboxOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [lightboxOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!lightboxOpen || !dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [lightboxOpen]);

  const item = media[0];
  if (!item) return null;

  const isVideo = item.type === "video" || item.type === "animated_gif";
  const poster = item.previewImageUrl || item.url;
  const extraCount = Math.max(media.length - 1, 0);
  const altText = item.altText || `Visual from @${sourceHandle}'s post`;
  // X gates video.twimg.com MP4s by Referer, so a direct cross-origin <video>
  // gets a 403. Stream it through our same-origin proxy instead.
  const proxiedVideoUrl = item.videoUrl
    ? `/api/radar/video?src=${encodeURIComponent(item.videoUrl)}`
    : null;

  // Video with a playable MP4 → play inline inside Trail.
  if (isVideo && proxiedVideoUrl && playing) {
    return (
      <div className="relative mt-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-black">
        {/* biome-ignore lint/a11y/useMediaCaption: third-party social media has no caption track */}
        <video
          src={proxiedVideoUrl}
          poster={poster}
          controls
          autoPlay
          playsInline
          loop={item.type === "animated_gif"}
          className="max-h-[28rem] w-full bg-black object-contain"
        />
        <a
          href={signalUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="block bg-black/60 px-3 py-1.5 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:text-[#a7f300]"
        >
          Open on X
        </a>
      </div>
    );
  }

  if (isVideo) {
    // Inline play if we have an MP4, otherwise open the X post to watch.
    const hasInline = Boolean(proxiedVideoUrl);
    const overlayLabel =
      item.type === "animated_gif"
        ? hasInline
          ? "GIF · play"
          : "GIF · open on X"
        : hasInline
          ? "Video · play"
          : "Video · watch on X";

    const overlay = (
      <>
        <span className="pointer-events-none absolute inset-0 bg-black/25" />
        <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 shadow-[0_0_0_1px_rgba(255,255,255,0.25)] backdrop-blur-sm transition-transform group-hover/media:scale-105">
          <PlayGlyph className="ml-0.5 h-6 w-6 fill-white" />
        </span>
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#a7f300]">
          {overlayLabel}
        </span>
      </>
    );

    if (hasInline) {
      return (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play video from @${sourceHandle}`}
          className="group/media relative mt-3 block w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900 transition-colors hover:border-white/[0.16]"
        >
          <img src={poster} alt={altText} loading="lazy" className="max-h-80 w-full object-cover" />
          {overlay}
        </button>
      );
    }

    return (
      <a
        href={signalUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="group/media relative mt-3 block overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900 transition-colors hover:border-white/[0.16]"
      >
        <img src={poster} alt={altText} loading="lazy" className="max-h-80 w-full object-cover" />
        {overlay}
      </a>
    );
  }

  // Photo → open an in-app lightbox.
  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        aria-label={`Enlarge image from @${sourceHandle}`}
        className="group/media relative mt-3 block w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900 transition-colors hover:border-white/[0.16]"
      >
        <img src={item.url} alt={altText} loading="lazy" className="max-h-80 w-full object-cover" />
        <span className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-300 opacity-0 transition-opacity group-hover/media:opacity-100">
          {extraCount > 0 ? `+${extraCount} more · enlarge` : "Click to enlarge"}
        </span>
      </button>

      {mounted && lightboxOpen
        ? createPortal(
            <dialog
              ref={dialogRef}
              onCancel={() => setLightboxOpen(false)}
              onClose={() => setLightboxOpen(false)}
              aria-label={`Expanded image from @${sourceHandle}`}
              className="fixed inset-0 z-[2147483647] m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-black/94 p-3 text-zinc-100 backdrop:bg-black/82 sm:p-6"
            >
              <button
                type="button"
                aria-label="Close expanded image"
                onClick={() => setLightboxOpen(false)}
                className="absolute inset-0 cursor-zoom-out"
              />
              <div className="relative mx-auto flex h-full max-w-[min(94vw,1100px)] flex-col">
                <div className="mb-3 flex items-center justify-between gap-3 rounded-full border border-white/10 bg-zinc-950/92 px-3 py-2">
                  <div className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-[#a7f300]">
                    @{sourceHandle}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={signalUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex min-h-8 items-center rounded-full px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] transition-[box-shadow,color] hover:text-[#a7f300] hover:shadow-[0_0_0_1px_rgba(167,243,0,0.3)]"
                    >
                      Open on X
                    </a>
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(false)}
                      className="inline-flex min-h-8 items-center rounded-full bg-zinc-100 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-black transition-colors hover:bg-[#a7f300]"
                    >
                      Close
                    </button>
                  </div>
                </div>
                <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-zinc-950/88 p-2 sm:p-4">
                  <img
                    src={item.url}
                    alt={altText}
                    className="h-auto max-h-[calc(100dvh-150px)] w-auto max-w-full rounded-[16px] object-contain"
                  />
                </div>
              </div>
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
}
