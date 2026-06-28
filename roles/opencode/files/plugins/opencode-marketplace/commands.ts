import { access, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { globalConfigDir } from "./config/paths"

/**
 * The `/marketplace` discovery command. It exists only to surface the real,
 * agent-free `!marketplace …` commands in OpenCode's slash menu.
 *
 * Its rendered body *is* the help text, so the commands are visible the moment
 * the command runs — even though OpenCode unavoidably runs one agent turn after
 * any slash command (the trailing instruction keeps that turn a no-op).
 */
const HELP_COMMAND = `---
description: How to use the AI skills marketplace
---

# AI Skills Marketplace

Manage skills with these shell commands — type them in the prompt with a leading \`!\`:

- \`!marketplace list\` — list available skills
- \`!marketplace install <name>\` — install a skill
- \`!marketplace remove <slug>\` — remove an installed skill
- \`!marketplace sync\` — check installed skills for updates

(Assistant: just present the commands above to the user; take no further action.)
`

/** Filenames of the per-operation slash commands shipped by earlier versions. */
const LEGACY_COMMANDS = ["marketplace-list", "marketplace-install", "marketplace-remove", "marketplace-sync"]

/** Absolute path to OpenCode's global commands directory. */
function commandsDir(): string {
  return join(globalConfigDir(), "commands")
}

/**
 * Writes the `/marketplace` discovery command into the commands directory if it
 * is not already present (never clobbering a user's customized copy). Runs on
 * `session.created` so a drop-in install self-registers the menu entry.
 */
export async function ensureHelpCommand(): Promise<void> {
  const dir = commandsDir()
  const path = join(dir, "marketplace.md")
  if (await exists(path)) return
  await mkdir(dir, { recursive: true })
  await writeFile(path, HELP_COMMAND, "utf8")
}

/**
 * Removes the per-operation slash commands written by earlier versions. They
 * triggered an agent turn on every list/install/remove/sync; the `!marketplace`
 * bang-shell wrapper replaces them. Safe to call when the files are absent.
 */
export async function cleanupLegacyCommands(): Promise<void> {
  const dir = commandsDir()
  await Promise.all(LEGACY_COMMANDS.map((name) => rm(join(dir, `${name}.md`), { force: true })))
}

/** True when a path already exists on disk. */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
