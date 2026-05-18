import { homedir } from "node:os";
import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { z } from "zod";

const AUTH_FILE = path.join(homedir(), ".trail", "auth.json");

const AuthRecord = z.object({
  cookie: z.string().min(1),
  userHandle: z.string().min(1),
  savedAt: z.string(),
});
export type AuthRecord = z.infer<typeof AuthRecord>;

export function loadAuth(): AuthRecord | null {
  if (!existsSync(AUTH_FILE)) return null;
  try {
    const raw = JSON.parse(readFileSync(AUTH_FILE, "utf-8"));
    return AuthRecord.parse(raw);
  } catch {
    return null;
  }
}

export function saveAuth(rec: Omit<AuthRecord, "savedAt">): void {
  mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  const full: AuthRecord = { ...rec, savedAt: new Date().toISOString() };
  writeFileSync(AUTH_FILE, JSON.stringify(full, null, 2), { mode: 0o600 });
}

export function clearAuth(): boolean {
  if (!existsSync(AUTH_FILE)) return false;
  unlinkSync(AUTH_FILE);
  return true;
}

export function getAuthCookie(): string | null {
  return loadAuth()?.cookie ?? null;
}
