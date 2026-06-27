import { NOTIFIER_TIMEOUT_MS } from "../constants"
import type { OpenCodeClient } from "../types"

/** Display duration in milliseconds for each notification severity level. */
const DURATION = {
  success: 30_000,
  info:    30_000,
  warning: 60_000,
  error:   60_000,
} as const

type ToastVariant = keyof typeof DURATION

/**
 * Sends user-facing notification toasts via the OpenCode TUI client.
 * All methods are fire-and-forget: the toast is dispatched via setTimeout
 * and errors are swallowed so a broken notification path never disrupts
 * the config hook or background monitor.
 */
export class Notifier {

  /**
   * @param client - The OpenCode client object supplied by {@link PluginInput}.
   */
  constructor(private readonly client: OpenCodeClient) {}

  /**
   * Shows a success toast.
   * @param message - Human-readable notification body.
   */
  success(message: string): void { this.show("success", message) }

  /**
   * Shows an error toast.
   * @param message - Human-readable notification body.
   */
  error(message: string): void   { this.show("error",   message) }

  /**
   * Shows a warning toast.
   * @param message - Human-readable notification body.
   */
  warning(message: string): void { this.show("warning", message) }

  /**
   * Shows an informational toast.
   * @param message - Human-readable notification body.
   */
  info(message: string): void    { this.show("info",    message) }


  /**
   * Dispatches a toast via `client.tui.showToast`.
   * @param variant - The visual severity level.
   * @param message - Human-readable notification body.
   */
  private show(variant: ToastVariant, message: string): void {
    setTimeout(() => {
      try {
        this.client?.tui?.showToast?.({ body: { message, variant, duration: DURATION[variant] } })
      } catch {
        // Non-critical — notification failures must not affect plugin behavior
      }
    }, NOTIFIER_TIMEOUT_MS)
  }
}
