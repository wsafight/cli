# OpenTUI 模块测试计划

## 已有覆盖

| 文件 | 范围 |
|------|------|
| `tests/unit.opentui-helpers.test.ts` | `helpers.ts` 全部纯逻辑导出（14 函数） |
| `tests/unit.opentui-state.test.ts` | `state.ts` 纯逻辑导出（clampIndexes / resetForClient / startProviderInput） |
| `tests/unit.opentui-keys-nav.test.ts` | `keys.ts` K01–K07 前半 + K13（launcher / providers / provider-detail / option-picker） |
| `tests/unit.opentui-keys-input.test.ts` | `keys.ts` K07–K12（provider-add-type / provider-input / agents / agent-detail / agent-new） |

测试 fixture：`tests/_helpers/opentui.ts`（key/charKey/opt/provider/clientData/appState/noopRenderer/captureRunAsync）。

## 测试策略

- **纯逻辑函数**（helpers）：直接调，断言输入输出，无 mock。
- **handler**：mock 掉 `../src/ui/opentui/render` 的 `redraw`（no-op），
  注入 `R = {}` 与捕获式 `runAsync`（只记录 fn 不执行，避免触发真 IO）。
  `finish` 用捕获回调验证 launch/exit 结果。
  —— 测的是 handler 的**状态合约**（导航/clamp/toggle/委托），不是渲染实现。
  重构内部渲染时这些断言不动 = 好测试。

## 场景编号

### helpers（`tests/unit.opentui-helpers.test.ts`）

| ID | 函数 | 场景 | 断言 |
|----|------|------|------|
| TP-OTUI-01 | buildOptionRows | flag/group/provider 行构造 + model group 去重 + 中英标题 | 行种类顺序、标题语言 |
| TP-OTUI-02 | getGroupSelection | 命中/未命中/不存在 group | 返回成员或 undefined |
| TP-OTUI-03 | selectedArgs | 收集 args/envVars/ids；顺序按 launchOptions；无 enabled 空 | 数组合并、id 顺序 |
| TP-OTUI-04 | cycleGroupSelection | 前进/末尾取消/无选中选首个/不存在 no-op/外组不受影响 | enabled 集合 |
| TP-OTUI-05 | keyChar | 单字符/ctrl/meta/option/多字符/控制字符兜底 | 返回字符或空串 |
| TP-OTUI-06 | isPlain | 无修饰/ctrl/meta/option/shift | 布尔 |
| TP-OTUI-07 | maskSecret | 空/≤8/>8/长串掩码上限 20 | 掩码串 |
| TP-OTUI-08 | getSelectedProvider | 命中/未命中/undefined | provider 或 undefined |
| TP-OTUI-09 | detailActions | 默认/已默认/subscription/非 builtin/末尾 back | action 序列 |
| TP-OTUI-10 | actionLabel | 5 个 action × 中英 | 标签串 |
| TP-OTUI-11 | fmtAge | s/m/h/d 边界 + Math.floor | 格式化串 |
| TP-OTUI-12 | statusColor | 5 状态 + 未知 fallback | THEME 色 |
| TP-OTUI-13 | statusMarker | 已知 + closed/未知 | marker 字符 |
| TP-OTUI-14 | appendInput | config 屏追加 + 重置 idle + 空 char no-op | apiKeyValue/Status |
| TP-OTUI-15 | inputBackspace | config 删末尾 + 空 | apiKeyValue |
| TP-OTUI-16 | appendInput/backspace | agent-new 按 agentField 路由 | agentModel/Name |
| TP-OTUI-17 | appendInput/backspace | agent-detail | agentDetailInput |
| TP-OTUI-18 | appendInput/backspace | provider-input 5 个 mode；add-ctx 仅数字 | addKey/Url/Model/Ctx |

### state（`tests/unit.opentui-state.test.ts`）

