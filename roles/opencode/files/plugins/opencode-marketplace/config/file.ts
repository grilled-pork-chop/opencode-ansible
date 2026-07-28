import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { globalConfigDir } from "./paths"
import type { PluginOptions } from "../types"

/** Filename of the role-templated marketplace config, read from the global config dir. */
const CONFIG_FILENAME = "marketplace.json"

/**
 * Loads the plugin's configuration from `~/.config/opencode/marketplace.json`.
 *
 * This is the drop-in configuration surface: OpenCode passes no options to an
 * auto-loaded plugin, and an airgapped host has no reliable shell environment, so
 * the endpoint is read from a small JSON file the deployment writes. Its keys line
 * up with {@link PluginOptions} (`api_endpoint`, `default_scope`, `sync_strategy`,
 * `auto_update`, `insecure_tls`, `ca_cert`) and feed straight into `resolveConfig`.
 *
 * Never throws — a missing or malformed file yields `{}` so startup stays offline-safe.
 *
 * @returns The parsed options, or `{}` when the file is absent or invalid.
 */
export async function loadFileConfig(): Promise<PluginOptions> {
  try {
    const raw = await readFile(join(globalConfigDir(), CONFIG_FILENAME), "utf8")
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as PluginOptions) : {}
  } catch {
    return {}
  }
}
