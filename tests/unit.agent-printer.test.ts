import { describe, it, expect } from "bun:test";
import { extractShellCommand, summarizeToolResult, describeApproval, truncate, toolResultFailed, extractStderr, hasErrorFrame } from "../src/agent/printer";
import type { NormalizedFrame } from "../src/agent/types";

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

  // 失败日志查看相关纯函数
  describe("error helpers", () => {
    // TP-AGENT-09
    it("toolResultFailed detects non-zero exit / error / deny", () => {
      expect(toolResultFailed({ exit_code: 1 })).toBe(true);
      expect(toolResultFailed({ exitCode: 127 })).toBe(true);
      expect(toolResultFailed({ exit_code: 0 })).toBe(false);
      expect(toolResultFailed({ is_error: true })).toBe(true);
      expect(toolResultFailed({ error: "boom" })).toBe(true);
      expect(toolResultFailed({ approval: "deny" })).toBe(true);
      expect(toolResultFailed("plain")).toBe(false);
      expect(toolResultFailed(null)).toBe(false);
    });

    // TP-AGENT-10: stderr 不截断
    it("extractStderr returns full stderr untruncated", () => {
      const long = "line1\n" + "x".repeat(500);
      expect(extractStderr({ stderr: long })).toBe(long);
      expect(extractStderr({ error: "err msg" })).toBe("err msg");
      expect(extractStderr({ stdout: "ok" })).toBeNull();
    });

    // TP-AGENT-11: hasErrorFrame
    it("hasErrorFrame detects error frame and failed tool_result", () => {
      const errFrames: NormalizedFrame[] = [
        { ts: 1, kind: "text_delta", text: "hi" },
        { ts: 2, kind: "error", message: "upstream 500", raw: { code: 500 } },
      ];
      expect(hasErrorFrame(errFrames)).toBe(true);

      const toolFail: NormalizedFrame[] = [
        { ts: 1, kind: "tool_result", output: { exit_code: 2, stderr: "nope" } },
      ];
      expect(hasErrorFrame(toolFail)).toBe(true);

      const clean: NormalizedFrame[] = [
        { ts: 1, kind: "tool_result", output: { exit_code: 0, stdout: "done" } },
        { ts: 2, kind: "turn_completed" },
      ];
      expect(hasErrorFrame(clean)).toBe(false);
    });
  });
});
