import { mkdir, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { API_PREFIX, SCRIPT_EXTS } from "../constants"
import { resolveUnder, skillsRoot } from "../config/paths"
import type { MarketplaceClient } from "../marketplace/client"
import type { ResolvedConfig, Scope } from "../types"
import { renderSkillMd } from "./frontmatter"
import * as lock from "./lock"

/**
 * Installs (or re-installs) a skill into the given scope as a clean, isolated folder.
 *
 * The download is a **full clean extraction**: the slug folder is wiped first so
 * no files survive across versions, then `SKILL.md` (rebuilt from JSON, with a
 * self-verification stamp) and every bundled file are written. The lock manifest
 * is updated and any executable helper files are surfaced to the caller.
 *
 * @param client    - Marketplace HTTP client.
 * @param config    - Resolved plugin configuration (endpoint used for provenance).
 * @param name      - Skill slug to install.
 * @param scope     - Target scope.
 * @param directory - Session project directory (for `project` scope).
 * @returns A human-readable result message.
 */
export async function install(
  client: MarketplaceClient,
  config: ResolvedConfig,
  name: string,
  scope: Scope,
  directory?: string
): Promise<string> {
  const skill = await client.getSkill(name)
  const root = skillsRoot(scope, directory)
  const slugDir = join(root, skill.name)

  // Full clean extraction: wipe then recreate so stale files never linger.
  await rm(slugDir, { recursive: true, force: true })
  await mkdir(slugDir, { recursive: true })

  const source = `${config.endpoint}${API_PREFIX}/skills/${encodeURIComponent(skill.name)}`
  await writeFile(join(slugDir, "SKILL.md"), renderSkillMd(skill, source), "utf8")

  const scripts: string[] = []
  for (const file of skill.files ?? []) {
    const dest = resolveUnder(slugDir, file.path)
    if (!dest) continue // skip anything that would escape the slug folder
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, await client.getFile(skill.name, file.path))
    if (isScript(file.path)) scripts.push(file.path)
  }

  await lock.upsert(root, skill.name, {
    name: skill.name,
    revision: skill.revision,
    content_sha256: skill.content_sha256,
    source,
  })

  let message = `Installed "${skill.name}" (revision ${skill.revision}) → ${slugDir}\nAvailable in your next OpenCode session.`
  if (scripts.length > 0) {
    message += `\n\n⚠ This bundle ships executable helper file(s); review before running:\n${scripts.map((p) => `  • ${p}`).join("\n")}`
  }
  return message
}

/** True when a bundled path is an executable helper that should be flagged. */
function isScript(path: string): boolean {
  const lower = path.toLowerCase()
  return lower.startsWith("scripts/") || SCRIPT_EXTS.some((ext) => lower.endsWith(ext))
}
