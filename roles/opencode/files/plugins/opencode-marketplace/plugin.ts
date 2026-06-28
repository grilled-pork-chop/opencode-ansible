/**
 * @module plugin
 *
 * Plugin factory for the opencode-ai-marketplace plugin.
 *
 * ### Lifecycle
 * 1. OpenCode calls `MarketplacePlugin` once at startup with an initialised client.
 * 2. The factory resolves configuration (options → env → defaults) and wires a
 *    {@link MarketplaceClient}, a {@link Notifier} and the captured project directory.
 * 3. It returns a `config` hook (the same path the reference plugin uses, where TUI
 *    toasts reliably surface). OpenCode calls it on each configuration load; a guard
 *    makes the work run only once per process. On that first call it:
 *    - installs the `!marketplace` bang-shell wrapper and the `/marketplace` help
 *      command (and retires legacy per-operation slash commands),
 *    - runs a time-boxed update check, surfacing results as toasts.
 *
 * User actions run through the bang-shell wrapper (`!marketplace …` → `cli.ts`),
 * not through this plugin: OpenCode's shell path never invokes the model, so the
 * commands are deterministic with no agent turn.
 *
 * The plugin imports nothing from `@opencode-ai/*` at runtime, so it runs as a
 * drop-in folder with no `node_modules` in airgapped environments.
 */

import { resolveConfig } from "./config/options"
import { MarketplaceClient } from "./marketplace/client"
import { Notifier } from "./notification/notifier"
import { install } from "./skills/installer"
import { runSync } from "./sync/lifecycle"
import { cleanupLegacyCommands, ensureHelpCommand } from "./commands"
import { ensureWrapper } from "./wrapper"
import type { Plugin, PluginOptions } from "./types"

export const MarketplacePlugin: Plugin = async ({ client, directory }, options) => {
  const notifier = new Notifier(client)
  let started = false

  return {
    config: async (input) => {
      if (started) return // run the startup work once per process
      started = true

      // Resolve config from the plugin tuple options OpenCode hands us — either
      // via the factory argument or, for a drop-in, the `plugin` array in the
      // config object — falling back to environment variables.
      const config = resolveConfig(options ?? tupleOptions(input), process.env)
      const marketplace = new MarketplaceClient(config)

      // Self-install the bang-shell wrapper + /marketplace help command;
      // retire the old per-operation slash commands. The resolved endpoint/scope
      // are baked into the wrapper so the CLI process honors opencode.json config.
      await cleanupLegacyCommands().catch(() => {})
      await ensureHelpCommand().catch(() => {})
      const bakedEnv: Record<string, string> = {
        MARKETPLACE_API_ENDPOINT: config.endpoint,
        MARKETPLACE_DEFAULT_SCOPE: config.scope,
        // Bake the explicit value (default is true) so the CLI matches the plugin.
        MARKETPLACE_INSECURE_TLS: String(config.insecureTls),
      }
      if (config.caCert) bakedEnv.MARKETPLACE_CA_CERT = config.caCert
      try {
        const wrapper = await ensureWrapper(bakedEnv)
        if (wrapper?.created) {
          notifier.success("Marketplace ready — type /marketplace for help, or !marketplace list")
        }
      } catch {
        // Wrapper install is best-effort; never block startup.
      }

      if (config.syncStrategy !== "on_session_start") return
      try {
        const stale = await runSync(marketplace, config.scope, directory)
        for (const skill of stale) {
          if (config.autoUpdate) {
            await install(marketplace, config, skill.name, config.scope, directory)
            notifier.success(`Updated "${skill.name}" to revision ${skill.latestRevision}`)
          } else {
            notifier.info(
              `Update available for "${skill.name}" (revision ${skill.latestRevision}) — run !marketplace install ${skill.name}`
            )
          }
        }
      } catch {
        // Offline / budget exceeded — never block startup.
      }
    },
  }
}

/**
 * Extracts this plugin's options from the `plugin` array of the OpenCode config
 * object passed to the `config` hook. For a drop-in plugin the factory `options`
 * argument is empty, so the `["opencode-marketplace", { … }]` tuple a user adds
 * to `opencode.json` is recovered here instead.
 *
 * @param input - The config object OpenCode hands the `config` hook.
 * @returns The matched tuple options, or `undefined` if none is present.
 */
function tupleOptions(input: unknown): PluginOptions | undefined {
  const plugin = (input as { plugin?: unknown } | null)?.plugin
  if (!Array.isArray(plugin)) return undefined
  for (const entry of plugin) {
    if (
      Array.isArray(entry) &&
      typeof entry[0] === "string" &&
      entry[0].includes("opencode-marketplace") &&
      entry[1] &&
      typeof entry[1] === "object"
    ) {
      return entry[1] as PluginOptions
    }
  }
  return undefined
}
