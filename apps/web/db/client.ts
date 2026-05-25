import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function createDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = neon(databaseUrl);
  return drizzle({ client: sql, schema });
}

type DbClient = ReturnType<typeof createDb>;

let cachedDb: DbClient | undefined;

function getDb() {
  cachedDb ??= createDb();
  return cachedDb;
}

export const db = new Proxy({} as DbClient, {
  get(_target, prop) {
    const client = getDb();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
export { schema };
