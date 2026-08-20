/**
 * ToastService - OpenCode toast notification integration
 *
 * Provides toast notifications for MCP tool pass-through visibility.
 * Gracefully degrades when client.tui.showToast is unavailable.
 */

import { createLogger } from "../utils/logger.js";

const log = createLogger("services:toast");

export interface ToastOptions {
  title?: string;
  message: string;
  variant: "info" | "success" | "warning" | "error";
}

export interface OpenCodeTuiClient {
  showToast: (options: { body: { title?: string; message: string; variant: string } }) => Promise<void>;
}

export interface OpenCodeClientWithTui {
  tui?: OpenCodeTuiClient;
}

export class ToastService {
  private client: OpenCodeClientWithTui | null = null;

  setClient(client: OpenCodeClientWithTui): void {
    this.client = client;
  }

  async show(options: ToastOptions): Promise<void> {
    if (!this.client?.tui?.showToast) {
      log.debug("Toast not available; client.tui.showToast missing", { message: options.message });
      return;
    }

    try {
      await this.client.tui.showToast({
        body: {
          title: options.title,
          message: options.message,
          variant: options.variant,
        },
      });
    } catch (error) {
      log.debug("Toast failed", { error, message: options.message });
    }
  }

  async showPassThroughSummary(tools: string[]): Promise<void> {
    if (tools.length === 0) return;

    const toolList = tools.length <= 3
      ? tools.join(", ")
      : `${tools.slice(0, 3).join(", ")} +${tools.length - 3} more`;

    await this.show({
      title: "MCP Tools",
      message: `🎭 ${tools.length} tool${tools.length > 1 ? "s" : ""} handled by cursor-agent: ${toolList}`,
      variant: "info",
    });
  }

  async showErrorSummary(errors: string[]): Promise<void> {
    if (errors.length === 0) return;

    const errorList = errors.length <= 2
      ? errors.join("; ")
      : `${errors.slice(0, 2).join("; ")} +${errors.length - 2} more`;

    await this.show({
      title: "MCP Errors",
      message: `⚠️ ${errors.length} MCP tool${errors.length > 1 ? "s" : ""} failed: ${errorList}`,
      variant: "warning",
    });
  }
}

export const toastService = new ToastService();