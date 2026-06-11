import { describe, it, expect } from "bun:test";
import { extractShellCommand, summarizeToolResult, describeApproval, truncate } from "../src/agent/printer";

describe("agent/printer", () => {
  describe("extractShellCommand", () => {
    it("extracts command field", () => {
      expect(extractShellCommand({ command: "git status" })).toBe("git status");
    });
    it("unwraps shell wrapper", () => {
      expect(extractShellCommand({ command: `/bin/bash -c "npm test"` })).toBe("npm test");
    });
    it("returns null for non-object", () => {
      expect(extractShellCommand(null)).toBeNull();
      expect(extractShellCommand("string")).toBeNull();
    });
    it("returns null if no command field", () => {
      expect(extractShellCommand({ foo: "bar" })).toBeNull();
    });
  });

  describe("summarizeToolResult", () => {
    it("returns null for falsy", () => {
      expect(summarizeToolResult(null)).toBeNull();
      expect(summarizeToolResult(undefined)).toBeNull();
    });
    it("truncates strings", () => {
      expect(summarizeToolResult("short")).toBe("short");
    });
    it("summarizes stdout + exitCode", () => {
      const result = summarizeToolResult({ stdout: "hello world\nline2", exit_code: 0 });
      expect(result).toContain("hello world");
      expect(result).toContain("exit 0");
    });
    it("summarizes approval audit", () => {
      const result = summarizeToolResult({ approval: "allowed", reason: "safe" });
      expect(result).toContain("[allowed]");
      expect(result).toContain("safe");
    });
  });

  describe("describeApproval", () => {
    it("describes exec approval", () => {
      const result = describeApproval("exec", { command: "npm install" });
      expect(result).toContain("command=npm install");
    });
    it("describes patch approval with paths", () => {
      const result = describeApproval("patch", { changes: [{ path: "src/main.ts" }] });
      expect(result).toContain("paths=src/main.ts");
    });
    it("handles unknown types gracefully", () => {
      const result = describeApproval("other", { foo: "bar" });
      expect(result).toContain("foo");
    });
  });

  describe("truncate", () => {
    it("returns short strings unchanged", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });
    it("truncates long strings with count", () => {
      const result = truncate("a".repeat(20), 10);
      expect(result).toHaveLength(10 + "…(+10)".length);
      expect(result).toContain("…(+10)");
    });
  });
});
