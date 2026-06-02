import "server-only";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  handle: string | null;
  image: string | null;
  role: string;
};

// Resolve the current session and return the user row only when it has the
// 'admin' role. Returns null for anonymous, non-admin, or any auth error.
// DB-coupled imports are lazy so this stays safe to import from server
// components without tripping build-time "DATABASE_URL is not set".
export async function getAdminUser(reqHeaders: Headers): Promise<AdminUser | null> {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) return null;

  const [{ auth }, { db, schema }, { eq }] = await Promise.all([
    import("@/lib/auth"),
    import("@/db/client"),
    import("drizzle-orm"),
  ]);

  let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
  try {
    session = await auth.api.getSession({ headers: reqHeaders });
  } catch {
    return null;
  }

  const userId = session?.user?.id;
  if (!userId) return null;

  const row = await db.query.user.findFirst({ where: eq(schema.user.id, userId) });
  if (!row || row.role !== "admin") return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    handle: row.handle ?? null,
    image: row.image ?? null,
    role: row.role,
  };
}

export async function isAdminSession(reqHeaders: Headers): Promise<boolean> {
  return (await getAdminUser(reqHeaders)) !== null;
}
