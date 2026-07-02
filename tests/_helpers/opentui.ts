import type { KeyEvent } from "@opentui/core";
import type { ClientConfig, LaunchOption } from "../../src/clients";
import type { Provider } from "../../src/providers/types";
import type { AppState, ClientData, DetailAction, OptionRow } from "../../src/ui/opentui/types";

/**
 * 构造一个最小可用的 KeyEvent mock。
 * OpenTUI 的 KeyEvent 字段：name / ctrl / meta / shift / option / sequence。
 * handler 只读 name / ctrl / meta / option / shift / sequence，所以给空 sequence 即可。
 */
export function key(name: string, opts: Partial<KeyEvent> = {}): KeyEvent {
  return {
    name,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    sequence: "",
    ...opts,
  } as KeyEvent;
}

/** 普通 ASCII 字符键（带单字符 sequence，模拟 keyChar 路径）。 */
export function charKey(ch: string, opts: Partial<KeyEvent> = {}): KeyEvent {
  return key(ch, { sequence: ch, ...opts });
}

/** 一个带 args/envVars/group 的 LaunchOption。 */
export function opt(
  id: string,
  overrides: Partial<LaunchOption> = {},
): LaunchOption {
  return {
    id,
    label: { en: id, zh: id },
    shortLabel: id,
    description: { en: id, zh: id },
    flag: `--${id}`,
    args: [`--${id}`],
    ...overrides,
  };
}

/** 一个最小 Provider。 */
export function provider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: "p1",
    name: "P1",
    type: "tako",
    createdAt: "2026-01-01T00:00:00.000Z",
    builtin: true,
    ...overrides,
  };
}

/** 一个最小 ClientConfig（handler 只读 .id / .setupConfigFiles）。 */
export function clientConfig(id: string): ClientConfig {
  return {
    id,
    name: id,
    binary: id,
    launchOptions: () => [],
  } as unknown as ClientConfig;
}

/** 构造一个 ClientData，默认带一个 flag 选项 + 一个 model group 两选项。 */
export function clientData(
  overrides: Partial<ClientData> = {},
): ClientData {
  const launchOptions: LaunchOption[] = [
    opt("skip-perms", { args: ["--dangerously-skip-permissions"] }),
    opt("model-a", { group: "model", args: ["--model", "a"] }),
    opt("model-b", { group: "model", args: ["--model", "b"] }),
  ];
  return {
    client: clientConfig("claude-code"),
    projects: [{ label: "cwd", hint: "cwd", path: "/tmp" }],
    providers: [provider()],
    activeProvider: provider(),
    launchOptions,
    enabled: new Set<string>(["skip-perms"]),
    ...overrides,
  };
}

/** 一个最小 AppState，screen=launcher，单 client。 */
export function appState(overrides: Partial<AppState> = {}): AppState {
  return {
    screen: "launcher",
    clients: [clientData()],
    clientIdx: 0,
    focus: "tabs",
    projectIdx: 0,
    optionIdx: 0,
    optionPickerGroup: undefined,
    optionPickerIdx: 0,
    scrollOffset: 0,
    scrollScreen: "launcher",
    zh: false,
    busy: false,
    message: "",
    providers: [],
    defaultProviderId: undefined,
    clientBindings: {},
    providerTabIdx: 0,
    providerRowIdx: 0,
    providerDetailIdx: 0,
    providerInputMode: "add-key",
    addType: "tako",
    addKey: "",
    addUrl: "",
    addModel: "",
    addCtx: "",
    statsLoading: false,
    apiKeyValue: "",
    apiKeyStatus: "idle",
    languageIdx: 0,
    agentDefaults: {},
    agentIdx: 0,
    agentDetailFrames: [],
    agentDetailInput: "",
    agentDetailStatus: "idle",
    agentPendingApprovals: [],
    agentBackend: "claude",
    agentModel: "",
    agentName: "",
    agentField: "backend",
    ...overrides,
  } as AppState;
}

/**
 * 捕获式 runAsync：handler 把异步副作用委托给它。
 * 测试不真正执行 fn，只记录被委托了什么，避免触发真 IO（providers / agent manager）。
 */
export interface CapturedRun {
  fn: () => Promise<unknown>;
  label: string;
}

export function captureRunAsync(): {
  runAsync: (fn: () => Promise<void>) => void;
  calls: CapturedRun[];
} {
  const calls: CapturedRun[] = [];
  const runAsync = (fn: () => Promise<void>) => {
    calls.push({ fn, label: "fn" });
  };
  return { runAsync, calls };
}

/** No-op CliRenderer：redraw 会调 renderer.root.getChildren() 清子节点，
 *  以及 renderer.frame/performance 等。给足空实现让 redraw 不抛。 */
export function noopRenderer(): unknown {
  const root = {
    getChildren: () => [],
    addChild: () => {},
    removeChild: () => {},
  };
  return {
    root,
    keyInput: { off: () => {}, on: () => {} },
    destroy: () => {},
    frame: () => {},
    performance: 0,
    width: 120,
    height: 40,
    add: () => {},
    remove: () => {},
  };
}

/** 取 detailActions 在某 action 序列下的所有标签（用于断言顺序）。 */
export function actionLabels(actions: DetailAction[], zh: boolean): string[] {
  // 复用 helpers.actionLabel 的语义即可，测试里直接 import 真函数。
  return actions.map((a) => a);
}

/** 把 OptionRow[] 折成可读字符串列表，便于断言。 */
export function rowKinds(rows: OptionRow[]): string[] {
  return rows.map((r) =>
    r.kind === "flag" ? `flag:${r.opt.id}` : r.kind === "group" ? `group:${r.group}` : `provider`
  );
}
