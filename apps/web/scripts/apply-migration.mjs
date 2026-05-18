import { config } from "dotenv";
import { Client } from "pg";
import { readFileSync } from "node:fs";

config({ path: "../../.env.local" });

async function main() {
  const sql = readFileSync(process.argv[2], "utf8");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  // split on statement-breakpoint
  const statements = sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    console.log("→", stmt.split("\n")[0].slice(0, 80));
    await client.query(stmt);
  }
  await client.end();
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
