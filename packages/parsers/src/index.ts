export { parseClaudeCodeSession } from "./claude-code.js";

export async function parseCodexSession(): Promise<never> {
  throw new Error("codex parser not implemented yet");
}
export async function parseCursorSession(): Promise<never> {
  throw new Error("cursor parser not implemented yet");
}
export async function parseAiderSession(): Promise<never> {
  throw new Error("aider parser not implemented yet");
}
