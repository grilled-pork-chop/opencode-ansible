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
 *    - installs the `/marketplace` help command (and retires legacy per-operation
 *      slash commands),
 *    - runs a time-boxed update check, surfacing results as toasts.
 *
 * User actions run through the `!marketplace …` bang-shell wrapper (→ `cli.ts`), not
 * through this plugin: OpenCode's shell path never invokes the model, so the commands
 * are deterministic with no agent turn. The deployment provides that wrapper and the
 * `marketplace.json` config file this plugin reads.
 *
 * The plugin imports nothing from `@opencode-ai/*` at runtime, so it runs as a
 * drop-in folder with no `node_modules` in airgapped environments.
 */

import { loadFileConfig } from "./config/file"
import { resolveConfig } from "./config/options"
import { MarketplaceClient } from "./marketplace/client"
import { Notifier } from "./notification/notifier"
import { install } from "./skills/installer"
import { runSync } from "./sync/lifecycle"
import { cleanupLegacyCommands, ensureHelpCommand } from "./commands"
import type { Plugin } from "./types"

export const MarketplacePlugin: Plugin = async ({ client, directory }, options) => {
  const notifier = new Notifier(client)
  let started = false

  return {
    config: async () => {
      if (started) return // run the startup work once per process
      started = true

      // Resolve config from the drop-in config file (marketplace.json, written by
      // the deployment) or explicit factory options, falling back to env/defaults.
      const config = resolveConfig(options ?? (await loadFileConfig()), process.env)
      const marketplace = new MarketplaceClient(config)

      // Register the /marketplace help command; retire the old per-operation slash
      // commands. The bang-shell wrapper itself is provided by the deployment.
      await cleanupLegacyCommands().catch(() => {})
      await ensureHelpCommand().catch(() => {})

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
