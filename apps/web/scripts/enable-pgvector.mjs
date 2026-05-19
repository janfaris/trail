// Enable pgvector on the Neon database. Idempotent.
// Usage: node apps/web/scripts/enable-pgvector.mjs
import { config as loadEnv } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "..", "..", "..", ".env.local") });
loadEnv({ path: path.join(__dirname, "..", ".env.local"), override: false });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

const sql = neon(process.env.DATABASE_URL);
await sql`CREATE EXTENSION IF NOT EXISTS vector`;
const r = await sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`;
console.log("pgvector enabled, version =", r[0]?.extversion);
