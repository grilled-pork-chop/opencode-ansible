import { OPENAI_COMPATIBLE_NPM, simplifyModelId } from "../constants"
import { fetchModels } from "../discovery/client"
import { applyDiscoveredModels } from "../discovery/injector"
import { extractCompatibleProviders } from "../discovery/scanner"
import { ModelRefreshMonitor } from "../monitoring/refresh-monitor"
import { Notifier } from "../notification/notifier"
import type { ConfigHook, ModelEntry, OpenCodeConfig } from "../types"

/**
 * Builds the {@link ConfigHook} called by OpenCode once at startup.
 *
 * For each `@ai-sdk/openai-compatible` provider found in the config:
 * - Fetches available models from `/v1/models`
 * - Replaces them into the provider's `models` map (existing entries preserved)
 * - Fires a success toast and starts background polling via {@link ModelRefreshMonitor}
 *
 * @param notifier - Surfaces success/error toasts to the user.
 * @param monitor  - Polls each provider for model changes after startup.
 */
export function buildConfigHook(notifier: Notifier, monitor: ModelRefreshMonitor): ConfigHook {
  return async (config: OpenCodeConfig): Promise<void> => {
    const providers = extractCompatibleProviders(config)
    if (providers.length === 0) {
      notifier.warning(`No '${OPENAI_COMPATIBLE_NPM}' provider found in config`)
      return
    }

    await Promise.all(
      providers.map(async ({ key, baseUrl }) => {
        try {
          const models = await fetchModels(baseUrl)
          applyDiscoveredModels(config, key, models)
          monitor.seed(baseUrl, models)

          if (models.length === 0) {
            notifier.warning(`No models found for provider "${key}"`)
            return
          }

          if (!config.model) {
            config.model = `${key}/${models[0]}`
          }
          notifier.success(`Discovered ${models.length} model(s) for provider "${key}":\n${formatModelList(models)}`)
        } catch (error) {
          monitor.seed(baseUrl, [])
          const msg = error instanceof Error ? error.message : String(error)
          notifier.error(`Model discovery failed for provider "${key}": ${msg}`)
        } finally {
          monitor.start(key, baseUrl, notifier)
        }
      })
    )
  }
}

/**
 * Formats an array of model IDs into a bullet-pointed list suitable for
 * display in a notification toast.
 *
 * @param models - Model ID strings to list.
 * @returns A newline-separated string where each model is prefixed with `•`.
 */
function formatModelList(modelsIds: string[]): string {
  return modelsIds.map(m => `  • ${simplifyModelId(m)}`).join("\n")
}
