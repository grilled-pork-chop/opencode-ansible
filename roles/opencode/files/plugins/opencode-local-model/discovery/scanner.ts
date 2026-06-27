import { OPENAI_COMPATIBLE_NPM } from "../constants"
import { normalizeBaseUrl } from "./client"


/**
 * Represents a single OpenAI-compatible provider resolved from the opencode config.
 */
export interface ProviderEntry {
  /** The provider key as declared in the opencode config (e.g. `"local"`). */
  readonly key: string
  /**
   * Normalized base URL for this provider (no trailing slash, no `/v1` suffix).
   * Ready to be passed directly to {@link fetchModels}.
   */
  readonly baseUrl: string
}

/**
 * Scans the opaque opencode config object and returns all providers whose
 * `npm` field equals `"@ai-sdk/openai-compatible"` and that have a valid
 * `options.baseURL` string.
 *
 * Returns an empty array (never throws) when the config is missing,
 * malformed, or contains no compatible providers.
 *
 * @param config - The raw config value passed to the {@link ConfigHook}.
 * @returns Zero or more {@link ProviderEntry} objects, one per compatible provider.
 */
export function extractCompatibleProviders(config: unknown): ProviderEntry[] {
  if (!config || typeof config !== "object") return []
  const providers = (config as Record<string, unknown>)["provider"]
  if (!providers || typeof providers !== "object") return []

  return Object.entries(providers as Record<string, unknown>).flatMap(([key, value]) => {
    if (!value || typeof value !== "object") return []
    const p = value as Record<string, unknown>
    if (p["npm"] !== OPENAI_COMPATIBLE_NPM) return []
    const options = p["options"] as Record<string, unknown> | undefined
    const baseURL = options?.["baseURL"]
    if (typeof baseURL !== "string" || !baseURL) return []
    return [{ key, baseUrl: normalizeBaseUrl(baseURL) }]
  })
}
