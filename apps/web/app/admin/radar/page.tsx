import { getAdminUser } from "@/lib/admin-auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import RadarAdminClient from "./radar-admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Radar admin",
  robots: { index: false, follow: false },
};

export default async function RadarAdminPage() {
  const reqHeaders = await headers();
  const { auth } = await import("@/lib/auth");

  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({ headers: reqHeaders });
  } catch {
    session = null;
  }

  // Not signed in → send to GitHub sign-in and come back here.
  if (!session?.user?.id) {
    redirect("/api/auth/sign-in/github?callbackURL=/admin/radar");
  }

  // Signed in but not an admin → hide the page entirely.
  const admin = await getAdminUser(reqHeaders);
  if (!admin) {
    notFound();
  }

  return <RadarAdminClient adminLabel={admin.handle ? `@${admin.handle}` : admin.email} />;
}
