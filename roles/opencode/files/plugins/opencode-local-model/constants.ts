/**
 * Shared constants for the opencode-local-model plugin.
 *
 * All timing values are in milliseconds.
 * @module
 */

/** npm package identifier for the OpenAI-compatible AI SDK adapter. */
export const OPENAI_COMPATIBLE_NPM = "@ai-sdk/openai-compatible"

/**
 * Interval between background model-list polls performed by {@link ModelRefreshMonitor}.
 */
export const POLL_INTERVAL_MS = 15_000

/**
 * Hard timeout for each `/v1/models` HTTP request.
 * If the server does not respond within this window the fetch is aborted.
 */
export const FETCH_TIMEOUT_MS = 5_000

/**
 * Timeout for each notifier display by {@link Notifier}.
 */
export const NOTIFIER_TIMEOUT_MS = 1_000

/**
 * Simplifies a model ID to its last path segment for display.
 * (e.g. `"organization/llama3"` → `"llama3"`)
 *
 * @param id - The raw model ID.
 * @returns The simplified display name.
 */
export function simplifyModelId(id: string): string {
  return id.replace(/\/+$/, '').split('/').pop() ?? id
}