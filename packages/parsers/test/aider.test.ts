import { describe, it, expect } from "vitest";
import { parseAiderSession } from "../src/aider.js";
import { writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

describe("aider parser", () => {
  it("parses a synthetic .aider.chat.history.md", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "aider-"));
    const fp = path.join(dir, ".aider.chat.history.md");
    const content = `#### add a hello function

Sure, I'll add it.

src/hello.ts
\`\`\`ts
export function hello() {
  return "hi";
}
\`\`\`

#### thanks

You're welcome!
`;
    await writeFile(fp, content, "utf8");
    const s = await parseAiderSession(fp, "tester");
    expect(s.tool).toBe("aider");
    expect(s.user).toBe("tester");
    const kinds = s.events.map((e) => e.kind);
    expect(kinds).toContain("prompt");
    expect(kinds).toContain("completion");
    const fd = s.events.find((e) => e.kind === "file_diff");
    if (fd && fd.kind === "file_diff") {
      expect(fd.path).toBe("src/hello.ts");
      expect(fd.before).toBe("");
      expect(fd.after).toContain("hello");
    }
  });
});
