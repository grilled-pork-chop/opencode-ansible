import { fetchModels } from "../discovery/client"
import { POLL_INTERVAL_MS, simplifyModelId } from "../constants"
import type { Notifier } from "../notification/notifier"

/**
 * Polls each registered provider URL at a fixed interval and sends
 * per-model notifications whenever the available model list changes.
 *
 * Typical lifecycle:
 * 1. Call {@link seed} immediately after the first successful fetch so that
 *    the first poll cycle does not re-notify for models already present at startup.
 * 2. Call {@link start} to begin the interval; it is idempotent for a given URL.
 * 3. Call {@link cleanup} when the plugin is torn down to clear all intervals.
 */
export class ModelRefreshMonitor {
  private readonly knownModels = new Map<string, string[]>()
  private readonly intervals   = new Map<string, ReturnType<typeof setInterval>>()

  /**
   * Records the initial model list for a provider URL, establishing the
   * baseline from which the first poll cycle computes its diff.
   *
   * @param baseUrl - Normalized provider URL (no `/v1` suffix).
   * @param models  - Model IDs returned during startup discovery.
   */
  seed(baseUrl: string, models: string[]): void {
    this.knownModels.set(baseUrl, models)
  }

  /**
   * Starts a background polling interval for the given provider at
   * {@link POLL_INTERVAL_MS}. Calling this more than once for the same
   * `baseUrl` is a no-op.
   *
   * @param providerKey - Provider key included in notification messages.
   * @param baseUrl     - Normalized provider URL to poll.
   * @param notifier    - {@link Notifier} used to surface model-change toasts.
   */
  start(providerKey: string, baseUrl: string, notifier: Notifier): void {
    if (this.intervals.has(baseUrl)) return
    const interval = setInterval(
      () => this.poll(providerKey, baseUrl, notifier).catch(() => {}),
      POLL_INTERVAL_MS
    )
    this.intervals.set(baseUrl, interval)
  }

  /**
   * Cancels all active polling intervals and resets internal state.
   * Safe to call even when no intervals are running.
   */
  cleanup(): void {
    for (const interval of this.intervals.values()) clearInterval(interval)
    this.intervals.clear()
    this.knownModels.clear()
  }

  /**
   * Executes one poll cycle: fetches the current model list, computes a diff
   * against {@link knownModels}, delegates notification to {@link notifyChanges},
   * then updates the stored baseline. Fetch errors are swallowed — startup
   * already surfaced permanent failures via the error toast.
   */
  private async poll(providerKey: string, baseUrl: string, notifier: Notifier): Promise<void> {
    try {
      const current = await fetchModels(baseUrl)
      const previous = this.knownModels.get(baseUrl)
      if (!previous) {
        // First unseeded poll — store baseline and skip diff
        this.knownModels.set(baseUrl, current)
        return
      }
      const added   = current.filter((m) => !previous.includes(m))
      const removed = previous.filter((m) => !current.includes(m))
      this.notifyChanges(providerKey, notifier, added, removed)
      this.knownModels.set(baseUrl, current)
    } catch {
      // Silent — transient poll errors are not surfaced to the user
    }
  }

  /**
   * Sends one notification per added or removed model ID.
   * Added models produce an `info` toast; removed models a `warning` toast.
   *
   * @param providerKey - Provider key included in each notification message.
   * @param notifier    - {@link Notifier} instance to dispatch toasts.
   * @param added       - Model IDs that appeared since the last poll.
   * @param removed     - Model IDs that disappeared since the last poll.
   */
  private notifyChanges(
    providerKey: string,
    notifier: Notifier,
    added: string[],
    removed: string[]
  ): void {
    for (const id of added) {
      notifier.info(`New model "${simplifyModelId(id)}" discovered for provider "${providerKey}"`)
    }
    for (const id of removed) {
      notifier.warning(`Model "${simplifyModelId(id)}" removed from provider "${providerKey}"`)
    }
  }
}
