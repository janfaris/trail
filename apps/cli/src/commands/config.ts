import { Command } from "commander";
import chalk from "chalk";
import {
  loadConfig,
  isValidKey,
  parseConfigValue,
  setConfigValue,
  getConfigPath,
  type TrailConfig,
} from "../lib/config.js";

export function configCommand(): Command {
  const cmd = new Command("config").description(
    "Get or set local Trail CLI configuration (~/.trail/config.json)",
  );

  cmd
    .command("get [key]")
    .description("Print the current value of a config key (or all keys)")
    .action((key?: string) => {
      const cfg = loadConfig();
      if (!key) {
        for (const k of Object.keys(cfg) as Array<keyof TrailConfig>) {
          console.log(`${k}=${String(cfg[k])}`);
        }
        return;
      }
      if (!isValidKey(key)) {
        console.error(chalk.red("✗"), `unknown key: ${key}`);
        process.exit(1);
      }
      console.log(String(cfg[key]));
    });

  cmd
    .command("set <key> <value>")
    .description("Set a config key (e.g. `trail config set autoUpload true`)")
    .action((key: string, raw: string) => {
      if (!isValidKey(key)) {
        console.error(chalk.red("✗"), `unknown key: ${key}`);
        console.error(chalk.gray("  valid keys: autoUpload"));
        process.exit(1);
      }
      try {
        const parsed = parseConfigValue(key, raw);
        setConfigValue(key, parsed);
        console.log(chalk.green("✓"), `${key}=${String(parsed)}`);
        console.log(chalk.gray(`  written to ${getConfigPath()}`));
      } catch (e) {
        console.error(chalk.red("✗"), (e as Error).message);
        process.exit(1);
      }
    });

  cmd
    .command("list")
    .description("Print all config keys and their effective values")
    .action(() => {
      const cfg = loadConfig();
      for (const k of Object.keys(cfg) as Array<keyof TrailConfig>) {
        console.log(`${k}=${String(cfg[k])}`);
      }
    });

  return cmd;
}
