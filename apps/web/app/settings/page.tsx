import { saveProfile } from "@/app/u/[user]/actions";
import { redirect } from "next/navigation";

const inputClassName =
  "w-full rounded-2xl bg-black/35 px-4 py-3 text-sm text-zinc-100 shadow-[var(--trail-shadow-border)] outline-none transition-[box-shadow,background-color] placeholder:text-zinc-700 focus:bg-zinc-950 focus:shadow-[0_0_0_1px_rgba(167,243,0,0.45),0_18px_48px_rgba(0,0,0,0.24)]";

export default async function SettingsPage() {
  const [{ headers }, { eq }, { auth }, { db, schema }] = await Promise.all([
    import("next/headers"),
    import("drizzle-orm"),
    import("@/lib/auth"),
    import("@/db/client"),
  ]);
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s?.user) redirect("/");
  const me = await db.query.user.findFirst({ where: eq(schema.user.id, s.user.id) });
  if (!me) redirect("/");

  return (
    <div className="rounded-[2rem] bg-zinc-950/70 p-6 shadow-[var(--trail-shadow-border)] sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            Public profile
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-zinc-50">
            Edit builder identity
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Public on <span className="font-mono text-zinc-300">/u/{me.handle}</span>
          </p>
        </div>
      </div>

      <form action={saveProfile} className="mt-8 space-y-6">
        <Field label="Bio" labelFor="profile-bio" hint="Max 160 characters.">
          <textarea
            id="profile-bio"
            name="bio"
            maxLength={160}
            rows={3}
            defaultValue={me.bio ?? ""}
            placeholder="Building AI-native products in Puerto Rico."
            className={`${inputClassName} resize-none font-sans`}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" labelFor="profile-location" hint="City, region, or remote base.">
            <input
              id="profile-location"
              name="location"
              maxLength={80}
              defaultValue={me.location ?? ""}
              placeholder="San Juan, Puerto Rico"
              className={inputClassName}
            />
          </Field>

          <Field label="Currently building" labelFor="profile-currently-building">
            <input
              id="profile-currently-building"
              name="currentlyBuilding"
              maxLength={140}
              defaultValue={me.currentlyBuilding ?? ""}
              placeholder="AI meetup tools, agent workflows, community demos"
              className={inputClassName}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GitHub handle" labelFor="profile-github">
            <input
              id="profile-github"
              name="githubHandle"
              defaultValue={me.githubHandle ?? me.handle ?? ""}
              placeholder="janfaris"
              className={`${inputClassName} font-mono`}
            />
          </Field>

          <Field label="X / Twitter handle" labelFor="profile-x">
            <input
              id="profile-x"
              name="xHandle"
              defaultValue={me.xHandle ?? ""}
              placeholder="janfaris"
              className={`${inputClassName} font-mono`}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="LinkedIn handle" labelFor="profile-linkedin">
            <input
              id="profile-linkedin"
              name="linkedinHandle"
              defaultValue={me.linkedinHandle ?? ""}
              placeholder="janfaris"
              className={`${inputClassName} font-mono`}
            />
          </Field>

          <Field label="Website" labelFor="profile-website">
            <input
              id="profile-website"
              name="website"
              type="url"
              defaultValue={me.website ?? ""}
              placeholder="https://gettrail.dev"
              className={`${inputClassName} font-mono`}
            />
          </Field>
        </div>

        <Field
          label="Spend Audit (Pro)"
          hint="Allow Trail to analyze your prompt text for spend audits. Secrets and PII are redacted before analysis."
        >
          <label className="flex items-start gap-3 rounded-2xl bg-black/35 p-4 shadow-[var(--trail-shadow-border)]">
            <input
              name="spendAuditOptIn"
              type="checkbox"
              defaultChecked={me.spendAuditOptIn}
              className="mt-0.5 size-4 rounded bg-zinc-900 accent-[var(--accent)]"
            />
            <span className="text-sm leading-6 text-zinc-300">Opt in to AI Spend Audit</span>
          </label>
        </Field>

        <div className="pt-2">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-full bg-[var(--accent)] px-5 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--on-accent)] transition-[background-color,transform] hover:bg-[var(--accent-bright)] active:scale-[0.97]"
          >
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  labelFor,
  hint,
  children,
}: {
  label: string;
  labelFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      {labelFor ? (
        <label
          htmlFor={labelFor}
          className="mb-2 block font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500"
        >
          {label}
        </label>
      ) : (
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          {label}
        </div>
      )}
      {children}
      {hint && <div className="mt-2 text-xs leading-5 text-zinc-600">{hint}</div>}
    </div>
  );
}
