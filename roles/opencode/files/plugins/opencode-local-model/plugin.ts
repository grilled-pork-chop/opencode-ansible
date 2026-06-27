/**
 * @module plugin
 *
 * Plugin factory for the opencode-local-model plugin.
 *
 * ### Lifecycle
 * 1. OpenCode calls `LocalModelPlugin` once at startup with an initialised client.
 * 2. The factory creates a {@link Notifier} (wraps the TUI client for toasts) and a
 *    {@link ModelRefreshMonitor} (manages background polling intervals).
 * 3. It returns a {@link PluginOutput} whose `config` hook is produced by
 *    {@link buildConfigHook} — the hook closes over the notifier and monitor.
 * 4. OpenCode calls `config(rawConfig)` on each configuration reload.
 *    The hook discovers models, merges them into the config, and seeds/starts
 *    the refresh monitor on the first successful fetch per provider.
 */

import { buildConfigHook } from "./config/hook"
import { ModelRefreshMonitor } from "./monitoring/refresh-monitor"
import { Notifier } from "./notification/notifier"
import type { Plugin } from "./types"

export const LocalModelPlugin: Plugin = async ({ client }) => {
  if (!client) {
    return { config: async () => {} }
  }
  const notifier = new Notifier(client)
  const monitor  = new ModelRefreshMonitor()
  return { config: buildConfigHook(notifier, monitor) }
}
