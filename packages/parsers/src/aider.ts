import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Session, Event } from "@trail/schema";

type Block = { kind: "prompt" | "completion"; text: string };

function splitBlocks(raw: string): Block[] {
  const lines = raw.split(/\r?\n/);
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const line of lines) {
    if (line.startsWith("#### ")) {
      if (current) blocks.push(current);
      // start a new prompt block; strip the '#### ' prefix
      current = { kind: "prompt", text: line.slice(5) };
      // promptly close prompt and start completion after capturing single-line prompt? Aider stores
      // the user prompt as one or more lines all prefixed with '#### '. We'll accumulate consecutive
      // '#### ' lines as the prompt.
      continue;
    }
    if (current?.kind === "prompt") {
      // If the line is empty or doesn't start with '#### ', the prompt ends and completion begins.
      if (line.trim() === "") {
        // close prompt; start completion
        blocks.push(current);
        current = { kind: "completion", text: "" };
        continue;
      }
      // continuation of prompt would have '#### ' prefix; if not, treat as completion start
      current.text += "\n" + line;
      continue;
    }
    if (!current) {
      current = { kind: "completion", text: line };
    } else {
      current.text += (current.text ? "\n" : "") + line;
    }
  }
  if (current) blocks.push(current);
  return blocks
    .map((b) => ({ ...b, text: b.text.replace(/^\n+|\n+$/g, "") }))
    .filter((b) => b.text.length > 0);
}

type FileFence = { filePath: string; content: string };

function extractFileFences(completionText: string): FileFence[] {
  const lines = completionText.split("\n");
  const fences: FileFence[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^```(\S*)\s*$/);
    if (fenceMatch) {
      // look back for a file path line (non-empty, no fence, no '####')
      let filePath: string | undefined;
      for (let j = i - 1; j >= 0; j--) {
        const prev = lines[j].trim();
        if (prev === "") continue;
        // likely a file path: contains '.' or '/' and is short-ish
        if (
          /^[\w./\-+@]+$/.test(prev) &&
          (prev.includes("/") || prev.includes("."))
        ) {
          filePath = prev;
        }
        break;
      }
      // capture body
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      // skip closing fence
      i++;
      if (filePath) {
        fences.push({ filePath, content: body.join("\n") });
      }
      continue;
    }
    i++;
  }
  return fences;
}

export async function parseAiderSession(
  filePath: string,
  user: string,
): Promise<Session> {
  const raw = await readFile(filePath, "utf8");
  const st = await stat(filePath);
  const mtime = st.mtime.toISOString();
  const ctime = (st.birthtime ?? st.mtime).toISOString();

  const blocks = splitBlocks(raw);
  const events: Event[] = [];

  // Synthesize timestamps in-order between ctime and mtime so events are ordered.
  const n = Math.max(blocks.length, 1);
  const startMs = new Date(ctime).getTime();
  const endMs = new Date(mtime).getTime();
  const step = n > 1 ? Math.max(1, Math.floor((endMs - startMs) / n)) : 0;
  const tsAt = (idx: number) => new Date(startMs + step * idx).toISOString();

  blocks.forEach((b, idx) => {
    const at = tsAt(idx);
    if (b.kind === "prompt") {
      events.push({ kind: "prompt", at, text: b.text });
    } else {
      events.push({ kind: "completion", at, text: b.text });
      for (const f of extractFileFences(b.text)) {
        events.push({
          kind: "file_diff",
          at,
          path: f.filePath,
          before: "",
          after: f.content,
        });
      }
    }
  });

  return {
    id: path.basename(filePath),
    user,
    tool: "aider",
    startedAt: ctime,
    endedAt: mtime,
    repo: path.dirname(filePath),
    events,
  };
}
