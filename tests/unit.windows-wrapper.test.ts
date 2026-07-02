import { describe, expect, it } from "bun:test";
import { buildWindowsCmdWrapper, buildWindowsPs1Wrapper } from "../src/windows-wrapper";

describe("Windows wrapper scripts", () => {
  it("cmd wrapper provides a handoff file path and runs it after Bun exits", () => {
    const script = buildWindowsCmdWrapper("C:\\tako\\bun\\bun.exe", "C:\\tako\\cli\\dist\\index.js");

    expect(script).toContain('set "TAKO_WINDOWS_HANDOFF_FILE=%TEMP%\\tako-handoff-%RANDOM%-%RANDOM%.ps1"');
    expect(script).toContain('"C:\\tako\\bun\\bun.exe" "C:\\tako\\cli\\dist\\index.js" %*');
    expect(script).toContain('if not exist "%TAKO_WINDOWS_HANDOFF_FILE%" exit /b %TAKO_EXIT_CODE%');
    expect(script).toContain('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TAKO_WINDOWS_HANDOFF_FILE%"');
    expect(script).not.toContain("if exist \"%TAKO_WINDOWS_HANDOFF_FILE%\" (");
  });

  it("ps1 wrapper provides a handoff file path and preserves normal exit code", () => {
    const script = buildWindowsPs1Wrapper("C:\\tako\\bun\\bun.exe", "C:\\tako\\cli\\dist\\index.js");

    expect(script).toContain("$env:TAKO_WINDOWS_HANDOFF_FILE = Join-Path");
    expect(script).toContain('& "C:\\tako\\bun\\bun.exe" "C:\\tako\\cli\\dist\\index.js" @args');
    expect(script).toContain("Test-Path -LiteralPath $env:TAKO_WINDOWS_HANDOFF_FILE");
    expect(script).toContain("exit $code");
  });
});
