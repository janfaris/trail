import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import {
  ConnectionsClient,
  type ConnectionRow,
} from "./ConnectionsClient";

export const dynamic = "force-dynamic";

export default async function ConnectionsSettingsPage() {
  // BetterAuth can throw on preview branches where the origin isn't on the
  // trustedOrigins list, instead of returning null. Treat any throw or null
  // session as unauthenticated and bounce to home.
  let sess: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    sess = await auth.api.getSession({ headers: await headers() });
  } catch {
    sess = null;
  }
  if (!sess?.user) redirect("/");

  // Explicit projection — never select api_key_enc into the client boundary.
  const rows = await db
    .select({
      id: schema.vendorConnection.id,
      vendor: schema.vendorConnection.vendor,
      workspaceId: schema.vendorConnection.workspaceId,
      lastSyncedAt: schema.vendorConnection.lastSyncedAt,
      syncStatus: schema.vendorConnection.syncStatus,
      syncErrorMessage: schema.vendorConnection.syncErrorMessage,
      createdAt: schema.vendorConnection.createdAt,
      updatedAt: schema.vendorConnection.updatedAt,
    })
    .from(schema.vendorConnection)
    .where(eq(schema.vendorConnection.userId, sess.user.id))
    .orderBy(schema.vendorConnection.vendor);

  const initialConnections: ConnectionRow[] = rows.map((r) => ({
    id: r.id,
    vendor: r.vendor,
    workspaceId: r.workspaceId,
    lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
    syncStatus: r.syncStatus,
    syncErrorMessage: r.syncErrorMessage,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return <ConnectionsClient initialConnections={initialConnections} />;
}
