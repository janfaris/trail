import { Avatar } from "@/components/ui/avatar";
import type { KitListItem } from "@/lib/kit-queries";
import { githubAvatar } from "@/lib/share";
import { cn } from "@/lib/utils";
import Link from "next/link";

function reproBadge(value: string): { label: string; cls: string } {
  if (value === "verified") return { label: "verified", cls: "text-[var(--accent-text)]" };
  if (value === "partial") return { label: "repo-derived", cls: "text-sky-200" };
  return { label: "prompts", cls: "text-zinc-500" };
}

/**
 * Reusable Build Kit card. `compact` is used in dense rails (feed sidebar);
 * `full` is used on the hub, library, and profile grids.
 */
export function KitCard({
  kit,
  variant = "full",
  className,
}: {
  kit: KitListItem;
  variant?: "full" | "compact";
  className?: string;
}) {
  const repro = reproBadge(kit.reproducibility);
  const forks = kit.reuseCount;

  if (variant === "compact") {
    return (
      <Link
        href={`/kit/${kit.id}`}
        className={cn("group block", className)}
        title={`Steal ${kit.title}`}
      >
        <div className="flex items-center gap-2 text-[12px] text-zinc-600">
          <span className="font-mono">{kit.sourceRepo}</span>
          <span className={`font-mono ${repro.cls}`}>{repro.label}</span>
        </div>
        <p className="mt-1 line-clamp-1 text-[13px] font-medium leading-5 text-zinc-200 group-hover:text-[var(--accent-text)]">
          {kit.title}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-600">
          <span className="tabular-nums">🔁 {forks}</span>
          {kit.frameworks.slice(0, 2).map((f) => (
            <span key={f}>#{f}</span>
          ))}
        </div>
      </Link>
    );
  }

  const authorName =
    kit.authorName?.trim() || (kit.authorHandle ? `@${kit.authorHandle}` : "Builder");
  const authorAvatar = kit.authorImage ?? githubAvatar(kit.authorGithub || kit.authorHandle || "");

  return (
    <Link
      href={`/kit/${kit.id}`}
      className={cn(
        "group block rounded-2xl border border-white/[0.08] bg-[var(--surface-deep)] p-4 transition-[border-color,transform] hover:border-white/20 active:scale-[0.99]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 text-[12px] text-zinc-600">
        <span className="truncate font-mono">{kit.sourceRepo}</span>
        <span className={`shrink-0 font-mono ${repro.cls}`}>{repro.label}</span>
      </div>
      <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-zinc-50 group-hover:text-[var(--accent-text)]">
        {kit.title}
      </h3>
      {kit.summary ? (
        <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-zinc-500">{kit.summary}</p>
      ) : null}
      {kit.frameworks.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-zinc-600">
          {kit.frameworks.slice(0, 4).map((f) => (
            <span key={f}>#{f}</span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
        <span className="inline-flex min-w-0 items-center gap-2">
          <Avatar src={authorAvatar} alt={authorName} size={20} fallback={authorName} />
          <span className="truncate font-mono text-[11px] text-zinc-500">
            {kit.authorHandle ? `@${kit.authorHandle}` : authorName}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[11px] text-zinc-500 tabular-nums">
          🔁 {forks} {forks === 1 ? "fork" : "forks"}
        </span>
      </div>
    </Link>
  );
}
