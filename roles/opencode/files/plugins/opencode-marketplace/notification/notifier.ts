import { NOTIFIER_TIMEOUT_MS } from "../constants"
import type { OpenCodeClient } from "../types"

/** Display duration in milliseconds for each notification severity level. */
const DURATION = {
  success: 30_000,
  info: 30_000,
  warning: 60_000,
  error: 60_000,
} as const

type ToastVariant = keyof typeof DURATION

/**
 * Sends user-facing notification toasts via the OpenCode TUI client.
 *
 * All methods are fire-and-forget: the toast is dispatched on a short timer and
 * errors are swallowed, so a broken notification path never disrupts the event
 * hook or a command. Used only for background update notices — command results
 * are returned as text instead.
 */
export class Notifier {
  /**
   * @param client - The OpenCode client supplied to the plugin factory.
   */
  constructor(private readonly client: OpenCodeClient | undefined) {}

  /** Shows a success toast. */
  success(message: string): void {
    this.show("success", message)
  }

  /** Shows an error toast. */
  error(message: string): void {
    this.show("error", message)
  }

  /** Shows a warning toast. */
  warning(message: string): void {
    this.show("warning", message)
  }

  /** Shows an informational toast. */
  info(message: string): void {
    this.show("info", message)
  }

  /** Dispatches a toast via `client.tui.showToast`, swallowing any failure. */
  private show(variant: ToastVariant, message: string): void {
    setTimeout(() => {
      try {
        this.client?.tui?.showToast?.({ body: { message, variant, duration: DURATION[variant] } })
      } catch {
        // Non-critical — notification failures must not affect plugin behavior.
      }
    }, NOTIFIER_TIMEOUT_MS)
  }
}
