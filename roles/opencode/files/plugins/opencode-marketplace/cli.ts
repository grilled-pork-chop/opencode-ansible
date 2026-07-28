/**
 * Command-line entry for the marketplace plugin, run via the bang-shell.
 *
 * OpenCode's `!`-prefixed shell input runs a command **without** invoking the
 * model (unlike slash commands), so this CLI gives a deterministic, agent-free
 * UX. It needs no separate runtime: it is launched through opencode's own
 * embedded Bun (`BUN_BE_BUN=1 opencode <cli.ts> …`) by the deployed `marketplace`
 * wrapper, so it works on airgapped hosts where only opencode is installed. The
 * marketplace endpoint is read from `marketplace.json` (see `config/file.ts`).
 *
 * Usage: marketplace <list|install|remove|sync> [args…]
 *
 * @module
 */

import { loadFileConfig } from "./config/file"
import { resolveConfig } from "./config/options"
import { handleCommand } from "./handler"
import { MarketplaceClient } from "./marketplace/client"

/** Maps a CLI subcommand to its internal command name. */
const SUBCOMMANDS: Record<string, string> = {
  list: "marketplace-list",
  install: "marketplace-install",
  remove: "marketplace-remove",
  sync: "marketplace-sync",
}

const USAGE = [
  "Usage: !marketplace <command> [args]",
  "",
  "  list [--category <c>] [--tag <t>]      List available skills",
  "  install <name> [--scope global|project]  Install a skill",
  "  remove <slug> [--scope global|project]   Remove an installed skill",
  "  sync                                    Check installed skills for updates",
].join("\n")

const [subcommand, ...rest] = process.argv.slice(2)

if (!subcommand || !(subcommand in SUBCOMMANDS)) {
  console.log(USAGE)
  process.exit(subcommand ? 1 : 0)
}

const config = resolveConfig(await loadFileConfig(), process.env)
const client = new MarketplaceClient(config)
const text = await handleCommand(
  { client, config, directory: process.cwd() },
  SUBCOMMANDS[subcommand],
  rest.join(" ")
)
console.log(text)
