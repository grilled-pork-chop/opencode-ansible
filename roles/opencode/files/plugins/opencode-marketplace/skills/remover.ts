import { rm, stat } from "node:fs/promises"
import { resolve } from "node:path"
import { resolveUnder, skillsRoot } from "../config/paths"
import type { Scope } from "../types"
import * as lock from "./lock"

/**
 * Removes an installed skill: purges its folder and drops its lock entry.
 *
 * The target is validated to live strictly inside the scope's skills-root
 * (path-traversal guard) before anything is deleted.
 *
 * @param slug      - Skill slug to remove.
 * @param scope     - Scope to remove it from.
 * @param directory - Session project directory (for `project` scope).
 * @returns A human-readable result message.
 */
export async function remove(slug: string, scope: Scope, directory?: string): Promise<string> {
  const root = skillsRoot(scope, directory)
  const slugDir = resolveUnder(root, slug)

  // resolveUnder rejects escapes; also reject the root itself (e.g. slug ".").
  if (!slugDir || slugDir === resolve(root)) {
    throw new Error(`Refusing to remove "${slug}": resolves outside a single skill folder`)
  }

  const existed = await exists(slugDir)
  await rm(slugDir, { recursive: true, force: true })
  await lock.remove(root, slug)

  return existed
    ? `Removed "${slug}" from ${root}.\nThe change takes effect in your next OpenCode session.`
    : `"${slug}" was not installed under ${root} (lock cleaned up if present).`
}

/** True when a path exists on disk. */
async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
