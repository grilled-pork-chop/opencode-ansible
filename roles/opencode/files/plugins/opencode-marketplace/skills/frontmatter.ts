import type { SkillRead } from "../types"

/** Frontmatter key the marketplace injects on export (revision + sha + source). */
const STAMP_KEY = "marketplace"

/** First-class frontmatter fields, emitted first and in this order (mirrors the backend). */
const KNOWN_FIELDS = ["name", "display_name", "description", "category", "impact", "tags"] as const

/**
 * Re-emits a canonical `SKILL.md` document from a {@link SkillRead}.
 *
 * The marketplace renders `SKILL.md` only inside its zip export, so to stay
 * zero-dependency the plugin rebuilds the file from the JSON payload. The trick
 * that avoids a YAML serializer: **YAML is a superset of JSON**, so any nested
 * value (`extra` entries, the `marketplace` stamp) is emitted as inline JSON,
 * which is valid YAML. Simple scalars are emitted plainly for readability.
 *
 * The `marketplace` stamp carries `content_sha256` so the file is self-verifiable
 * against `GET /skills/{name}/check?sha=` independently of the lock manifest.
 *
 * @param skill  - Full skill payload from `GET /skills/{name}`.
 * @param source - Provenance URL recorded in the stamp.
 * @returns The complete `SKILL.md` text (frontmatter + body).
 */
export function renderSkillMd(skill: SkillRead, source: string): string {
  const entries: Array<[string, unknown]> = []
  const add = (key: string, value: unknown) => {
    if (!isEmpty(value)) entries.push([key, value])
  }

  add("name", skill.name)
  add("display_name", skill.display_name)
  add("description", skill.description)
  add("category", skill.category)
  add("impact", skill.impact)
  add("tags", skill.tags)

  for (const [key, value] of Object.entries(skill.extra ?? {})) {
    if (!KNOWN_FIELDS.includes(key as (typeof KNOWN_FIELDS)[number]) && key !== STAMP_KEY) {
      add(key, value)
    }
  }

  // Self-verification stamp, always last.
  entries.push([STAMP_KEY, { revision: skill.revision, content_sha256: skill.content_sha256, source }])

  const frontmatter = entries.map(([key, value]) => `${key}: ${emit(value)}`).join("\n")
  const body = (skill.body ?? "").trim()
  return `---\n${frontmatter}\n---\n\n${body}\n`
}

/** Emits a frontmatter value: plain scalar when safe, otherwise inline JSON (valid YAML). */
function emit(value: unknown): string {
  if (typeof value === "string") return needsQuote(value) ? JSON.stringify(value) : value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(value)
}

/** True when a string cannot be emitted as a bare YAML plain scalar. */
function needsQuote(s: string): boolean {
  if (s === "") return true
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._\-/]*$/.test(s)) return true
  if (/\s$/.test(s)) return true
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return true
  return false
}

/** Values the backend omits from frontmatter: null/undefined, empty string, empty array. */
function isEmpty(value: unknown): boolean {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0)
}
