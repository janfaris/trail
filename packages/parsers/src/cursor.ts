import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Session } from "@trail/schema";

// Cursor stores chat history in:
//   ~/Library/Application Support/Cursor/User/workspaceStorage/<hash>/state.vscdb
// This is a SQLite DB with key/value blobs. Extracting prompts/completions requires
// schema reverse-engineering and a sqlite dependency we don't want to add yet.
//
// TODO: implement once @trail/parsers gains better-sqlite3 (already a dep of apps/cli).
// For now this stub returns an empty session so the watcher can be wired without
// breaking the build.
export async function parseCursorSession(
  filePath: string,
  user: string,
): Promise<Session> {
  return {
    id: path.basename(filePath) || randomUUID(),
    user,
    tool: "cursor",
    startedAt: new Date().toISOString(),
    events: [],
  };
}
