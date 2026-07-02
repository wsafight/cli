/**
 * UI 模块入口 — OpenTUI 单实例路由
 */

import { launchClientUnified } from "../launcher";
import { getClient } from "../clients/base";
import { getLocale, t } from "../i18n";
import { track } from "../analytics";
import { log } from "../logger";
import { migrateIfNeeded, fixupProviders, getProviders } from "../providers";
import { selectProviderForClient, runProviderDetection } from "./providers";
import { startOpenTuiApp } from "./opentui";
import { runSubscriptionAuthCommand, syncSubscriptionProviderFromLocalAuth } from "./opentui/actions";
import { fetchAndMaybeShowAnnouncement } from "../announcements";
import { refreshAllTakoCatalogs } from "../models";

/**
 * 主入口
 */
export async function main(): Promise<void> {
  await migrateIfNeeded();
  await fixupProviders();
  await runProviderDetection();

  // Par 模型目录刷新：冷桶（首次启动）阻塞到拉完，热桶（>1h 过期）后台刷新。
  // 加 3s 超时保护，网络抖时也不挂死 launcher。
  await Promise.race([
    refreshAllTakoCatalogs(await getProviders()),
    new Promise<void>((r) => setTimeout(r, 3000)),
  ]);

  // 启动公告：从默认 par 拉一次 popup，若有未看过的就先弹。
  // 任何失败（无 provider / 网络 / 解析）都静默跳过，不影响 launcher。
  await fetchAndMaybeShowAnnouncement();

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

    const client = getClient(result.clientId);
    if (!client) continue;

    track("menu_action", { action: "launch", client_id: result.clientId });

    const providerContext = await selectProviderForClient(result.clientId);
    if (!providerContext) {
      log.warn(t("cli.noProvider") || "未配置可用的服务商");
      continue;
    }

    const isWindows = process.platform === "win32";
    // Windows 面板路径：走 handoff 让顶层 shell 启动客户端（键盘才正常），
    // 客户端退出后 handoff 会重开 tako 回到菜单。仅当 wrapper 提供了 handoff
    // 文件时启用；否则退化到 Bun 直接 spawn（launcher 内部处理）。
    const useWindowsHandoff =
      isWindows && !!process.env.TAKO_WINDOWS_HANDOFF_FILE;

    const launchResult = await launchClientUnified(client, {
      projectPath: result.projectPath,
      args: result.args,
      envVars: result.envVars,
      selectedOptionIds: result.selectedOptionIds,
      providerContext,
      relaunchTakoOnWindows: useWindowsHandoff,
    });

    if (!launchResult.success) {
      log.error(launchResult.error || t("cli.launchFailed"));
      // handoff 写入失败时不退出，回到菜单循环
    } else if (useWindowsHandoff) {
      // handoff 已写入：Bun 必须完全退出，外层 wrapper 才会执行 handoff
      // （启动客户端 → 客户端退出后重开 tako）。不 return 而是显式退出，
      // 避免后台 stdin / analytics 句柄让 Bun 存活阻塞 wrapper。
      process.exit(0);
    }
    // 循环回 OpenTUI 主菜单（非 Windows / 无 handoff 路径）
  }
}
