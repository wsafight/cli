---
name: tako-agent
description: "通过 tako CLI 启动、续接、监控、关闭 Claude Code 与 Codex 的长时 agent session；支持 run 一次性任务、批量管理、失败日志排查。触发词: agent session, 派一个 agent, 开一个子会话, 管理 agent, 看 agent 跑到哪了, 取消那个 agent, 并行跑 agent, 批量跑 agent, agent 失败排查, 一次性任务"
allowed-tools: Bash(tako:*)
---

# tako-agent — 长时 agent session 管理

```bash
tako agent <subcmd> [...]
```

## 快速速查

```bash
# 一次性任务（推荐脚本场景）：start+send+(可选)回收，一条命令
tako agent run <claude|codex> --prompt "..." [--model X] [--name N] [--cwd .] [--json] [--purge]

tako agent start <claude|codex> [--model X] [--name N] [--cwd .] [--approval yolo|external] [--json]
tako agent list [筛选] [--json]         # 默认隐藏 closed；--all 显示全部
tako agent send <sid> "prompt..."       # 阻塞发送一轮
tako agent show  <sid> [--lines N] [--errors-only]   # meta+日志；--errors-only 只看错误并展开详情
tako agent logs  <sid> [--errors] [--json]           # dump 完整日志（不截断），适合 grep/喂 LLM
tako agent attach <sid>                 # 实时 tail 日志流
tako agent cancel <sid> | cancel [筛选] # 中止 turn（带筛选则批量）
tako agent close  <sid> [--purge] | close [筛选] [--purge] [--yes]   # 批量关闭
tako agent purge                        # 清理 closed/dead

# 筛选 flag（用于 list / 批量 close|cancel）
#   --status idle,running  --name-prefix fg-  --backend claude  --model X  --turns 0  --all  --yes

# 外置审批（codex）
tako agent pending <sid>                # 列待审批
tako agent approve <sid> <id> <allow|deny> [--reason "..."] [--rule "<regex>"]
tako agent wait <sid> [--json]          # 阻塞到下一决策点（LLM 友好）

# 策略
tako agent policy <sid> show
tako agent policy <sid> allow-exec <regex>
tako agent policy <sid> deny-exec <regex>

tako agent default <claude|codex> <providerId>
```

## 典型工作流

### 派 agent 去做任务（一次性，推荐）

```bash
# run 一条命令搞定，--json 直接拿结果，无需 grep sid
RESULT=$(tako agent run codex --model gpt-5.5 --name research --json \
  --prompt "扫描 src/ 所有 TODO，按文件分组列出")
echo "$RESULT" | jq -r '.text'        # 取结果文本
echo "$RESULT" | jq -r '.status'      # ok / error
# 默认保留 session 便于查日志；加 --purge 自动回收
```

### 多 turn 续接（需保持 session）

```bash
SID=$(tako agent start claude --model claude-opus-4-7 --name review --json | jq -r '.sid')
tako agent send "$SID" "review src/agent/manager.ts 的并发安全"
tako agent send "$SID" "给一个最小补丁"   # 历史自动保留
```

### 并发多 session（批量管理）

```bash
# 用统一 name 前缀，便于事后批量筛选/清理
for grp in alpha beta gamma; do
  tako agent run codex --name "fg-$grp" --json --prompt "处理 $grp" &
done
wait
tako agent list --name-prefix fg-              # 只看这批
tako agent close --name-prefix fg- --status idle --yes   # 批量收尾
```

### 失败排查

```bash
tako agent list                        # 失败 session 状态列标 ⚠
tako agent show <sid> --errors-only    # 只看错误帧 + 展开上游详细错误/stderr
tako agent logs <sid> --errors --json | jq   # 错误帧原始 NDJSON，喂给 LLM 分析
```

### 外部 LLM 当门卫（wait 模式）

```bash
SID=$(tako agent start codex --approval external --model gpt-5.5 --json | jq -r '.sid')
tako agent send "$SID" "把 README 翻成中文" &
# 循环 wait → approve → wait
EVENT=$(tako agent wait --json "$SID")
# exit 0=approval_required, 2=turn_completed, 3=closed, 1=error
```

## 注意事项

- `<sid>` 支持前缀匹配
- **脚本/批量场景优先用 `run`**（一次性任务，失败有明确退出码）+ `--json`（稳定接口，免 grep）
- send 是阻塞的，用 `&` 或另开 shell 配合 attach
- `run`/`close` 默认**保留 session**，`--purge` 才删目录（便于事后 `show`/`logs` 查失败）
- `list` 默认隐藏 closed，跑过 error 的 session 状态列标 `⚠`
- claude 用 `--resume` 持久化历史，codex 用 `thread/resume`
- `--approval yolo`（默认）不审批；`--approval external` 启用外置审批
- 默认策略已覆盖常见安全场景（auto_allow 只读命令，auto_deny 危险操作）
