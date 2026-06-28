/**
 * Local type definitions for the opencode-ai-marketplace plugin.
 *
 * These intentionally **re-declare** the minimal slices of the `@opencode-ai/*`
 * types that the plugin touches, rather than importing them. The shipped plugin
 * must run as a drop-in folder with **no `node_modules`**, so nothing here may be
 * imported at runtime — the SDK packages are dev-only (for type-checking).
 *
 * @module
 */

/** Toast severity levels accepted by `client.tui.showToast` (matches the SDK union). */
export type ToastVariant = "info" | "success" | "warning" | "error"

/** Minimal view of the OpenCode TUI client used to surface notification toasts. */
export interface OpenCodeClient {
  tui?: {
    showToast?(opts: {
      body: { title?: string; message: string; variant: ToastVariant; duration?: number }
    }): unknown
  }
}

/** Input object OpenCode passes to the plugin factory. Only a subset is used. */
export interface PluginInput {
  client: OpenCodeClient
  /** Project directory for the current session — used to resolve the `project` scope. */
  directory?: string
  [key: string]: unknown
}

/** Free-form plugin options (populated only when listed as a `[name, options]` tuple). */
export type PluginOptions = Record<string, unknown>

/** The subset of OpenCode plugin hooks this plugin implements. */
export interface Hooks {
  /**
   * Called by OpenCode each time it (re)loads configuration — reliably at
   * startup, while the TUI is ready to display toasts. The config argument is
   * unused; this plugin reads its settings from the environment.
   */
  config?: (input: unknown) => Promise<void>
}

/** Factory signature for an OpenCode plugin. */
export type Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>

/** Where downloaded skills live: the global config dir or the project `.opencode` dir. */
export type Scope = "global" | "project"

/** How the startup update check behaves. */
export type SyncStrategy = "on_session_start" | "manual"

/** Fully-resolved plugin configuration (options merged over env merged over defaults). */
export interface ResolvedConfig {
  /** Marketplace base URL, no trailing slash and no `/api/v1` suffix. */
  endpoint: string
  /** Default installation scope for skills. */
  scope: Scope
  /** Optional bearer token forwarded on every request (reads are public; this is optional). */
  apiKey?: string
  /** When true, the startup check pulls updates silently instead of only notifying. */
  autoUpdate: boolean
  /** Whether the update check runs on session start or only on demand. */
  syncStrategy: SyncStrategy
  /**
   * When true, skip TLS certificate verification (accept self-signed certs).
   * **Defaults to true** — insecure (MITM risk); set `insecure_tls: false` or a
   * `caCert` to verify.
   */
  insecureTls: boolean
  /** Path to a PEM CA/cert file to trust (the secure way to accept a self-signed endpoint). */
  caCert?: string
}

/** Lightweight skill descriptor returned by the list endpoint. */
export interface SkillSummary {
  name: string
  display_name: string
  description: string
  category: string
  impact: string
  tags: string[]
  extra: Record<string, unknown>
  revision: number
  content_sha256: string
  updated_at: string
}

/** Metadata for a single bundled file in a skill package. */
export interface SkillFileMeta {
  path: string
  kind: string
  mime_type: string
  size_bytes: number
}

/** Full skill payload returned by `GET /skills/{name}`. */
export interface SkillRead extends SkillSummary {
  body: string
  created_at: string
  files: SkillFileMeta[]
  assets: string[]
}

/** Response of the `GET /skills/{name}/check` self-verification endpoint. */
export interface VersionCheck {
  status: "latest" | "stale" | "unknown"
  latest_revision: number
  latest_sha: string
}

/** One entry in the installed-skills manifest. */
export interface LockEntry {
  name: string
  revision: number
  content_sha256: string
  source: string
}

/** The `.marketplace-lock.json` manifest of installed skills (keyed by slug). */
export interface LockFile {
  version: number
  skills: Record<string, LockEntry>
}
