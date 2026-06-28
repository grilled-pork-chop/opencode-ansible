import { STARTUP_BUDGET_MS } from "../constants"
import { skillsRoot } from "../config/paths"
import type { MarketplaceClient } from "../marketplace/client"
import type { Scope } from "../types"
import * as lock from "../skills/lock"

/** A skill whose local copy is behind the marketplace's latest revision. */
export interface StaleSkill {
  name: string
  latestRevision: number
}

/**
 * Checks every installed (lock-tracked) skill against the marketplace and
 * reports those that are stale.
 *
 * Each skill's stored `content_sha256` is verified via `GET /skills/{name}/check`.
 * All checks run in parallel under a single {@link STARTUP_BUDGET_MS} budget so an
 * offline or slow marketplace can never stall session startup — when the budget
 * elapses the in-flight checks are aborted and whatever resolved in time is used.
 *
 * @param client    - Marketplace HTTP client.
 * @param scope     - Scope whose manifest to check.
 * @param directory - Session project directory (for `project` scope).
 * @returns The stale skills (empty on a fully up-to-date, offline, or empty manifest).
 */
export async function runSync(
  client: MarketplaceClient,
  scope: Scope,
  directory?: string
): Promise<StaleSkill[]> {
  const root = skillsRoot(scope, directory)
  const entries = Object.values((await lock.read(root)).skills)
  if (entries.length === 0) return []

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STARTUP_BUDGET_MS)
  try {
    const results = await Promise.allSettled(
      entries.map(async (entry): Promise<StaleSkill | null> => {
        const check = await client.checkVersion(entry.name, entry.content_sha256, controller.signal)
        return check.status === "stale" ? { name: entry.name, latestRevision: check.latest_revision } : null
      })
    )
    return results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []))
  } finally {
    clearTimeout(timer)
  }
}
