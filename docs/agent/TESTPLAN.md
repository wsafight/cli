# Agent 模块测试计划

## 已有覆盖

| 文件 | 范围 |
|------|------|
| `tests/unit.agent-policy.test.ts` | policy 纯函数：shell 解包、路径判断、策略评估 |
| `tests/unit.agent-filter.test.ts` | filterSessions 过滤逻辑 |

## 场景编号

### filterSessions（`tests/unit.agent-filter.test.ts`）

| ID | 场景 | 断言 |
|----|------|------|
| TP-AGENT-01 | status 列表过滤 | 仅返回 status 命中项 |
| TP-AGENT-02 | name 前缀过滤 | 仅返回 name 以 prefix 开头项 |
| TP-AGENT-03 | turns 精确匹配 | turns=0 仅返回 0-turn session |
| TP-AGENT-04 | 默认隐藏 closed | 缺省 status 时排除 closed；includeClosed 显示全部 |
| TP-AGENT-05 | 组合过滤 | name-prefix + status + turns 同时生效（交集） |

### 失败日志查看（`tests/unit.agent-printer.test.ts`）

| ID | 场景 | 断言 |
|----|------|------|
| TP-AGENT-09 | toolResultFailed 判定 | 非零 exit / is_error / error / deny → true |
| TP-AGENT-10 | extractStderr 不截断 | 返回完整 stderr，无长度截断 |
| TP-AGENT-11 | hasErrorFrame 判定 | 含 error 帧或失败 tool_result → true；干净 run → false |

### 待补（二期 / 需集成环境）

| ID | 场景 | 说明 |
|----|------|------|
| TP-AGENT-06 | run 一次性任务成功路径 | 需 mock driver 或真后端；验证 text 聚合 + session 保留 |
| TP-AGENT-07 | run --purge 失败回收 | 验证失败时也删 session 目录 |
| TP-AGENT-08 | 批量 close --status idle | 需落盘多 session；验证只关闭匹配项 |

## 运行方式

```bash
cd packages/cli
bun test tests/unit.agent-filter.test.ts
bun test tests/unit.agent-policy.test.ts
```

## 不变量

- INV-AGENT-FILTER-01：filterSessions 是纯函数，相同输入恒等输出，不读盘不改全局
- INV-AGENT-LIST-01：list 默认不展示 closed，避免批量任务后列表噪声
- INV-AGENT-RUN-01：run 默认保留 session；仅 --purge 删除目录（成败均回收）
- INV-AGENT-BATCH-01：close/cancel 带筛选且无 sid 才进批量分支，单 sid 行为不变
