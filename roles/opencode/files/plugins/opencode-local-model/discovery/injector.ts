import { simplifyModelId } from "../constants"

/**
 * Replaces a provider's `models` map with the IDs returned by the API.
 * The API is treated as the sole source of truth — models no longer
 * served by the provider are removed from the config.
 *
 * @param config      - The raw config object passed to the {@link ConfigHook}.
 * @param providerKey - The provider key whose `models` map is replaced.
 * @param modelIds    - The IDs returned by {@link fetchModels} for this provider.
 */
export function applyDiscoveredModels(
  config: unknown,
  providerKey: string,
  modelIds: string[]
): void {
  const providers = (config as Record<string, unknown>)["provider"] as Record<string, unknown>
  const provider = providers[providerKey] as Record<string, unknown>
  provider["models"] = Object.fromEntries(
    modelIds.map((id) => [id, buildModelEntry(id)])
  )
}

/**
 * Builds a model entry object for injection into a provider's `models` map.
 *
 * The `name` is simplified to the last path segment of the model ID
 * (e.g. `"organization/llama3"` → `"llama3"`), falling back to the full
 * ID when no path separator is present. A default token limit is applied.
 *
 * @param id - The raw model ID returned by {@link fetchModels}.
 * @returns A model entry with a simplified display name and default limit.
 */
function buildModelEntry(id: string): Record<string, unknown> {
  return {
    name: simplifyModelId(id),
    limit: { context: 0, output: 8192 }
  }
}
