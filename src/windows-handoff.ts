export const WINDOWS_HANDOFF_ENV = "TAKO_WINDOWS_HANDOFF_FILE";

function psSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function psArray(values: string[]): string {
  if (values.length === 0) return "@()";
  return `@(${values.map(psSingleQuoted).join(", ")})`;
}

export interface WindowsHandoffScriptOptions {
  command: string[];
  cwd: string;
  /**
   * 需要显式写进脚本的环境变量。
   *
   * 仅当 handoff 脚本由**外层 cmd/ps1 wrapper**执行时才需要 —— 那个 wrapper
   * 进程的环境里没有 client.getEnvVars() 算出来的 token。若 handoff 由 Bun 自己
   * 起 PowerShell 执行（交互式菜单路径），PowerShell 会继承 Bun 进程的环境，
   * 传空对象即可，避免 token 明文落盘。
   */
  env?: Record<string, string | undefined>;
}

/**
 * Build a PowerShell script that runs after the Bun wrapper exits.
 *
 * On Windows, interactive TUIs spawned directly by Bun can render but fail to
 * receive console input. The outer wrapper runs this script after Bun exits so
 * Claude/Codex inherit the terminal from PowerShell/CMD instead of from Bun.
 *
 * 脚本用 try/finally 保证无论子进程如何退出（含 Ctrl+C）都自删，避免含 token
 * 的临时脚本残留在 %TEMP%。清屏用 [char]27 而非 `e（PowerShell 5.1 不支持 `e）。
 */
export function buildWindowsHandoffScript(options: WindowsHandoffScriptOptions): string {
  const [exe, ...args] = options.command;
  if (!exe) throw new Error("handoff command is empty");

  const lines: string[] = [
    "$ErrorActionPreference = 'Stop'",
    "$scriptPath = $PSCommandPath",
  ];

  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (value === undefined) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    lines.push(`$env:${key} = ${psSingleQuoted(String(value))}`);
  }

  lines.push(
    `Set-Location -LiteralPath ${psSingleQuoted(options.cwd)}`,
    // ESC = [char]27，兼容 Windows 自带的 PowerShell 5.1（`e 是 7+ 才支持）
    "$esc = [char]27",
    "try { [Console]::Write(\"$esc[2J$esc[3J$esc[H\") } catch {}",
    `$argv = ${psArray(args)}`,
    "$code = 0",
    "try {",
    `  & ${psSingleQuoted(exe)} @argv`,
    "  $code = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }",
    "} finally {",
    // 无论子进程正常退出 / 抛错 / Ctrl+C，都删掉含 token 的临时脚本
    "  Remove-Item -LiteralPath $scriptPath -Force -ErrorAction SilentlyContinue",
    "}",
    "exit $code",
    "",
  );

  return lines.join("\r\n");
}
