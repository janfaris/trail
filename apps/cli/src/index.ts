import { Command } from "commander";
import { recordCommand } from "./commands/record.js";
import { viewCommand } from "./commands/view.js";
import { shareCommand } from "./commands/share.js";
import { searchCommand } from "./commands/search.js";
import { loginCommand, logoutCommand, whoamiCommand } from "./commands/auth.js";

const program = new Command()
  .name("trail")
  .description("Record and share your AI coding sessions")
  .version("0.1.0");

program.addCommand(recordCommand());
program.addCommand(viewCommand());
program.addCommand(shareCommand());
program.addCommand(searchCommand());
program.addCommand(loginCommand());
program.addCommand(logoutCommand());
program.addCommand(whoamiCommand());

program.parseAsync();
