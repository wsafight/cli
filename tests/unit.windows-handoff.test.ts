import { describe, expect, it } from "bun:test";
import { buildWindowsHandoffScript } from "../src/windows-handoff";

describe("Windows handoff script", () => {
  it("quotes paths, args, cwd, and env values for PowerShell", () => {
    const script = buildWindowsHandoffScript({
      command: [
        "C:\\Tools\\Claude Code\\claude.exe",
        "--model",
        "claude-opus-4-7[1m]",
        "Bob's repo",
      ],
      cwd: "E:\\work\\Bob's app",
      env: {
        ANTHROPIC_AUTH_TOKEN: "sk-ant-'quoted'",
        INVALID_KEY_NAME: "skip",
        "BAD-KEY": "skip",
      },
    });

    expect(script).toContain("& 'C:\\Tools\\Claude Code\\claude.exe' @argv");
    expect(script).toContain("Set-Location -LiteralPath 'E:\\work\\Bob''s app'");
    expect(script).toContain("@('--model', 'claude-opus-4-7[1m]', 'Bob''s repo')");
    expect(script).toContain("$env:ANTHROPIC_AUTH_TOKEN = 'sk-ant-''quoted'''");
    expect(script).toContain("$env:INVALID_KEY_NAME = 'skip'");
    expect(script).not.toContain("BAD-KEY");
    // 清屏用 [char]27 而非 `e，兼容 PowerShell 5.1
    expect(script).toContain("$esc = [char]27");
    expect(script).not.toContain("`e[2J");
    // finally 保证含 token 的临时脚本被删除
    expect(script).toContain("} finally {");
    expect(script).toContain("Remove-Item -LiteralPath $scriptPath -Force");
  });

  it("omits the env block when no env is provided (inherited from parent)", () => {
    const script = buildWindowsHandoffScript({
      command: ["C:\\claude.exe"],
      cwd: "C:\\repo",
    });

    expect(script).not.toContain("$env:");
    expect(script).toContain("& 'C:\\claude.exe' @argv");
  });

  it("supports commands without extra args", () => {
    const script = buildWindowsHandoffScript({
      command: ["C:\\claude.exe"],
      cwd: "C:\\repo",
      env: {},
    });

    expect(script).toContain("$argv = @()");
  });
});
