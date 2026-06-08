import { describe, expect, it } from "vitest";
import {
  gradeReproducibility,
  matchKitFiles,
  parseStack,
  redactSecrets,
  renderKitMarkdown,
} from "./kit-matchers";

describe("matchKitFiles", () => {
  it("buckets rules, manifests, and configs", () => {
    const result = matchKitFiles([
      "CLAUDE.md",
      ".cursorrules",
      ".cursor/rules/style.mdc",
      "src/index.ts",
      "package.json",
      "requirements.txt",
      "next.config.ts",
      ".env.example",
      "README.md",
    ]);
    expect(result.rules).toEqual(
      expect.arrayContaining(["CLAUDE.md", ".cursorrules", ".cursor/rules/style.mdc"]),
    );
    expect(result.rules).not.toContain("src/index.ts");
    expect(result.configs).toEqual(expect.arrayContaining(["next.config.ts", ".env.example"]));
    expect(result.manifests).toContain("package.json");
  });

  it("prefers package.json first among manifests", () => {
    const { manifests } = matchKitFiles(["requirements.txt", "package.json", "go.mod"]);
    expect(manifests[0]).toBe("package.json");
  });

  it("normalizes a leading ./ in paths", () => {
    const { rules } = matchKitFiles(["./CLAUDE.md"]);
    expect(rules).toContain("CLAUDE.md");
  });

  it("ignores unrelated files", () => {
    const result = matchKitFiles(["src/app.tsx", "docs/guide.md", ".gitignore"]);
    expect(result.rules).toHaveLength(0);
    expect(result.manifests).toHaveLength(0);
    expect(result.configs).toHaveLength(0);
  });
});

describe("parseStack", () => {
  it("extracts frameworks, deps, and language from package.json", () => {
    const pkg = JSON.stringify({
      packageManager: "pnpm@10.16.1",
      dependencies: { next: "16", react: "19", "drizzle-orm": "^0.3", tailwindcss: "^4" },
      devDependencies: { typescript: "^5" },
    });
    const stack = parseStack(pkg);
    expect(stack.packageManager).toBe("pnpm");
    expect(stack.language).toBe("TypeScript");
    expect(stack.frameworks).toEqual(
      expect.arrayContaining(["Next.js", "React", "Drizzle", "Tailwind"]),
    );
    expect(stack.dependencies).toEqual(expect.arrayContaining(["next", "react", "typescript"]));
  });

  it("falls back gracefully on malformed JSON", () => {
    const stack = parseStack("{not json");
    expect(stack.frameworks).toEqual([]);
    expect(stack.dependencies).toEqual([]);
    expect(stack.packageManager).toBeNull();
  });

  it("defaults language to JavaScript without typescript", () => {
    expect(parseStack(JSON.stringify({ dependencies: { react: "19" } })).language).toBe(
      "JavaScript",
    );
  });
});

describe("gradeReproducibility", () => {
  it("is prompts-only with no repo files", () => {
    expect(
      gradeReproducibility({
        hasRules: false,
        hasStack: false,
        hasPrompts: true,
        shippedPublicCommit: false,
      }),
    ).toBe("prompts-only");
  });

  it("is partial with repo files but no shipped commit", () => {
    expect(
      gradeReproducibility({
        hasRules: true,
        hasStack: true,
        hasPrompts: true,
        shippedPublicCommit: false,
      }),
    ).toBe("partial");
  });

  it("is verified only with rules + stack + a shipped public commit", () => {
    expect(
      gradeReproducibility({
        hasRules: true,
        hasStack: true,
        hasPrompts: true,
        shippedPublicCommit: true,
      }),
    ).toBe("verified");
    // Missing stack downgrades a shipped commit to partial.
    expect(
      gradeReproducibility({
        hasRules: true,
        hasStack: false,
        hasPrompts: true,
        shippedPublicCommit: true,
      }),
    ).toBe("partial");
  });
});

describe("redactSecrets", () => {
  it("redacts known token shapes", () => {
    expect(redactSecrets("token ghp_abcdefghijklmnopqrstuvwxyz0123")).toContain(
      "<redacted:secret>",
    );
    expect(redactSecrets("key sk-abcdefghijklmnopqrstuvwxyz")).toContain("<redacted:secret>");
  });

  it("keeps the key name but redacts the value for KEY=value", () => {
    const out = redactSecrets("OPENAI_API_KEY=sk-supersecretvalue1234567");
    expect(out).toContain("OPENAI_API_KEY=<redacted:secret>");
    expect(out).not.toContain("sk-supersecretvalue1234567");
  });

  it("leaves ordinary text untouched", () => {
    const text = "Use Next.js with the app router and Tailwind.";
    expect(redactSecrets(text)).toBe(text);
  });
});

describe("renderKitMarkdown", () => {
  it("renders a usable markdown bundle", () => {
    const md = renderKitMarkdown({
      title: "Auth in Next.js",
      sourceRepo: "octo/app",
      reproducibility: "partial",
      stack: {
        packageManager: "pnpm",
        frameworks: ["Next.js"],
        dependencies: ["next"],
        language: "TypeScript",
      },
      rules: [{ path: "CLAUDE.md", body: "Be concise." }],
      prompts: ["Add login with GitHub OAuth"],
    });
    expect(md).toContain("# Auth in Next.js");
    expect(md).toContain("## CLAUDE.md");
    expect(md).toContain("Add login with GitHub OAuth");
    expect(md).toContain("Next.js");
  });
});
