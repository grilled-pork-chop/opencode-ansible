import { readFileSync } from "node:fs"
import { API_PREFIX, FETCH_TIMEOUT_MS } from "../constants"
import type { ResolvedConfig, SkillRead, SkillSummary, VersionCheck } from "../types"

/** Bun's `fetch` accepts a non-standard `tls` option; this models the bit we use. */
type TlsInit = { tls?: { rejectUnauthorized?: boolean; ca?: string } }

/**
 * Thin HTTP client for the marketplace REST API.
 *
 * All read endpoints are public; a bearer token is forwarded only when
 * `config.apiKey` is set. Every request is bounded by {@link FETCH_TIMEOUT_MS}
 * (or a caller-supplied signal) so a hung server can never block the plugin.
 */
export class MarketplaceClient {
  private readonly base: string
  private readonly tls: TlsInit

  /**
   * @param config - Resolved plugin configuration providing the endpoint and token.
   */
  constructor(private readonly config: ResolvedConfig) {
    this.base = `${config.endpoint}${API_PREFIX}`
    this.tls = buildTls(config)
  }

  /**
   * Lists skills (lightweight summaries — no body or files).
   *
   * @param params - Optional `category` / `tag` / `limit` filters.
   * @returns The array of {@link SkillSummary} returned under `data`.
   */
  async listSkills(params: { category?: string; tag?: string; limit?: number } = {}): Promise<SkillSummary[]> {
    const qs = new URLSearchParams()
    if (params.category) qs.set("category", params.category)
    if (params.tag) qs.set("tag", params.tag)
    qs.set("limit", String(params.limit ?? 100))
    const body = await this.get<{ data: SkillSummary[] }>(`/skills?${qs.toString()}`)
    return body.data ?? []
  }

  /**
   * Fetches a single skill's full payload (frontmatter fields, body, file manifest).
   *
   * @param name - Skill slug.
   */
  getSkill(name: string): Promise<SkillRead> {
    return this.get<SkillRead>(`/skills/${enc(name)}`)
  }

  /**
   * Downloads the raw bytes of one bundled file belonging to a skill.
   *
   * @param name - Skill slug.
   * @param path - Package-relative file path (e.g. `scripts/run.sh`).
   * @returns The file contents as a {@link Uint8Array}.
   */
  async getFile(name: string, path: string): Promise<Uint8Array> {
    const res = await this.request(`/skills/${enc(name)}/files/${encPath(path)}`)
    return new Uint8Array(await res.arrayBuffer())
  }

  /**
   * Asks the marketplace whether a held `sha` is the latest revision of a skill.
   *
   * @param name   - Skill slug.
   * @param sha    - The locally-held `content_sha256`.
   * @param signal - Optional abort signal (used to enforce the startup budget).
   */
  checkVersion(name: string, sha: string, signal?: AbortSignal): Promise<VersionCheck> {
    return this.get<VersionCheck>(`/skills/${enc(name)}/check?sha=${encodeURIComponent(sha)}`, signal)
  }

  /** Performs a JSON GET with auth headers and a timeout, throwing on non-2xx. */
  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await this.request(path, signal)
    return (await res.json()) as T
  }

  /**
   * Issues a GET with auth + timeout, translating low-level failures into a
   * message that names the endpoint actually used — so a wrong `api_endpoint`
   * (or a marketplace that is down) is immediately obvious instead of a bare
   * "Unable to connect".
   */
  private async request(path: string, signal?: AbortSignal): Promise<Response> {
    const url = `${this.base}${path}`
    let res: Response
    try {
      res = await fetch(url, {
        headers: this.headers(),
        signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
        ...this.tls,
      } as RequestInit)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(
        `Cannot reach the marketplace at ${this.config.endpoint} (${reason}). ` +
          `Check that it is running and that the api_endpoint is correct (tried ${url}).`
      )
    }
    if (!res.ok) {
      throw new Error(`Marketplace returned HTTP ${res.status} for ${path} (endpoint ${this.config.endpoint}).`)
    }
    return res
  }

  /** Builds request headers, adding a bearer token only when configured. */
  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json" }
    if (this.config.apiKey) h.Authorization = `Bearer ${this.config.apiKey}`
    return h
  }
}

/**
 * Builds the `tls` fetch option for the configured endpoint.
 *
 * - A `caCert` path is read and trusted (the **secure** way to accept a
 *   self-signed endpoint); if the file can't be read, it falls through.
 * - `insecureTls` disables verification entirely (accepts any cert — use only
 *   when you can't supply the CA).
 * - Otherwise verification stays on (default).
 */
function buildTls(config: ResolvedConfig): TlsInit {
  if (config.caCert) {
    try {
      return { tls: { ca: readFileSync(config.caCert, "utf8") } }
    } catch {
      // Unreadable CA file — fall back to the insecure flag or default verification.
    }
  }
  if (config.insecureTls) return { tls: { rejectUnauthorized: false } }
  return {}
}

/** URL-encodes a path segment (e.g. a skill slug). */
function enc(segment: string): string {
  return encodeURIComponent(segment)
}

/** Encodes a multi-segment relative path, preserving the slashes between segments. */
function encPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/")
}
