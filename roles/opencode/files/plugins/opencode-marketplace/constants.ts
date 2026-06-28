/**
 * Shared constants for the opencode-ai-marketplace plugin.
 *
 * Timing values are in milliseconds.
 * @module
 */

/** Path prefix for every marketplace REST call, appended to the configured endpoint. */
export const API_PREFIX = "/api/v1"

/** Default marketplace endpoint when none is configured via options or env. */
export const DEFAULT_ENDPOINT = "http://localhost:8000"

/** Lock-file format version written into `.marketplace-lock.json`. */
export const LOCK_VERSION = 1

/** Filename of the installed-skills manifest, stored at each skills-root. */
export const LOCK_FILENAME = ".marketplace-lock.json"

/**
 * Hard ceiling for the whole startup update check. The check is fired on
 * `session.created` and must never stall an offline/airgapped session, so the
 * entire batch is abandoned once this elapses.
 */
export const STARTUP_BUDGET_MS = 1_500

/** Per-request HTTP timeout for individual marketplace calls. */
export const FETCH_TIMEOUT_MS = 5_000

/** Display duration applied to background notification toasts. */
export const NOTIFIER_TIMEOUT_MS = 1_000

/** File extensions treated as executable helpers, flagged to the user on install. */
export const SCRIPT_EXTS = [".sh", ".js", ".py", ".ts", ".bash", ".zsh"] as const
