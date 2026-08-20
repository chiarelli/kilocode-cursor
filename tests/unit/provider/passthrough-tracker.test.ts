import { describe, it, expect, beforeEach } from "bun:test";
import { PassThroughTracker } from "../../../src/provider/passthrough-tracker.js";

describe("PassThroughTracker", () => {
  let tracker: PassThroughTracker;

  beforeEach(() => {
    tracker = new PassThroughTracker();
  });

  describe("trackTool", () => {
    it("should track unique tool names", () => {
      tracker.trackTool("browser_navigate");
      tracker.trackTool("browser_click");
      tracker.trackTool("browser_navigate"); // duplicate

      const summary = tracker.getSummary();
      expect(summary.tools).toEqual(["browser_navigate", "browser_click"]);
    });

    it("should set hasActivity to true when tools are tracked", () => {
      expect(tracker.getSummary().hasActivity).toBe(false);
      tracker.trackTool("browser_navigate");
      expect(tracker.getSummary().hasActivity).toBe(true);
    });
  });

  describe("trackError", () => {
    it("should aggregate errors with tool names", () => {
      tracker.trackError("browser_click", "Element not found");
      tracker.trackError("browser_screenshot", "Timeout");

      const summary = tracker.getSummary();
      expect(summary.errors).toEqual([
        "browser_click: Element not found",
        "browser_screenshot: Timeout",
      ]);
    });
  });

  describe("reset", () => {
    it("should clear all tracked state", () => {
      tracker.trackTool("browser_navigate");
      tracker.trackError("browser_click", "Error");
      tracker.reset();

      const summary = tracker.getSummary();
      expect(summary.tools).toEqual([]);
      expect(summary.errors).toEqual([]);
      expect(summary.hasActivity).toBe(false);
    });
  });
});