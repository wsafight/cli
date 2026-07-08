# updater 模块设计

## 概述

`updater.ts` 负责 Tako CLI 自身的版本检查、自动更新、旧 wrapper 迁移和本地安装补齐。
启动入口在 `app.ts`，历史行为是在交互式入口和快捷启动入口前调用 `checkAndUpdate()`。

当前策略：**启动时自动更新临时禁用**。启动流程直接进入目标工具或面板，不再因为版本检查、
下载更新、迁移重启而阻塞用户使用。底层更新函数仍保留，便于后续恢复自动更新或接入手动更新
命令。

## 源文件

- `src/app.ts` - CLI 启动分发，决定是否在启动入口调用自动更新
- `src/updater.ts` - 版本检查、更新命令、wrapper 迁移和安装逻辑
- `src/windows-wrapper.ts` - Windows wrapper 生成，更新后会被重写
- `src/bun-progress.ts` - 解析 `bun add/update` 输出

## 启动时自动更新开关

`shouldRunStartupUpdate(isDev)` 是启动入口的单一判断点：

- dev 模式永远不更新
- 当前临时禁用期内，非 dev 模式也返回 false
- `runCli` 的快捷启动和交互式入口只通过这个函数决定是否调用 `checkAndUpdate()`

这样可以保证临时禁用是显式、可测试、可恢复的，而不是散落删除多个调用点。

## 保留能力

虽然启动时不再自动调用，以下能力仍保留：

- `checkForUpdates()` 查询 npm registry 最新版本
- `buildCliUpdateCommand()` 生成本地 `bun update tako-cli --latest`
- `buildCliInstallCommand()` 生成迁移安装命令
- `checkAndUpdate()` 的自动更新实现
- wrapper 迁移和重写逻辑

## 依赖

- `region.ts` - npm registry 选择
- `config.ts` - Tako 本地安装路径
- `logger.ts` - spinner 和日志
- `analytics` - 更新成功埋点
- `error-format.ts` - 安装/更新失败摘要

## 已有测试

- `tests/unit.update-logic.test.ts` - 更新命令和启动自动更新开关
- `tests/pre-release.test.ts` - 发布前路径和更新命令基础检查
