/**
 * UI 模块入口 — OpenTUI 单实例路由
 */

import { getLocale } from "../i18n";
import { log } from "../logger";
import { startOpenTuiApp } from "./opentui";
import { runSubscriptionAuthCommand, syncSubscriptionProviderFromLocalAuth } from "./opentui/actions";
import { runPreLaunchSetup, handleLaunchResult } from "./shared/launch";

/**
 * 主入口
 */
export async function main(): Promise<void> {
  await runPreLaunchSetup();

  // 主循环：OpenTUI 内部处理普通页面；launch/provider-login/exit 返回到这里处理终端交接。
  let nextOpenTui: { screen?: "launcher" | "providers"; message?: string } | undefined;
  while (true) {
    const result = await startOpenTuiApp(nextOpenTui);
    nextOpenTui = undefined;

    if (!result) break; // exit
    if (result.type === "exit") break;

    if (result.type === "provider-login") {
      const zh = getLocale() === "zh";
      const label = result.tool === "claude" ? "Claude" : "Codex";
      log.info(zh
        ? `正在打开 ${label} 官方登录，请在浏览器中完成授权...`
        : `Opening ${label} login; complete authorization in the browser...`);

      const auth = await runSubscriptionAuthCommand(result.tool);
      const sync = await syncSubscriptionProviderFromLocalAuth(result.tool, zh);
      let message = sync.message;
      if (!sync.ok && auth.error) {
        message = auth.error;
      } else if (!sync.ok && !auth.ok && auth.exitCode != null) {
        message = zh
          ? `${label} 登录未完成（退出码 ${auth.exitCode}）`
          : `${label} login did not complete (exit ${auth.exitCode})`;
      }

      if (sync.ok) log.success(sync.message);
      else log.warn(message);
      nextOpenTui = { screen: "providers", message: sync.ok ? sync.message : `! ${message}` };
      continue;
    }

    // launch — OpenTUI 已关闭，处理启动
    if (result.type !== "launch") continue;

    const shouldExit = await handleLaunchResult(result);
    if (shouldExit) {
      // handoff 已写入：显式退出而非 return，避免后台 stdin / analytics
      // 句柄让 Bun 存活阻塞 wrapper。
      process.exit(0);
    }
    // 循环回 OpenTUI 主菜单（非 Windows / 无 handoff 路径）
  }
}
