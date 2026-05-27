import { DatabaseSync } from "node:sqlite";
import type { Session, Event } from "@trail/schema";

// VSCode Copilot Chat session store:
//   ~/Library/Application Support/Code/User/globalStorage/github.copilot-chat/session-store.db
// Tables of interest:
//   sessions(id, cwd, repository, host_type, branch, summary,
//            agent_name, agent_description, created_at, updated_at)
//   turns(id, session_id, turn_index, user_message, assistant_response, timestamp)
//
// Each turn becomes one "prompt" + one "completion" event.

interface SessionRow {
  id: string;
  cwd: string | null;
  repository: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

interface TurnRow {
  session_id: string;
  turn_index: number;
  user_message: string | null;
  assistant_response: string | null;
  timestamp: string;
}

export interface ParseCopilotChatOptions {
  /** Only return sessions whose updated_at > this ISO timestamp. */
  since?: string;
}

export function parseCopilotChatDB(
  dbPath: string,
  user: string,
  opts: ParseCopilotChatOptions = {},
): Session[] {
  // fileMustExist isn't needed: readOnly:true throws on missing file in node:sqlite.
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const params: Record<string, string> = {};
    let where = "";
    if (opts.since) {
      where = "WHERE updated_at > @since";
      params.since = opts.since;
    }
    const sessionRows = db
      .prepare(
        `SELECT id, cwd, repository, summary, created_at, updated_at
           FROM sessions ${where}
           ORDER BY created_at ASC`,
      )
      .all(params) as unknown as SessionRow[];

    if (sessionRows.length === 0) return [];

    const turnsStmt = db.prepare(
      `SELECT session_id, turn_index, user_message, assistant_response, timestamp
         FROM turns WHERE session_id = ? ORDER BY turn_index ASC`,
    );

    const out: Session[] = [];
    for (const s of sessionRows) {
      const turns = turnsStmt.all(s.id) as unknown as TurnRow[];
      const events: Event[] = [];
      for (const t of turns) {
        const at = t.timestamp || s.created_at;
        if (t.user_message && t.user_message.trim()) {
          events.push({ kind: "prompt", at, text: t.user_message });
        }
        if (t.assistant_response && t.assistant_response.trim()) {
          events.push({ kind: "completion", at, text: t.assistant_response });
        }
      }
      out.push({
        id: s.id,
        user,
        tool: "copilot-chat",
        startedAt: s.created_at,
        endedAt: s.updated_at,
        repo: s.repository ?? s.cwd ?? undefined,
        summary: s.summary ?? undefined,
        events,
      });
    }
    return out;
  } finally {
    db.close();
  }
}
