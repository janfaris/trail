import type { Config } from "drizzle-kit";
import { config } from "dotenv";

config({ path: "../../.env.local" });

export default {
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  driver: undefined,
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: false,
  verbose: true,
} satisfies Config;
