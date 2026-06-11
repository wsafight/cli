# Agent 模块设计

`tako agent` —— 把 Claude Code 与 Codex 两种异构 AI 编码后端，统一成可脚本化的
非交互 session 接口。供人、TUI、或外层 LLM 编排（一个任务一个子 agent）使用。

## 源文件

| 文件 | 职责 |
|------|------|
| `cmd.ts` | `tako agent <子命令>` CLI 入口（薄层，解析 flag → 调 manager） |
| `manager.ts` | session 原语：start/send/cancel/close/list/purge + provider 路由 + 过滤 |
| `storage.ts` | 落盘 `~/.tako/agent-sessions/<sid>/`（meta.json + log.ndjson） |
| `types.ts` | SessionMeta / NormalizedFrame / Driver / 共享类型 |
| `drivers/claude.ts` | Claude Code driver：spawn `claude --print --output-format stream-json` |
| `drivers/codex.ts` | Codex driver：spawn `codex app-server`（stdio JSON-RPC） |
| `printer.ts` | NormalizedFrame → stdout（human / json / verbose 三模式） |
| `policy.ts` | external 审批模式下的本地静态策略（auto_allow / auto_deny） |

## 核心链路

1. **start**：解析 backend → 选 provider（注入 env）→ 生成 sid → 落 meta → driver.start
2. **send**：读 meta → 重建 env → driver.send，driver 把上游帧 normalize 成
   NormalizedFrame 追加写 log.ndjson，并通过 `onFrame` 钩子回调 CLI 层
3. **两套上游协议归一**：Claude 的 stream-json 与 Codex 的 app-server JSON-RPC，
   都翻译成同一种 NormalizedFrame，上层只读一种格式

## 命令分组

- **生命周期**：start / run / send / cancel / close / purge / list / show / attach
- **审批**（external 模式）：pending / wait / approve / policy
- **配置**：default / defaults

## run（一次性任务）

`run = start + send（阻塞到 turn_completed）+ 按需回收`。解决「start/send 分离导致
批量脚本失败时留下大量 0-turn idle session」的痛点。

- 默认**保留 session**（便于事后 `show` 查日志）；`--purge` 才 close + 删目录（失败也回收）
- `--json`：输出 `{sid, status, text, error, purged}` 单行，作脚本接口
- send 完成判定：`onFrame` 收 `turn_completed` 聚合 text_delta；`error` 帧记错误

## 失败日志查看

error 帧的 `raw`（上游完整错误/堆栈）由 driver 写入 log.ndjson，但默认在 human 模式折叠，
避免常规输出噪声；查失败时按需展开：

- **`show --errors-only`**：只过滤 error 帧 + 失败 tool_result，并展开 `raw` 详情
- **`logs <sid> [--errors]`**：dump 完整 log.ndjson（不经 tail 截断），`--errors` 只看错误帧，
  `--json` 输出原始 NDJSON 便于管道 grep / 贴给上层 LLM
- **失败 tool_result 高亮**：非零 exit / is_error 的命令结果标 `✗ FAILED`，展示完整 stderr（不截断首行）
- **list 失败标记**：读取层扫每个 session 尾部 ~60 帧，含 error 的状态列标 `⚠`，底部统计错误数

相关纯函数（printer.ts，可单测）：`toolResultFailed` / `extractStderr` / `hasErrorFrame`。

## 过滤与批量

`manager.filterSessions(metas, filter)` 是纯函数（可单测），`listSessionsFiltered`
封装落盘读取。filter 字段：status[] / namePrefix / backend / model / turns / includeClosed。

- **list 默认隐藏 closed**（status 缺省 && !includeClosed 时），`--all` 显示全部
- **批量 close / cancel**：带筛选 flag 且无 sid 时进入批量分支，操作前列目标 + 确认
  （`--yes` 跳过，`--json` 不交互直接执行）
- 单 sid 行为完全向后兼容

## 持久化与并发

- 每 session 一目录：meta.json（临时文件 + rename 原子写）、log.ndjson（append-only）
- list 用 readdir 扫，无 index 文件，避免分裂
- 同一 session 不允许多进程并发 send（manager 的责任，storage 不加锁）

## 已有测试

- `tests/unit.agent-policy.test.ts` — policy 纯函数（unwrapShellCommand / evaluatePolicy 等）
- `tests/unit.agent-filter.test.ts` — filterSessions 过滤逻辑（见 TESTPLAN）

## 未做（二期）

- batch --concurrency manifest.jsonl 并发队列
- run --file 文件输入 + 大文件自动分块
- 外层批处理信号中断的双向清理
