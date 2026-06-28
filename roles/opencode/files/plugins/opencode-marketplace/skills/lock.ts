import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { LOCK_FILENAME, LOCK_VERSION } from "../constants"
import type { LockEntry, LockFile } from "../types"

/**
 * Reads the installed-skills manifest from a skills-root.
 *
 * @param root - Absolute path to the scope's `skills` directory.
 * @returns The parsed {@link LockFile}, or an empty manifest if absent/corrupt.
 */
export async function read(root: string): Promise<LockFile> {
  try {
    const raw = await readFile(lockPath(root), "utf8")
    const parsed = JSON.parse(raw) as Partial<LockFile>
    return { version: parsed.version ?? LOCK_VERSION, skills: parsed.skills ?? {} }
  } catch {
    return { version: LOCK_VERSION, skills: {} }
  }
}

/**
 * Inserts or updates one skill entry in the manifest.
 *
 * @param root  - Absolute path to the scope's `skills` directory.
 * @param slug  - Skill slug (manifest key).
 * @param entry - The manifest entry to store.
 */
export async function upsert(root: string, slug: string, entry: LockEntry): Promise<void> {
  const lock = await read(root)
  lock.skills[slug] = entry
  await write(root, lock)
}

/**
 * Removes a skill entry from the manifest (no-op if absent).
 *
 * @param root - Absolute path to the scope's `skills` directory.
 * @param slug - Skill slug to drop.
 */
export async function remove(root: string, slug: string): Promise<void> {
  const lock = await read(root)
  if (slug in lock.skills) {
    delete lock.skills[slug]
    await write(root, lock)
  }
}

/** Serializes the manifest to disk (creating the skills-root if needed). */
async function write(root: string, lock: LockFile): Promise<void> {
  await mkdir(root, { recursive: true })
  await writeFile(lockPath(root), `${JSON.stringify(lock, null, 2)}\n`, "utf8")
}

/** Absolute path to the lock file within a skills-root. */
function lockPath(root: string): string {
  return join(root, LOCK_FILENAME)
}
