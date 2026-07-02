// 注意：install.ps1 的 Create-Command 内联了一份等价的 cmd/ps1 wrapper 逻辑
// （安装期还没有 TS 运行时可用，无法 import 本模块）。改这里的 wrapper 内容时，
// 必须同步改 install.ps1，否则「安装时写的」和「更新时写的」wrapper 会漂移。
export function buildWindowsCmdWrapper(bunPath: string, takoEntry: string): string {
  return [
    "@echo off",
    'set "TAKO_WINDOWS_HANDOFF_FILE=%TEMP%\\tako-handoff-%RANDOM%-%RANDOM%.ps1"',
    'if exist "%TAKO_WINDOWS_HANDOFF_FILE%" del "%TAKO_WINDOWS_HANDOFF_FILE%" >nul 2>nul',
    `"${bunPath}" "${takoEntry}" %*`,
    'set "TAKO_EXIT_CODE=%ERRORLEVEL%"',
    'if not exist "%TAKO_WINDOWS_HANDOFF_FILE%" exit /b %TAKO_EXIT_CODE%',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%TAKO_WINDOWS_HANDOFF_FILE%"',
    "exit /b %ERRORLEVEL%",
    "",
  ].join("\r\n");
}

export function buildWindowsPs1Wrapper(bunPath: string, takoEntry: string): string {
  return [
    '$env:TAKO_WINDOWS_HANDOFF_FILE = Join-Path ([System.IO.Path]::GetTempPath()) ("tako-handoff-{0}-{1}.ps1" -f $PID, [System.Guid]::NewGuid().ToString("N"))',
    "Remove-Item -LiteralPath $env:TAKO_WINDOWS_HANDOFF_FILE -Force -ErrorAction SilentlyContinue",
    `& "${bunPath}" "${takoEntry}" @args`,
    "$code = $LASTEXITCODE",
    "if (Test-Path -LiteralPath $env:TAKO_WINDOWS_HANDOFF_FILE) {",
    "  powershell.exe -NoProfile -ExecutionPolicy Bypass -File $env:TAKO_WINDOWS_HANDOFF_FILE",
    "  exit $LASTEXITCODE",
    "}",
    "exit $code",
    "",
  ].join("\r\n");
}
