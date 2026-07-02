# OpenTUI 模块设计

`src/ui/opentui/` —— 用 `@opentui/core` 实现的交互式 TUI，替代旧 Ink 实现。
入口 `startOpenTuiApp()` 由 `src/ui/index.ts` 在交互式（TTY）环境下调用，
返回 `LauncherResult`（launch / agent / stats / config / language / providers / exit），
由上层 `src/index.ts` 派发到真正的启动/打开逻辑。

## 为什么换掉 Ink

Ink（React for CLI）依赖 react + ink + @inkjs/ui，体积大、与 Bun 的 React JSX 运行时
耦合深。OpenTUI 是原生 Zig 实现的终端渲染层，单依赖 `@opentui/core`，渲染更顺、
色彩更准（RGB 直接着色），且去掉 React 运行时后 bundle 更小。

## 源文件

| 文件 | 职责 | 纯逻辑? |
|------|------|---------|
| `index.ts` | 主入口：建 renderer、绑 keypress、循环 redraw、finish | ❌ 副作用 |
| `render.ts` | `redraw(renderer, state)`：按 AppState 画 11 个屏 | ❌ 副作用 |
| `terminal.ts` | raw mode 管理、同步读键（用于确认/暂停提示） | ❌ 副作用 |
| `keys.ts` | 8 个屏的 keypress handler，纯状态迁移 + runAsync 委托 | ⚠️ 部分（见下） |
| `actions.ts` | 异步副作用：provider/agent 操作、auth spawn、数据刷新 | ❌ 副作用 |
| `state.ts` | 初始化/加载/clamp/reset/startProviderInput | ⚠️ 部分 |
| `helpers.ts` | 纯工具：选项行构造、选中态、key 解析、掩码、状态色/标记、输入编辑 | ✅ 全纯 |
| `theme.ts` | 常量：调色板、logo、ADD_TYPES、LANGUAGES、MIN_HEIGHT | ✅ 全纯 |
| `types.ts` | AppState / Screen / OptionRow / DetailAction / LauncherResult 类型 | — |

## 核心数据

- **AppState**（`types.ts`）：单一大状态对象，含 `screen`（11 种屏 + option-picker）、
  `clients[]`、焦点区（tabs/projects/options）、`optionPickerGroup`/`optionPickerIdx`
  （group 单选子弹窗态）、`scrollOffset`/`scrollScreen`（长列表滚动）、provider 编辑临时态、
  agent 编辑临时态、stats 缓存。
- **ClientData**：每个客户端的 projects / providers / activeProvider / launchOptions / enabled。
- **OptionRow**：`flag`（独立开关）/ `group`（互斥单选，如 model）/ `provider`（入口行）。
  group 行选中不再原地 cycle，而是弹出 option-picker 子屏（含 group 成员 + 一个「无」选项）。
- **LauncherResult**：TUI 退出时交给上层的指令——`launch`（带 args/envVars）、
  各 screen 跳转、`provider-login`（subscription 登录交由上层 spawn）、`exit`。

## 状态流

1. `createInitialState()` → `loadLauncherData()` 拉取 clients + 最近项目 + 绑定 provider +
   上次选中选项 → 合并默认态。
2. 主循环：`onKey` 按 `state.screen` 分发到对应 `handleXxxKey`。
3. handler 做纯状态迁移（导航/clamp/toggle），需要 IO 时调 `runAsync(fn)`：
   `runAsync` 在 `index.ts` 里设 `busy=true` → 执行 fn → `busy=false` + redraw，
   避免并发与重入。
4. 退出：handler 调 `finish(result)` → 解绑 keypress → `renderer.destroy()` → resolve。

## 输入编辑（`helpers.appendInput` / `inputBackspace`）

按 `state.screen` + `state.providerInputMode` / `state.agentField` 路由到对应字段：
- `config` → apiKeyValue
- `agent-new` → agentModel / agentName（按 agentField）
- `agent-detail` → agentDetailInput
- `provider-input` → addKey / addUrl / addModel / addCtx（add-ctx 仅接受数字）

## 不在单测范围（需集成环境）

`render.ts`（依赖真 renderer 上下文）、`index.ts`（依赖 PTY + 真 renderer）、
`actions.ts`（spawn 子进程 / 落盘）、`state.loadLauncherData` 链路（依赖 getAllClients、
project-history、providers 真实模块，隔离需 mock 5+ 内部函数，按测试纪律不强测）。
这些靠手动 PTY 走查 + 集成测试覆盖。

## 依赖

- `@opentui/core`（renderer + KeyEvent）
- `../../clients`、`../../providers`、`../../agent`、`../../project-history`、`../../i18n`、`../../analytics`
