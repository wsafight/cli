/**
 * 计算 shortcut 命令（--claude / --codex / --gemini）的透传参数。
 *
 * - 移除 shortcut 标志本身
 * - claude-code: --model <id> / --model=<id> 的值自动补 [1m] 后缀
 *   （与交互菜单选模型行为一致；规则见 appendOneMTagIfNeeded）
 * - 其它 client 原样透传
 *
 * 抽成独立模块是为了让单测能直接 import 而不触发 src/index.ts 的 run() 副作用。
 */
import { appendOneMTagIfNeeded } from "./clients/claude-code";

export function buildPassthroughArgs(
  clientId: string,
  allArgs: string[],
  shortcutFlag: string,
): string[] {
  const rest = allArgs.filter((a) => a !== shortcutFlag);
  if (clientId !== "claude-code") return rest;

  const out: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--model" && i + 1 < rest.length) {
      out.push(a, appendOneMTagIfNeeded(rest[i + 1]));
      i++;
      continue;
    }
    if (a.startsWith("--model=")) {
      const id = a.slice("--model=".length);
      out.push(`--model=${appendOneMTagIfNeeded(id)}`);
      continue;
    }
    out.push(a);
  }
  return out;
}
