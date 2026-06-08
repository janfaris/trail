"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type RadarMediaPreview = {
  mediaKey: string;
  type: string;
  url: string;
  previewImageUrl?: string;
  width?: number;
  height?: number;
  altText?: string;
};

type RadarMediaViewerProps = {
  media: RadarMediaPreview[];
  sourceHandle: string;
  signalUrl: string;
};

function formatCount(value: number): string {
  return new Intl.NumberFormat("en", { notation: value >= 1000 ? "compact" : "standard" }).format(
    value,
  );
}

function mediaLabel(item: RadarMediaPreview): string {
  return item.type === "photo" ? "photo" : `${item.type} preview`;
}

export function RadarMediaViewer({ media, sourceHandle, signalUrl }: RadarMediaViewerProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const activeMedia = activeIndex === null ? null : (media[activeIndex] ?? null);
  const activePosition = activeIndex === null ? 0 : activeIndex + 1;
  const lightboxOpen = activeMedia !== null;
  const visible = media.slice(0, 4);
  const extraCount = Math.max(media.length - visible.length, 0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!activeMedia) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveIndex(null);
      if (event.key === "ArrowRight") {
        setActiveIndex((index) => (index === null ? 0 : (index + 1) % media.length));
      }
      if (event.key === "ArrowLeft") {
        setActiveIndex((index) => (index === null ? 0 : (index - 1 + media.length) % media.length));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeMedia, media.length]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!lightboxOpen || !dialog) return;

    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [lightboxOpen]);

  if (media.length === 0) return null;

  return (
    <>
      <div className="overflow-hidden rounded-[26px] bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.01)),var(--page-base-2)] p-2 shadow-[var(--trail-shadow-border)] transition-[box-shadow] hover:shadow-[var(--trail-shadow-border-hover)]">
        <div className="mb-2 flex items-center justify-between gap-3 px-2 pt-1 font-mono text-[10px] uppercase tracking-[0.16em]">
          <span className="text-[var(--accent-text)]">Visual proof attached</span>
          <span className="text-zinc-600">
            Click to enlarge - {formatCount(media.length)} {media.length === 1 ? "asset" : "assets"}
          </span>
        </div>
        <div className={visible.length === 1 ? "" : "grid grid-cols-2 gap-2"}>
          {visible.map((item, index) => {
            const isFirstOfThree = visible.length === 3 && index === 0;
            const aspectClass =
              visible.length === 1 || isFirstOfThree ? "aspect-[16/9]" : "aspect-[4/3]";
            const spanClass = isFirstOfThree ? "col-span-2" : "";
            const label = mediaLabel(item);

            return (
              <button
                key={item.mediaKey}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Maximize ${label} from @${sourceHandle}`}
                className={`group relative block w-full overflow-hidden rounded-[20px] bg-zinc-900 text-left shadow-[0_0_0_1px_rgba(255,255,255,0.08)] outline-none transition-[box-shadow,transform] active:scale-[0.96] hover:shadow-[0_0_0_1px_rgba(167,243,0,0.28)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${aspectClass} ${spanClass}`}
              >
                <img
                  src={item.url}
                  alt={item.altText || `Media preview from @${sourceHandle}'s X signal`}
                  loading="lazy"
                  width={item.width}
                  height={item.height}
                  className="h-full w-full object-cover saturate-[1.02] outline outline-1 -outline-offset-1 outline-white/10 transition-transform duration-500 group-hover:scale-[1.025]"
                />
                <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_52%,rgba(0,0,0,0.76)_100%)] opacity-80" />
                <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--accent-text)] opacity-0 shadow-[0_0_0_1px_rgba(167,243,0,0.22)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  Maximize
                </span>
                <span className="pointer-events-none absolute bottom-2 left-2 rounded-full border border-white/10 bg-black/72 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-200">
                  {extraCount > 0 && index === visible.length - 1 ? `+${extraCount} more` : label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {mounted && activeMedia
        ? createPortal(
            <dialog
              ref={dialogRef}
              onCancel={() => setActiveIndex(null)}
              onClose={() => setActiveIndex(null)}
              aria-label={`Expanded media from @${sourceHandle}`}
              className="fixed inset-0 z-[2147483647] m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-black/94 p-3 text-zinc-100 backdrop:bg-black/82 backdrop:backdrop-blur-xl sm:p-5"
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_4%,rgba(167,243,0,0.13),transparent_28%),radial-gradient(circle_at_84%_92%,rgba(245,158,11,0.1),transparent_24%)]" />
              <button
                type="button"
                aria-label="Close expanded media"
                onClick={() => setActiveIndex(null)}
                className="absolute inset-0 cursor-zoom-out"
              />
              <div className="relative mx-auto flex h-full max-w-[min(94vw,1180px)] flex-col">
                <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-zinc-950/92 px-3 py-2 shadow-[0_18px_80px_rgba(0,0,0,0.5)] sm:rounded-full">
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent-text)]">
                      @{sourceHandle} visual proof
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {activePosition} / {media.length} - Esc to close
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={signalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hidden min-h-9 items-center rounded-full px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300 shadow-[0_0_0_1px_rgba(255,255,255,0.12)] transition-[box-shadow,color,transform] hover:text-[var(--accent-text)] hover:shadow-[0_0_0_1px_rgba(167,243,0,0.3)] active:scale-[0.96] sm:inline-flex"
                    >
                      Open X post
                    </a>
                    <button
                      type="button"
                      onClick={() => setActiveIndex(null)}
                      className="inline-flex min-h-9 items-center rounded-full bg-zinc-100 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[var(--accent)] active:scale-[0.96]"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-zinc-950/88 p-2 shadow-[0_28px_100px_rgba(0,0,0,0.62)] sm:rounded-[30px] sm:p-4">
                  <img
                    src={activeMedia.url}
                    alt={activeMedia.altText || `Expanded media from @${sourceHandle}'s X signal`}
                    width={activeMedia.width}
                    height={activeMedia.height}
                    className="h-auto max-h-[calc(100dvh-170px)] w-auto max-w-full rounded-[18px] object-contain shadow-[0_18px_70px_rgba(0,0,0,0.45)] sm:max-h-[calc(100dvh-190px)] sm:rounded-[22px]"
                  />

                  {media.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveIndex((index) =>
                            index === null ? 0 : (index - 1 + media.length) % media.length,
                          )
                        }
                        className="absolute left-3 top-1/2 inline-flex min-h-10 -translate-y-1/2 items-center rounded-full bg-black/72 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-100 shadow-[0_0_0_1px_rgba(255,255,255,0.15)] transition-[box-shadow,color,transform] hover:text-[var(--accent-text)] hover:shadow-[0_0_0_1px_rgba(167,243,0,0.3)] active:scale-[0.96]"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setActiveIndex((index) =>
                            index === null ? 0 : (index + 1) % media.length,
                          )
                        }
                        className="absolute right-3 top-1/2 inline-flex min-h-10 -translate-y-1/2 items-center rounded-full bg-black/72 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-100 shadow-[0_0_0_1px_rgba(255,255,255,0.15)] transition-[box-shadow,color,transform] hover:text-[var(--accent-text)] hover:shadow-[0_0_0_1px_rgba(167,243,0,0.3)] active:scale-[0.96]"
                      >
                        Next
                      </button>
                    </>
                  ) : null}
                </div>

                {media.length > 1 ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto rounded-full border border-white/10 bg-zinc-950/82 p-2">
                    {media.map((item, index) => (
                      <button
                        key={item.mediaKey}
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        aria-label={`Show media ${index + 1}`}
                        className={`h-12 w-16 shrink-0 overflow-hidden rounded-full border transition-[border-color,opacity,box-shadow,transform] active:scale-[0.96] ${
                          index === activeIndex
                            ? "border-[var(--accent-border)] ring-2 ring-[var(--accent)]/25"
                            : "border-white/10 opacity-55 hover:opacity-100"
                        }`}
                      >
                        <img
                          src={item.url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
}
