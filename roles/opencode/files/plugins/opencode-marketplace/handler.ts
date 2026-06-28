import type { MarketplaceClient } from "./marketplace/client"
import type { ResolvedConfig, Scope } from "./types"
import { install } from "./skills/installer"
import { remove } from "./skills/remover"
import { runSync } from "./sync/lifecycle"

/** Everything a command handler needs, captured once by the CLI entry. */
interface CommandDeps {
  client: MarketplaceClient
  config: ResolvedConfig
  directory?: string
}

/**
 * Executes one marketplace command imperatively and returns the text to print.
 *
 * This is the single dispatch point used by {@link module:cli}; the user
 * triggers it via the `!marketplace` bang-shell wrapper, so the action runs
 * deterministically with no agent involvement. All failures are converted to a
 * readable message so the CLI never throws an unhandled error.
 *
 * @param deps        - Captured client/config/directory.
 * @param command     - The internal command name (e.g. `marketplace-install`).
 * @param argsString  - The raw argument string typed after the command.
 * @returns The result text to print.
 */
export async function handleCommand(deps: CommandDeps, command: string, argsString: string): Promise<string> {
  const { client, config, directory } = deps
  const tokens = tokenize(argsString)
  const scope = popScope(tokens, config.scope)

  try {
    switch (command) {
      case "marketplace-list":
        return await listSkills(client, tokens)

      case "marketplace-install": {
        const name = tokens[0]
        if (!name) return "Usage: !marketplace install <skill-name> [--scope global|project]"
        return await install(client, config, name, scope, directory)
      }

      case "marketplace-remove": {
        const slug = tokens[0]
        if (!slug) return "Usage: !marketplace remove <skill-slug> [--scope global|project]"
        return await remove(slug, scope, directory)
      }

      case "marketplace-sync": {
        const stale = await runSync(client, scope, directory)
        if (stale.length === 0) return "All installed marketplace skills are up to date."
        return `Updates available:\n${stale.map((s) => `  • ${s.name} → revision ${s.latestRevision} (run !marketplace install ${s.name})`).join("\n")}`
      }

      default:
        return `Unknown marketplace command: ${command}`
    }
  } catch (error) {
    return `Marketplace command failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

/** Renders the marketplace catalog (names + descriptions only — no bodies). */
async function listSkills(client: MarketplaceClient, tokens: string[]): Promise<string> {
  const category = popFlag(tokens, "--category")
  const tag = popFlag(tokens, "--tag")
  const skills = await client.listSkills({ category, tag })
  if (skills.length === 0) return "No skills found in the marketplace."
  const lines = skills.map((s) => `  • ${s.name} — ${s.description}`).join("\n")
  return `Marketplace skills (${skills.length}):\n${lines}\n\nInstall one with !marketplace install <name>.`
}

/** Splits a raw argument string into whitespace-separated tokens. */
function tokenize(argsString: string): string[] {
  return argsString.trim().split(/\s+/).filter(Boolean)
}

/** Extracts and removes a `--scope <value>` flag, falling back to the default. */
function popScope(tokens: string[], fallback: Scope): Scope {
  const value = popFlag(tokens, "--scope")
  return value === "global" || value === "project" ? value : fallback
}

/** Extracts and removes a `--flag <value>` pair from the token list (if present). */
function popFlag(tokens: string[], flag: string): string | undefined {
  const i = tokens.indexOf(flag)
  if (i === -1 || i + 1 >= tokens.length) return undefined
  const [value] = tokens.splice(i, 2).slice(1)
  return value
}