| ID | 函数 | 场景 | 断言 |
|----|------|------|------|
| TP-OTUI-S01 | clampIndexes | 范围内/越界/负值/无 client no-op/zh | idx clamp |
| TP-OTUI-S02 | resetForClient | options→tabs/tabs 不变/projects 不变/idx 归零 | focus + idx |
| TP-OTUI-S03 | startProviderInput | 通用切屏+清 addKey/add-key 清全部+填默认模型/rekey 保留其它/其它 mode 保留/addType 无默认 | screen/mode/字段 |

### keys（`tests/unit.opentui-keys.test.ts`）

| ID | handler | 场景 | 断言 |
|----|---------|------|------|
| TP-OTUI-K01 | handleLauncherKey | q/escape→exit；a/p/s 委托；ctrl+a 不触发；c→config 清空；l→language | finish / runAsync / screen |
| TP-OTUI-K02 | handleLauncherKey | 数字键 1..N；超范围 no-op；tab 正向 wrap；shift+tab 反向 | clientIdx |
| TP-OTUI-K03 | handleLauncherKey | down/up 焦点切换；left/right tab 循环 + projects↔options | focus + idx |
| TP-OTUI-K04 | handleLauncherKey | space 在 flag toggle；space 在 group cycle；return 在 provider 委托；return 非 options→launch | enabled / finish launch |
| TP-OTUI-K05 | handleProvidersKey | up/down wrap；left/right tab；return 各行（绑定/新增/扫描/返回）；d/e 进 detail | providerRowIdx / screen / 委托 |
| TP-OTUI-K06 | handleProviderDetailKey | 无 provider 回退；up/down wrap；back/default/delete/rekey/relogin（relogin→finish provider-login） | screen / 委托 / finish |
| TP-OTUI-K07 | handleProviderAddTypeKey | up/down wrap；subscription→finish provider-login(claude/codex)；普通类型 startProviderInput | addType / screen / finish |
| TP-OTUI-K08 | handleProviderInputKey | add-model 菜单 up/down/return | 委托 + addModel |
| TP-OTUI-K09 | handleProviderInputKey | 文本追加；backspace；add-key 流转（custom→url / 普通→model / 空不流转）；add-url→model；add-model 空直委托；add-ctx 委托；rekey 委托/无 provider no-op | mode / 委托 |
| TP-OTUI-K10 | handleAgentsKey | up/down wrap；空 sessions 不越界；r 委托；n 重置字段；return/o 委托；空 return no-op；p 委托；d/x 委托 | agentIdx / screen / 委托 |
| TP-OTUI-K11 | handleAgentDetailKey | 无 sid 委托；ctrl+c 非发送→列表 / 发送→cancelling；ctrl+y/n 无 pending no-op / 有 pending 委托；escape 委托；q input 非空作输入；r 委托；backspace；return 空 no-op / 有 prompt→sending / sending 不重发；字符追加 | status / 委托 / input |
| TP-OTUI-K12 | handleAgentNewKey | tab/down 正向切字段；up 反向；space/left/right 切 backend；非 backend 字段不切；backspace；字符追加；return 委托 startSession | agentField / agentBackend / 委托 |
| TP-OTUI-K13 | handleOptionPickerKey | 无 group/无 client 回退；escape/q 回 launcher；up/down wrap(totalRows=groupOptions+1)；return idx=0 清空 / idx>0 选中；space 等效 return；外组选项不受影响 | screen / optionPickerIdx / enabled |

## 运行方式

```bash
cd packages/cli
bun test tests/unit.opentui-helpers.test.ts
bun test tests/unit.opentui-state.test.ts
bun test tests/unit.opentui-keys-nav.test.ts
bun test tests/unit.opentui-keys-input.test.ts
# 全部
bun test:unit
```

## 待补（需集成环境 / 手动走查）

- `render.ts`：依赖真 renderer，靠手动 PTY 走查各屏渲染（`bun dist/index.js` + 40x120 终端）。
- `actions.ts`：provider/agent 副作用，需隔离 TAKO_HOME + mock Bun.spawn，留二期集成测试。
- `state.loadLauncherData` 链路：需 mock 5+ 内部模块，按测试纪律不强测。
- `index.ts` 主循环：依赖 PTY + 真 renderer，靠 `tests/integration.*` 或手动走查。
