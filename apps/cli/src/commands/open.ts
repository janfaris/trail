import { Command } from "commander";
import chalk from "chalk";
import { spawn, spawnSync } from "node:child_process";

// `trail open <url>` — fork a published trail into whichever AI dev tool the
// user has installed. Probes $PATH for known binaries and pipes the recipe
// markdown into stdin. The fork endpoint always returns markdown, so the
// command is universal: each tool just needs to accept a setup prompt.

interface ToolHandler {
  bin: string;
  /**
   * Run the tool with the recipe markdown. Returns the spawned child's exit
   * code (0 = success). Implementations can use the URL or the markdown text.
   */
  invoke: (markdown: string, recipeUrl: string) => Promise<number>;
}

const HANDLERS: Record<string, ToolHandler> = {
  claude: {
    bin: "claude",
    invoke: (md) =>
      new Promise((resolve) => {
        // `claude code` reads a prompt from stdin and starts an interactive session.
        // We pipe the recipe in, then let stdio inherit so the user can chat.
        const child = spawn("claude", ["code"], { stdio: ["pipe", "inherit", "inherit"] });
        child.stdin.write(md);
        child.stdin.end();
        child.on("exit", (code) => resolve(code ?? 0));
      }),
  },
  codex: {
    bin: "codex",
    invoke: (_md, url) =>
      new Promise((resolve) => {
        const child = spawn("codex", ["--resume", url], { stdio: "inherit" });
        child.on("exit", (code) => resolve(code ?? 0));
      }),
  },
  hermes: {
    bin: "hermes",
    invoke: (_md, url) =>
      new Promise((resolve) => {
        const child = spawn("hermes", ["resume", url], { stdio: "inherit" });
        child.on("exit", (code) => resolve(code ?? 0));
      }),
  },
  cursor: {
    bin: "cursor",
    invoke: (md) =>
      new Promise((resolve) => {
        // Cursor's CLI accepts --prompt; if unavailable fall back to clipboard.
        const child = spawnSync("cursor", ["--prompt", md], { stdio: "inherit" });
        resolve(child.status ?? 0);
      }),
  },
  windsurf: {
    bin: "windsurf",
    invoke: (md) =>
      new Promise((resolve) => {
        const child = spawnSync("windsurf", ["--prompt", md], { stdio: "inherit" });
        resolve(child.status ?? 0);
      }),
  },
  aider: {
    bin: "aider",
    invoke: (md) =>
      new Promise((resolve) => {
        const child = spawn("aider", ["--message", md], { stdio: "inherit" });
        child.on("exit", (code) => resolve(code ?? 0));
      }),
  },
};

const TOOL_PREFERENCE_ORDER = ["claude", "codex", "hermes", "cursor", "aider", "windsurf"];

function which(bin: string): boolean {
  const r = spawnSync("which", [bin], { stdio: "ignore" });
  return r.status === 0;
}

function detectInstalledTools(): string[] {
  return TOOL_PREFERENCE_ORDER.filter((k) => which(HANDLERS[k]!.bin));
}

async function fetchRecipe(forkUrl: string): Promise<string> {
  const res = await fetch(forkUrl, { redirect: "follow" });
  if (!res.ok) throw new Error(`fetch ${forkUrl} -> ${res.status}`);
  return await res.text();
}

/** Accepts both the session URL (.../u/x/y) and the explicit fork URL. */
function toForkUrl(url: string): string {
  if (url.endsWith("/fork")) return url;
  return url.replace(/\/+$/, "") + "/fork";
}

export function openCommand(): Command {
  return new Command("open")
    .description("Fork a published trail into your installed AI tool")
    .argument("<url>", "trail URL (e.g. https://gettrail.vercel.app/u/jan/abc)")
    .option(
      "--tool <name>",
      "force a specific tool (claude|codex|hermes|cursor|aider|windsurf)",
    )
    .option("--print", "print the recipe markdown to stdout; do not launch any tool")
    .action(async (url: string, opts: { tool?: string; print?: boolean }) => {
      const forkUrl = toForkUrl(url);
      let recipe: string;
      try {
        recipe = await fetchRecipe(forkUrl);
      } catch (e) {
        console.error(chalk.red("✗"), `couldn't fetch recipe: ${(e as Error).message}`);
        process.exit(1);
      }

      if (opts.print) {
        process.stdout.write(recipe);
        return;
      }

      const installed = detectInstalledTools();
      const chosen = opts.tool ?? installed[0];
      if (!chosen) {
        console.error(
          chalk.yellow("!"),
          "no supported AI tool found on $PATH.",
          "\nInstall one of:",
          TOOL_PREFERENCE_ORDER.map((t) => `  · ${t}`).join("\n"),
          "\n\nOr pipe the recipe yourself:",
          `\n  curl ${forkUrl} | <your-tool>`,
        );
        process.exit(1);
      }

      const handler = HANDLERS[chosen];
      if (!handler) {
        console.error(chalk.red("✗"), `unknown tool: ${chosen}`);
        process.exit(1);
      }
      if (!which(handler.bin)) {
        console.error(
          chalk.red("✗"),
          `${chosen} (\`${handler.bin}\`) not on $PATH`,
        );
        process.exit(1);
      }

      console.log(chalk.cyan("trail"), `opening ${chosen} with recipe from ${forkUrl}`);
      const code = await handler.invoke(recipe, url);
      process.exit(code);
    });
}
