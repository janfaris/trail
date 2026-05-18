import Database from "better-sqlite3";
import path from "node:path";
import { readFileSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Session, Event } from "@trail/schema";

// Cursor chat storage (macOS):
//   ~/Library/Application Support/Cursor/User/workspaceStorage/<hash>/state.vscdb
//     ItemTable.composer.composerData -> { allComposers: [{ composerId, createdAt, forceMode }] }
//     sibling workspace.json -> { folder: "file:///abs/path" } (repo hint)
//   ~/Library/Application Support/Cursor/User/globalStorage/state.vscdb
//     cursorDiskKV.composerData:<id>  -> { name, createdAt, lastUpdatedAt,
//                                          fullConversationHeadersOnly: [{ bubbleId, type }] }
//     cursorDiskKV.bubbleId:<composerId>:<bubbleId> -> { type, text, richText,
//                                                        timingInfo: { clientRpcSendTime,
//                                                        clientSettleTime } }
//   type: 1 = user prompt, type: 2 = assistant completion.
//
// One workspace DB → multiple Sessions (one per composer/tab).

interface ComposerHead {
  composerId: string;
  createdAt?: number;
  forceMode?: string;
}

interface BubbleHeader {
  bubbleId: string;
  type: number;
}

interface ComposerMeta {
  composerId: string;
  name?: string;
  createdAt?: number;
  lastUpdatedAt?: number;
  fullConversationHeadersOnly?: BubbleHeader[];
}

interface BubbleData {
  type?: number;
  text?: string;
  timingInfo?: {
    clientRpcSendTime?: number;
    clientSettleTime?: number;
  };
}

export interface ParseCursorOptions {
  /** Path to globalStorage state.vscdb. Required to fetch bubble bodies. */
  globalDbPath?: string;
  /** Only return sessions whose lastUpdatedAt > this ms epoch. */
  sinceMs?: number;
}

function readWorkspaceRepo(workspaceDbPath: string): string | undefined {
  const wsJson = path.join(path.dirname(workspaceDbPath), "workspace.json");
  if (!existsSync(wsJson)) return undefined;
  try {
    const o = JSON.parse(readFileSync(wsJson, "utf8")) as { folder?: string };
    if (!o.folder) return undefined;
    try {
      return fileURLToPath(o.folder);
    } catch {
      return o.folder;
    }
  } catch {
    return undefined;
  }
}

function parseJsonBlob(blob: unknown): unknown {
  if (blob == null) return null;
  if (typeof blob === "string") {
    try {
      return JSON.parse(blob);
    } catch {
      return null;
    }
  }
  if (blob instanceof Uint8Array || Buffer.isBuffer(blob)) {
    try {
      return JSON.parse(Buffer.from(blob as Buffer).toString("utf8"));
    } catch {
      return null;
    }
  }
  return null;
}

function bubbleTimestamp(b: BubbleData, fallbackMs: number): string {
  const t =
    b.timingInfo?.clientRpcSendTime ??
    b.timingInfo?.clientSettleTime ??
    fallbackMs;
  return new Date(t).toISOString();
}

export async function parseCursorWorkspace(
  workspaceDbPath: string,
  user: string,
  opts: ParseCursorOptions = {},
): Promise<Session[]> {
  if (!existsSync(workspaceDbPath)) return [];

  const wsDb = new Database(workspaceDbPath, {
    readonly: true,
    fileMustExist: true,
  });
  let composerHeads: ComposerHead[] = [];
  try {
    const row = wsDb
      .prepare(
        "SELECT value FROM ItemTable WHERE key = 'composer.composerData'",
      )
      .get() as { value: unknown } | undefined;
    if (row) {
      const parsed = parseJsonBlob(row.value) as
        | { allComposers?: ComposerHead[] }
        | null;
      composerHeads = parsed?.allComposers ?? [];
    }
  } finally {
    wsDb.close();
  }

  if (composerHeads.length === 0) return [];

  const repo = readWorkspaceRepo(workspaceDbPath);
  const fallbackMtimeMs = statSync(workspaceDbPath).mtimeMs;

  const globalDbPath = opts.globalDbPath;
  if (!globalDbPath || !existsSync(globalDbPath)) {
    // Without the global store we can't recover bubble text.
    return [];
  }
  const gDb = new Database(globalDbPath, {
    readonly: true,
    fileMustExist: true,
  });

  const out: Session[] = [];
  try {
    const composerStmt = gDb.prepare(
      "SELECT value FROM cursorDiskKV WHERE key = ?",
    );
    const bubbleStmt = gDb.prepare(
      "SELECT value FROM cursorDiskKV WHERE key = ?",
    );

    for (const head of composerHeads) {
      const composerKey = `composerData:${head.composerId}`;
      const cRow = composerStmt.get(composerKey) as
        | { value: unknown }
        | undefined;
      if (!cRow) continue;
      const meta = parseJsonBlob(cRow.value) as ComposerMeta | null;
      if (!meta) continue;

      if (
        opts.sinceMs &&
        meta.lastUpdatedAt &&
        meta.lastUpdatedAt <= opts.sinceMs
      ) {
        continue;
      }

      const headers = meta.fullConversationHeadersOnly ?? [];
      if (headers.length === 0) continue;

      const createdAtMs = meta.createdAt ?? head.createdAt ?? fallbackMtimeMs;
      const events: Event[] = [];
      let earliestMs = createdAtMs;
      let latestMs = meta.lastUpdatedAt ?? createdAtMs;

      for (const h of headers) {
        const bRow = bubbleStmt.get(
          `bubbleId:${head.composerId}:${h.bubbleId}`,
        ) as { value: unknown } | undefined;
        if (!bRow) continue;
        const bub = parseJsonBlob(bRow.value) as BubbleData | null;
        if (!bub) continue;
        const text = (bub.text ?? "").trim();
        if (!text) continue;
        const type = bub.type ?? h.type;
        const at = bubbleTimestamp(bub, createdAtMs);
        const atMs = Date.parse(at);
        if (!Number.isNaN(atMs)) {
          if (atMs < earliestMs) earliestMs = atMs;
          if (atMs > latestMs) latestMs = atMs;
        }
        if (type === 1) {
          events.push({ kind: "prompt", at, text });
        } else if (type === 2) {
          events.push({ kind: "completion", at, text });
        }
      }

      if (events.length === 0) continue;

      out.push({
        id: head.composerId,
        user,
        tool: "cursor",
        startedAt: new Date(earliestMs).toISOString(),
        endedAt: new Date(latestMs).toISOString(),
        repo,
        summary: meta.name && meta.name.trim() ? meta.name : undefined,
        events,
      });
    }
  } finally {
    gDb.close();
  }

  return out;
}

// Back-compat stub kept so existing imports don't break; prefer parseCursorWorkspace.
export async function parseCursorSession(
  _filePath: string,
  user: string,
): Promise<Session> {
  return {
    id: "cursor-noop",
    user,
    tool: "cursor",
    startedAt: new Date().toISOString(),
    events: [],
  };
}
