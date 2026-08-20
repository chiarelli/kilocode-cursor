import { describe, it, expect, vi, beforeEach } from "bun:test";
import { ToastService } from "../../src/services/toast-service.js";

describe("ToastService", () => {
  let service: ToastService;
  let mockClient: any;

  beforeEach(() => {
    service = new ToastService();
    mockClient = {
      tui: {
        showToast: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  describe("show", () => {
    it("should call client.tui.showToast with correct format", async () => {
      service.setClient(mockClient);

      await service.show({
        title: "Test Title",
        message: "Test message",
        variant: "info",
      });

      expect(mockClient.tui.showToast).toHaveBeenCalledWith({
        body: {
          title: "Test Title",
          message: "Test message",
          variant: "info",
        },
      });
    });

    it("should not throw when client is not set", async () => {
      // Should resolve without error
      await service.show({ message: "Test", variant: "info" });
      // If we get here, no error was thrown
      expect(true).toBe(true);
    });

    it("should not throw when showToast fails", async () => {
      mockClient.tui.showToast.mockRejectedValue(new Error("Toast failed"));
      service.setClient(mockClient);

      // Should resolve without error despite showToast rejection
      await service.show({ message: "Test", variant: "info" });
      // If we get here, no error was thrown
      expect(true).toBe(true);
    });
  });

  describe("showPassThroughSummary", () => {
    it("should format single tool correctly", async () => {
      service.setClient(mockClient);

      await service.showPassThroughSummary(["browser_navigate"]);

      expect(mockClient.tui.showToast).toHaveBeenCalledWith({
        body: {
          title: "MCP Tools",
          message: "🎭 1 tool handled by cursor-agent: browser_navigate",
          variant: "info",
        },
      });
    });

    it("should format multiple tools correctly", async () => {
      service.setClient(mockClient);

      await service.showPassThroughSummary(["browser_navigate", "browser_click"]);

      expect(mockClient.tui.showToast).toHaveBeenCalledWith({
        body: {
          title: "MCP Tools",
          message: "🎭 2 tools handled by cursor-agent: browser_navigate, browser_click",
          variant: "info",
        },
      });
    });

    it("should truncate at 3 tools with count", async () => {
      service.setClient(mockClient);

      await service.showPassThroughSummary([
        "browser_navigate",
        "browser_click",
        "browser_screenshot",
        "browser_type",
        "browser_scroll",
      ]);

      expect(mockClient.tui.showToast).toHaveBeenCalledWith({
        body: {
          title: "MCP Tools",
          message: "🎭 5 tools handled by cursor-agent: browser_navigate, browser_click, browser_screenshot +2 more",
          variant: "info",
        },
      });
    });

    it("should not show toast for empty tools", async () => {
      service.setClient(mockClient);

      await service.showPassThroughSummary([]);

      expect(mockClient.tui.showToast).not.toHaveBeenCalled();
    });
  });

  describe("showErrorSummary", () => {
    it("should format single error correctly", async () => {
      service.setClient(mockClient);

      await service.showErrorSummary(["browser_click: Element not found"]);

      expect(mockClient.tui.showToast).toHaveBeenCalledWith({
        body: {
          title: "MCP Errors",
          message: "⚠️ 1 MCP tool failed: browser_click: Element not found",
          variant: "warning",
        },
      });
    });

    it("should truncate at 2 errors with count", async () => {
      service.setClient(mockClient);

      await service.showErrorSummary([
        "browser_click: Element not found",
        "browser_screenshot: Timeout",
        "browser_type: Input not focusable",
      ]);

      expect(mockClient.tui.showToast).toHaveBeenCalledWith({
        body: {
          title: "MCP Errors",
          message: "⚠️ 3 MCP tools failed: browser_click: Element not found; browser_screenshot: Timeout +1 more",
          variant: "warning",
        },
      });
    });

    it("should not show toast for empty errors", async () => {
      service.setClient(mockClient);

      await service.showErrorSummary([]);

      expect(mockClient.tui.showToast).not.toHaveBeenCalled();
    });
  });
});