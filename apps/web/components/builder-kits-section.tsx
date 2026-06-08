import { KitCard } from "@/components/kit-card";
import { listKitsByUser } from "@/lib/kit-queries";
import Link from "next/link";

/**
 * Build Kits authored by a builder, shown on their profile. Async server
 * component: renders nothing when the builder has no public kits, so it never
 * clutters profiles that haven't made one.
 */
export async function BuilderKitsSection({
  userId,
  isSelf,
}: {
  userId: string;
  isSelf: boolean;
}) {
  const kits = await listKitsByUser(userId, { limit: 4 });
  if (kits.length === 0) return null;

  return (
    <section className="rounded-[1.5rem] bg-zinc-950/70 p-4 shadow-[var(--trail-shadow-border)] sm:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          Build Kits
        </h3>
        {isSelf ? (
          <Link
            href="/library"
            className="font-mono text-xs text-zinc-600 underline-offset-4 hover:text-zinc-200 hover:underline"
          >
            Your library →
          </Link>
        ) : (
          <Link
            href="/kits"
            className="font-mono text-xs text-zinc-600 underline-offset-4 hover:text-zinc-200 hover:underline"
          >
            Browse kits →
          </Link>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {kits.map((kit) => (
          <KitCard key={kit.id} kit={kit} />
        ))}
      </div>
    </section>
  );
}
