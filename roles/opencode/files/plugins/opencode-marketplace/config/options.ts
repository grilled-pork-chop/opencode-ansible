import { DEFAULT_ENDPOINT } from "../constants"
import type { PluginOptions, ResolvedConfig, Scope, SyncStrategy } from "../types"

/**
 * Resolves the effective plugin configuration.
 *
 * Precedence (highest first): explicit plugin `options` (only present when the
 * plugin is registered as a `[name, options]` tuple) → environment variables →
 * built-in defaults. The API token is read **only** from the environment, never
 * from the config file, so credentials stay out of `opencode.json`.
 *
 * For a drop-in install (auto-loaded from the plugin folder) `options` is empty,
 * so the environment variables below are the canonical configuration surface.
 *
 * @param options - Plugin options passed by OpenCode (may be undefined/empty).
 * @param env     - The process environment (`process.env`).
 * @returns A fully-populated {@link ResolvedConfig}.
 */
export function resolveConfig(
  options: PluginOptions | undefined,
  env: Record<string, string | undefined>
): ResolvedConfig {
  const opt = options ?? {}

  const endpoint = normalizeEndpoint(
    str(opt.api_endpoint) ?? env.MARKETPLACE_API_ENDPOINT ?? DEFAULT_ENDPOINT
  )
  const scope = asScope(str(opt.default_scope) ?? env.MARKETPLACE_DEFAULT_SCOPE)
  const syncStrategy = asSyncStrategy(str(opt.sync_strategy) ?? env.MARKETPLACE_SYNC_STRATEGY)
  const autoUpdate = asBool(opt.auto_update, env.MARKETPLACE_AUTO_UPDATE)
  const apiKey = env.MARKETPLACE_API_KEY || undefined
  const insecureTls = resolveInsecureTls(opt.insecure_tls, env.MARKETPLACE_INSECURE_TLS)
  const caCert = str(opt.ca_cert) ?? env.MARKETPLACE_CA_CERT

  return { endpoint, scope, apiKey, autoUpdate, syncStrategy, insecureTls, caCert }
}

/** Strips a trailing slash and an accidental `/api/v1` suffix from the endpoint. */
function normalizeEndpoint(url: string): string {
  return url.replace(/\/+$/, "").replace(/\/api\/v1$/, "")
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function asScope(value: string | undefined): Scope {
  return value === "project" ? "project" : "global"
}

function asSyncStrategy(value: string | undefined): SyncStrategy {
  return value === "manual" ? "manual" : "on_session_start"
}

function asBool(optValue: unknown, envValue: string | undefined): boolean {
  if (typeof optValue === "boolean") return optValue
  return envValue === "true" || envValue === "1"
}

/**
 * Resolves the TLS verification toggle. **Defaults to `true` (insecure)** so a
 * self-signed marketplace works out of the box — at the cost of accepting any
 * certificate (MITM risk). Re-enable verification with `insecure_tls: false`
 * (or set `ca_cert` to trust a specific certificate, which is preferred).
 */
function resolveInsecureTls(optValue: unknown, envValue: string | undefined): boolean {
  if (typeof optValue === "boolean") return optValue
  if (envValue === "false" || envValue === "0") return false
  return true
}
