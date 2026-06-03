"use client";

import { useEffect, useState } from "react";

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
  const activeMedia = activeIndex === null ? null : (media[activeIndex] ?? null);
  const activePosition = activeIndex === null ? 0 : activeIndex + 1;
  const visible = media.slice(0, 4);
  const extraCount = Math.max(media.length - visible.length, 0);

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

  if (media.length === 0) return null;

  return (
    <>
      <div className="overflow-hidden rounded-[26px] border border-[#a7f300]/20 bg-[radial-gradient(circle_at_top_left,rgba(167,243,0,0.16),transparent_34%),linear-gradient(135deg,rgba(24,24,27,0.96),rgba(0,0,0,0.98))] p-2 shadow-[0_18px_65px_rgba(167,243,0,0.08)] transition hover:border-[#a7f300]/45">
        <div className="mb-2 flex items-center justify-between gap-3 px-2 pt-1 font-mono text-[10px] uppercase tracking-[0.16em]">
          <span className="text-[#a7f300]">Visual proof attached</span>
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
                className={`group relative block w-full overflow-hidden rounded-[20px] border border-white/10 bg-zinc-900 text-left outline-none transition hover:border-[#a7f300]/45 focus-visible:border-[#a7f300] focus-visible:ring-2 focus-visible:ring-[#a7f300]/40 ${aspectClass} ${spanClass}`}
              >
                <img
                  src={item.url}
                  alt={item.altText || `Media preview from @${sourceHandle}'s X signal`}
                  loading="lazy"
                  width={item.width}
                  height={item.height}
                  className="h-full w-full object-cover saturate-[1.04] transition duration-500 group-hover:scale-[1.035]"
                />
                <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_52%,rgba(0,0,0,0.76)_100%)] opacity-80" />
                <span className="pointer-events-none absolute right-2 top-2 rounded-full border border-[#a7f300]/30 bg-black/70 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#a7f300] opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
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

      {activeMedia ? (
        <dialog
          open
          aria-label={`Expanded media from @${sourceHandle}`}
          className="fixed inset-0 z-50 m-0 h-screen max-h-none w-screen max-w-none bg-black/92 p-3 text-zinc-100 backdrop:bg-black/80 backdrop-blur-xl sm:p-6"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(167,243,0,0.18),transparent_30%),radial-gradient(circle_at_80%_100%,rgba(245,158,11,0.12),transparent_28%)]" />
          <button
            type="button"
            aria-label="Close expanded media"
            onClick={() => setActiveIndex(null)}
            className="absolute inset-0 cursor-zoom-out"
          />
          <div className="relative mx-auto flex h-full max-w-6xl flex-col">
            <div className="mb-3 flex items-center justify-between gap-3 rounded-full border border-white/10 bg-zinc-950/82 px-3 py-2 shadow-[0_18px_80px_rgba(0,0,0,0.5)]">
              <div className="min-w-0">
                <div className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-[#a7f300]">
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
                  className="hidden rounded-full border border-zinc-700 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300 transition hover:border-[#a7f300]/50 hover:text-[#a7f300] sm:inline-flex"
                >
                  Open X post
                </a>
                <button
                  type="button"
                  onClick={() => setActiveIndex(null)}
                  className="rounded-full bg-zinc-100 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-black transition hover:bg-[#a7f300]"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden rounded-[30px] border border-white/10 bg-zinc-950/88 p-2 shadow-[0_28px_100px_rgba(0,0,0,0.62)] sm:p-4">
              <img
                src={activeMedia.url}
                alt={activeMedia.altText || `Expanded media from @${sourceHandle}'s X signal`}
                width={activeMedia.width}
                height={activeMedia.height}
                className="max-h-full w-full rounded-[22px] object-contain"
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
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/72 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-100 transition hover:border-[#a7f300]/50 hover:text-[#a7f300]"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveIndex((index) => (index === null ? 0 : (index + 1) % media.length))
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/72 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-100 transition hover:border-[#a7f300]/50 hover:text-[#a7f300]"
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
                    className={`h-12 w-16 shrink-0 overflow-hidden rounded-full border transition ${
                      index === activeIndex
                        ? "border-[#a7f300] ring-2 ring-[#a7f300]/25"
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
        </dialog>
      ) : null}
    </>
  );
}
