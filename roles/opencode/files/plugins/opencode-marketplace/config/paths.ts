import { homedir } from "node:os"
import { join, resolve, sep } from "node:path"
import type { Scope } from "../types"

/**
 * Resolves the OpenCode global config directory, honoring `XDG_CONFIG_HOME`.
 *
 * @returns Absolute path to `~/.config/opencode` (or `$XDG_CONFIG_HOME/opencode`).
 */
export function globalConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config")
  return join(base, "opencode")
}

/**
 * Resolves the skills root for a scope.
 *
 * - `global`  → `~/.config/opencode/skills`
 * - `project` → `<directory>/.opencode/skills`
 *
 * @param scope     - Target installation scope.
 * @param directory - The session's project directory (required for `project`).
 * @returns Absolute path to the scope's `skills` directory.
 */
export function skillsRoot(scope: Scope, directory?: string): string {
  if (scope === "project") {
    const root = directory && directory.length > 0 ? directory : process.cwd()
    return join(root, ".opencode", "skills")
  }
  return join(globalConfigDir(), "skills")
}

/**
 * Resolves `rel` against `root` and returns the absolute path **only** if it stays
 * within `root` — the single traversal guard for writing/removing skill files.
 *
 * @param root - The directory the result must stay inside.
 * @param rel  - A (possibly hostile) relative path.
 * @returns The contained absolute path, or `null` if it would escape `root`.
 */
export function resolveUnder(root: string, rel: string): string | null {
  const base = resolve(root)
  const target = resolve(base, rel)
  return target === base || target.startsWith(base + sep) ? target : null
}
