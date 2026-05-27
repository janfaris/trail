import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { saveProfile } from "@/app/u/[user]/actions";

export default async function SettingsPage() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (!s?.user) redirect("/");
  const me = await db.query.user.findFirst({ where: eq(schema.user.id, s.user.id) });
  if (!me) redirect("/");

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 mb-2">
        Edit profile
      </h1>
      <p className="text-sm text-zinc-500 mb-8">
        Public on{" "}
        <span className="font-mono text-zinc-400">/u/{me.handle}</span>
      </p>

      <form action={saveProfile} className="space-y-6">
          <Field label="Bio" hint="Max 160 characters.">
            <textarea
              name="bio"
              maxLength={160}
              rows={3}
              defaultValue={me.bio ?? ""}
              placeholder="Building AI-native products in Puerto Rico."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-[#a7f300]/60 resize-none font-sans"
            />
          </Field>

          <Field label="GitHub handle">
            <input
              name="githubHandle"
              defaultValue={me.githubHandle ?? me.handle ?? ""}
              placeholder="janfaris"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#a7f300]/60"
            />
          </Field>

          <Field label="X / Twitter handle">
            <input
              name="xHandle"
              defaultValue={me.xHandle ?? ""}
              placeholder="janfaris"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#a7f300]/60"
            />
          </Field>

          <Field label="LinkedIn handle">
            <input
              name="linkedinHandle"
              defaultValue={me.linkedinHandle ?? ""}
              placeholder="janfaris"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#a7f300]/60"
            />
          </Field>

          <Field label="Website">
            <input
              name="website"
              type="url"
              defaultValue={me.website ?? ""}
              placeholder="https://gettrail.dev"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-[#a7f300]/60"
            />
          </Field>

          <Field
            label="Spend Audit (Pro)"
            hint="Allow Trail to analyze your prompt text for spend audits. Secrets and PII are redacted before analysis."
          >
            <label className="flex items-center gap-3">
              <input
                name="spendAuditOptIn"
                type="checkbox"
                defaultChecked={me.spendAuditOptIn}
                className="size-4 accent-[#a7f300] bg-zinc-900 border-zinc-800 rounded"
              />
              <span className="text-sm text-zinc-300">
                Opt in to AI Spend Audit
              </span>
            </label>
          </Field>

          <div className="pt-2">
            <button
              type="submit"
              className="bg-[#a7f300] text-zinc-950 font-mono text-sm font-semibold px-4 py-2 rounded-md hover:bg-[#b9ff1f] transition-colors"
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
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-mono uppercase tracking-[0.14em] text-zinc-500 mb-1.5">
        {label}
      </div>
      {children}
      {hint && <div className="text-xs text-zinc-600 mt-1">{hint}</div>}
    </label>
  );
}
