import { FETCH_TIMEOUT_MS } from "../constants"

/**
 * Strips a trailing slash and an optional `/v1` path segment from a provider
 * base URL, ensuring that `/v1/models` can be appended exactly once.
 *
 * @example
 * normalizeBaseUrl("http://localhost:11434/v1/") // → "http://localhost:11434"
 * normalizeBaseUrl("http://localhost:11434/v1")  // → "http://localhost:11434"
 * normalizeBaseUrl("http://localhost:11434")     // → "http://localhost:11434"
 *
 * @param url - The raw `baseURL` string from the provider config.
 * @returns The normalized URL with no trailing slash and no `/v1` suffix.
 */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "").replace(/\/v1$/, "")
}

/**
 * Fetches the list of available chat models from an OpenAI-compatible
 * `/v1/models` endpoint. Embedding and reranking models are filtered out
 * automatically because OpenCode cannot use them for code generation.
 *
 * @param baseUrl - Normalized provider base URL (no `/v1` suffix).
 *                  Use {@link normalizeBaseUrl} before calling this function.
 * @returns An array of model ID strings, ready for injection into the config.
 * @throws {Error} If the HTTP response is not OK or the response body does
 *                 not contain a `data` array.
 */
export async function fetchModels(baseUrl: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/v1/models`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const body = (await response.json()) as Record<string, unknown>
  if (!Array.isArray(body.data)) {
    throw new Error("unexpected /v1/models response: missing data array")
  }

  return (body.data as { id?: unknown }[])
    .map((m) => String(m.id ?? ""))
    .filter((id) => id)
}
