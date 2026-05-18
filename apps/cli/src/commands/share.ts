import { Command } from "commander";
import chalk from "chalk";

export function shareCommand(): Command {
  return new Command("share")
    .description("(stub) Upload a session and return a public URL")
    .argument("[id]", "session id")
    .action((id?: string) => {
      console.log(chalk.yellow("share: not implemented in local MVP"), id ?? "");
    });
}
