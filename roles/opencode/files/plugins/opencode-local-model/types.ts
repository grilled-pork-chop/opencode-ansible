/** Minimal type for the OpenCode TUI client passed to plugins. */
export interface OpenCodeClient {
  tui?: {
    showToast?(opts: { body: { message: string; variant: string; duration: number } }): Promise<void>
  }
}
/** Single model entry in a provider `models` map. */
export type ModelEntry = { name: string, limit: { id: string; name: string; limit: { context: number; output: number } } }

/** Minimal shape of the OpenCode configuration object. */
export interface OpenCodeConfig {
  provider?: Record<string, {
    npm?: string
    name?: string
    options?: Record<string, unknown>
    models?: Record<string, ModelEntry>
    [key: string]: unknown
  }>
  [key: string]: unknown
}

/** Input provided by OpenCode when initializing the plugin. */
export interface PluginInput {
  client: OpenCodeClient
  directory?: string
  [key: string]: unknown
}


/**
 * Async callback invoked by OpenCode each time it loads its configuration.
 * Implementations must mutate `config` in place; the return value is ignored.
 */
export type ConfigHook = (config: OpenCodeConfig) => Promise<void>

/** The object a plugin must return from its factory function. */
export interface PluginOutput {
  config: ConfigHook
}

/** Factory function signature for an OpenCode plugin. */
export type Plugin = (input: PluginInput) => Promise<PluginOutput>
