import { describe, it, expect, mock, beforeEach } from "bun:test";

// 把 render 模块的 redraw 整体替换成 no-op，避免触发 OpenTUI 真渲染
// （真渲染会建 BoxRenderable、需要完整 renderer 上下文，单测里不可行）。
// keys.ts 只读 redraw 的副作用（画屏），单测只关心状态迁移，所以 no-op 合理。
// 本文件覆盖 K01–K06（launcher / providers / provider-detail）；
// K07–K12 见 unit.opentui-keys-input.test.ts。
mock.module("../src/ui/opentui/render", () => ({
  redraw: () => {},
}));

import {
  handleLauncherKey,
  handleProvidersKey,
  handleProviderDetailKey,
  handleOptionPickerKey,
} from "../src/ui/opentui/keys";
import { appState, clientData, provider, key, captureRunAsync } from "./_helpers/opentui";
import type { AppState, LauncherResult } from "../src/ui/opentui/types";

// TP-OTUI-KEYS = OpenTUI keys.ts handler 测试。
// 策略：mock 掉 redraw + 捕获式 runAsync，验证状态迁移与异步委托。
// 不触发真 IO（providers/agent manager）和真渲染：runAsync 只记录 fn 不执行。
// finish 用捕获回调，验证 launch/exit 结果。redraw 被 mock，renderer 参数随便给。

beforeEach(() => { mock.clearAllMocks?.(); });
const R = {} as any; // redraw 已 mock，handler 不再碰 renderer

function finishCapture() {
  let captured: LauncherResult | null | undefined = "untouched";
  const finish = (r: LauncherResult | null) => { captured = r; };
  return { finish, get: () => captured };
}

// ─── handleLauncherKey ─────────────────────────────────────────────
describe("TP-OTUI-K01 handleLauncherKey — exit / 跳转", () => {
  it("q → finish exit", () => {
    const s = appState();
    const { finish, get } = finishCapture();
    const { runAsync, calls } = captureRunAsync();
    handleLauncherKey(key("q"), s, R, finish, runAsync);
    expect(get()).toEqual({ type: "exit" });
    expect(calls).toHaveLength(0);
  });

  it("escape → finish exit", () => {
    const s = appState();
    const { finish, get } = finishCapture();
    handleLauncherKey(key("escape"), s, R, finish, captureRunAsync().runAsync);
    expect(get()).toEqual({ type: "exit" });
  });

  it("a → 委托 openAgents（runAsync 被调一次）", () => {
    const s = appState();
    const { runAsync, calls } = captureRunAsync();
    handleLauncherKey(key("a"), s, R, finishCapture().finish, runAsync);
    expect(calls).toHaveLength(1);
    expect(s.screen).toBe("launcher"); // 异步未执行，screen 不变
  });

  it("ctrl+a 不触发 openAgents（isPlain false）", () => {
    const s = appState();
    const { runAsync, calls } = captureRunAsync();
    handleLauncherKey(key("a", { ctrl: true }), s, R, finishCapture().finish, runAsync);
    expect(calls).toHaveLength(0);
  });

  it("p → 委托 openProviders；s → 委托 openStats", () => {
    for (const ch of ["p", "s"] as const) {
      const s = appState();
      const { runAsync, calls } = captureRunAsync();
      handleLauncherKey(key(ch), s, R, finishCapture().finish, runAsync);
      expect(calls).toHaveLength(1);
    }
  });

  it("c → 进 config 屏并清空 apiKey 状态", () => {
    const s = appState({ apiKeyValue: "stale", apiKeyStatus: "error", apiKeyError: "x" });
    handleLauncherKey(key("c"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.screen).toBe("config");
    expect(s.apiKeyValue).toBe("");
    expect(s.apiKeyStatus).toBe("idle");
    expect(s.apiKeyError).toBeUndefined();
  });

  it("l → 进 language 屏", () => {
    const s = appState();
    handleLauncherKey(key("l"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.screen).toBe("language");
  });
});

describe("TP-OTUI-K02 handleLauncherKey — 数字键 / tab 切客户端", () => {
  it("数字键 1..N 直接切到对应客户端", () => {
    const s = appState({ clients: [clientData(), clientData(), clientData()], clientIdx: 2 });
    handleLauncherKey(key("2"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.clientIdx).toBe(1);
    expect(s.focus).toBe("tabs");
    expect(s.projectIdx).toBe(0);
  });

  it("数字键超出范围 no-op", () => {
    const s = appState({ clients: [clientData()], clientIdx: 0 });
    handleLauncherKey(key("9"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.clientIdx).toBe(0);
  });

  it("tab 正向循环到末尾回 0", () => {
    const s = appState({ clients: [clientData(), clientData()], clientIdx: 1 });
    handleLauncherKey(key("tab"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.clientIdx).toBe(0);
  });

  it("shift+tab 反向循环", () => {
    const s = appState({ clients: [clientData(), clientData()], clientIdx: 0 });
    handleLauncherKey(key("tab", { shift: true }), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.clientIdx).toBe(1);
  });
});

describe("TP-OTUI-K03 handleLauncherKey — 焦点与方向键", () => {
  it("down 在 tabs → 焦点进 projects", () => {
    const s = appState({ focus: "tabs" });
    handleLauncherKey(key("down"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.focus).toBe("projects");
  });

  it("down 在 projects 且未到末尾 → projectIdx+1", () => {
    const s = appState({ focus: "projects", projectIdx: 0, clients: [clientData({ projects: [{ label: "a", hint: "a" }, { label: "b", hint: "b" }] })] });
    handleLauncherKey(key("down"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.projectIdx).toBe(1);
  });

  it("down 在 projects 到末尾 → 不越界", () => {
    const s = appState({ focus: "projects", projectIdx: 0, clients: [clientData({ projects: [{ label: "a", hint: "a" }] })] });
    handleLauncherKey(key("down"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.projectIdx).toBe(0);
  });

  it("up 在 projects 顶部 → 焦点回 tabs", () => {
    const s = appState({ focus: "projects", projectIdx: 0 });
    handleLauncherKey(key("up"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.focus).toBe("tabs");
  });

  it("up 在 options 顶部 → 焦点回 tabs", () => {
    const s = appState({ focus: "options", optionIdx: 0 });
    handleLauncherKey(key("up"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.focus).toBe("tabs");
  });

  it("left 在 tabs → clientIdx 反向循环", () => {
    const s = appState({ clients: [clientData(), clientData()], clientIdx: 0, focus: "tabs" });
    handleLauncherKey(key("left"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.clientIdx).toBe(1);
  });

  it("right 在 projects → 焦点进 options", () => {
    const s = appState({ focus: "projects", projectIdx: 0 });
    handleLauncherKey(key("right"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.focus).toBe("options");
  });

  it("left 在 options → 焦点回 projects", () => {
    const s = appState({ focus: "options", optionIdx: 0 });
    handleLauncherKey(key("left"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.focus).toBe("projects");
  });
});

describe("TP-OTUI-K04 handleLauncherKey — space/return on options", () => {
  // clientData 默认 launchOptions: skip-perms(flag), model-a(group), model-b(group)
  // buildOptionRows → [flag:skip-perms, group:model, provider]
  it("space 在 flag 行 → toggle enabled", () => {
    const s = appState({ focus: "options", optionIdx: 0 });
    s.clients[0].enabled = new Set();
    handleLauncherKey(key("space"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.clients[0].enabled.has("skip-perms")).toBe(true);
    handleLauncherKey(key("space"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.clients[0].enabled.has("skip-perms")).toBe(false);
  });

  it("space 在 group 行 → 打开 option-picker 子屏（不再直接 cycle）", () => {
    // 当前选中 model-a → optionPickerIdx 指向它（findIndex+1=1）
    const s = appState({ focus: "options", optionIdx: 1 });
    s.clients[0].enabled = new Set(["model-a"]);
    handleLauncherKey(key("space"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.screen).toBe("option-picker");
    expect(s.optionPickerGroup).toBe("model");
    expect(s.optionPickerIdx).toBe(1); // model-a 在 groupOptions 中 findIndex=0，+1
    // enabled 未变（实际选择发生在 option-picker 确认时）
    expect([...s.clients[0].enabled]).toEqual(["model-a"]);
  });

  it("space 在 group 行且无选中 → optionPickerIdx=0（指向「无」选项）", () => {
    const s = appState({ focus: "options", optionIdx: 1 });
    s.clients[0].enabled = new Set();
    handleLauncherKey(key("space"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.screen).toBe("option-picker");
    expect(s.optionPickerIdx).toBe(0);
  });

  it("return 在 provider 行 → 委托 openProviders", () => {
    const s = appState({ focus: "options", optionIdx: 2 }); // provider 行
    const { runAsync, calls } = captureRunAsync();
    handleLauncherKey(key("return"), s, R, finishCapture().finish, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("return 在非 options 焦点 → finish launch（当前目录）", () => {
    const s = appState({ focus: "tabs", projectIdx: 0 });
    const { finish, get } = finishCapture();
    handleLauncherKey(key("return"), s, R, finish, captureRunAsync().runAsync);
    const r = get() as Extract<LauncherResult, { type: "launch" }>;
    expect(r.type).toBe("launch");
    expect(r.clientId).toBe("claude-code");
    expect(r.projectPath).toBe("/tmp");
  });
});

// ─── handleProvidersKey ────────────────────────────────────────────
describe("TP-OTUI-K05 handleProvidersKey — 导航与绑定", () => {
  // totalRows = compatible.length + 3；compatible 取决于 supportedClients
  const provs = (state: AppState) => {
    state.providers = [provider({ id: "p1", type: "anthropic" }), provider({ id: "p2", type: "anthropic" })];
    state.clients = [clientData({ client: { id: "claude-code", name: "c", binary: "c", launchOptions: () => [] } } as any)];
  };

  it("up/down 在 providerRowIdx 上循环（wrap）", () => {
    const s = appState();
    provs(s);
    const { runAsync } = captureRunAsync();
    // totalRows = 2 compatible + 3 = 5；从 0 down 4 次到 4，再 down wrap 回 0
    for (let i = 0; i < 4; i++) handleProvidersKey(key("down"), s, R, runAsync);
    expect(s.providerRowIdx).toBe(4);
    handleProvidersKey(key("down"), s, R, runAsync);
    expect(s.providerRowIdx).toBe(0);
    handleProvidersKey(key("up"), s, R, runAsync);
    expect(s.providerRowIdx).toBe(4);
  });

  it("left/right 切 providerTabIdx", () => {
    const s = appState();
    provs(s);
    s.clients.push(clientData());
    const { runAsync } = captureRunAsync();
    handleProvidersKey(key("right"), s, R, runAsync);
    expect(s.providerTabIdx).toBe(1);
    handleProvidersKey(key("right"), s, R, runAsync);
    expect(s.providerTabIdx).toBe(0); // wrap
  });

  it("return 在 compatible 行 → 委托 setClientProvider（runAsync 1 次）", () => {
    const s = appState();
    provs(s);
    s.providerRowIdx = 0;
    const { runAsync, calls } = captureRunAsync();
    handleProvidersKey(key("return"), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("return 在「新增」行（idx=compatible.length）→ 进 provider-add-type", () => {
    const s = appState();
    provs(s);
    s.providerRowIdx = 2; // compatible.length
    handleProvidersKey(key("return"), s, R, captureRunAsync().runAsync);
    expect(s.screen).toBe("provider-add-type");
    expect(s.providerRowIdx).toBe(0);
  });

  it("return 在「扫描」行（idx=compatible.length+1）→ 委托 detect", () => {
    const s = appState();
    provs(s);
    s.providerRowIdx = 3;
    const { runAsync, calls } = captureRunAsync();
    handleProvidersKey(key("return"), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("return 在「返回」行（末尾）→ backToLauncher", () => {
    const s = appState();
    provs(s);
    s.providerRowIdx = 4; // compatible.length + 2 = 返回
    handleProvidersKey(key("return"), s, R, captureRunAsync().runAsync);
    expect(s.screen).toBe("launcher");
  });

  it("d/e 在 compatible 行 → 进 provider-detail 并选中", () => {
    const s = appState();
    provs(s);
    s.providerRowIdx = 1;
    handleProvidersKey(key("d"), s, R, captureRunAsync().runAsync);
    expect(s.screen).toBe("provider-detail");
    expect(s.providerSelectedId).toBe("p2");
    expect(s.providerDetailIdx).toBe(0);
  });
});

// ─── handleProviderDetailKey ───────────────────────────────────────
// 新签名：(key, state, renderer, finish, runAsync) —— 第4参是 finish，第5参才是 runAsync
describe("TP-OTUI-K06 handleProviderDetailKey", () => {
  const setup = () => {
    const s = appState();
    s.providers = [provider({ id: "p1", type: "anthropic", builtin: false })];
    s.providerSelectedId = "p1";
    s.defaultProviderId = "other"; // 让 default 出现
    return s;
  };

  it("无 selected provider → 回 providers 屏", () => {
    const s = appState();
    s.providers = [];
    s.providerSelectedId = undefined;
    handleProviderDetailKey(key("return"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.screen).toBe("providers");
  });

  it("up/down 在 actions 上循环 wrap", () => {
    const s = setup();
    // detailActions = [default, rekey, delete, back] → 4 个
    const f = finishCapture();
    handleProviderDetailKey(key("down"), s, R, f.finish, () => {});
    expect(s.providerDetailIdx).toBe(1);
    handleProviderDetailKey(key("down"), s, R, f.finish, () => {}); // 2
    handleProviderDetailKey(key("down"), s, R, f.finish, () => {}); // 3
    handleProviderDetailKey(key("down"), s, R, f.finish, () => {}); // wrap 0
    expect(s.providerDetailIdx).toBe(0);
  });

  it("return 选 back → 回 providers", () => {
    const s = setup();
    const idx = 3; // [default,rekey,delete,back]
    s.providerDetailIdx = idx;
    handleProviderDetailKey(key("return"), s, R, finishCapture().finish, captureRunAsync().runAsync);
    expect(s.screen).toBe("providers");
  });

  it("return 选 default → 委托 setDefaultProvider", () => {
    const s = setup();
    s.providerDetailIdx = 0;
    const { runAsync, calls } = captureRunAsync();
    handleProviderDetailKey(key("return"), s, R, finishCapture().finish, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("return 选 delete → 委托 deleteProvider", () => {
    const s = setup();
    s.providerDetailIdx = 2;
    const { runAsync, calls } = captureRunAsync();
    handleProviderDetailKey(key("return"), s, R, finishCapture().finish, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("return 选 rekey → startProviderInput(rekey)，不触发 runAsync/finish", () => {
    const s = setup();
    s.providerDetailIdx = 1;
    const { runAsync, calls } = captureRunAsync();
    const { finish, get } = finishCapture();
    handleProviderDetailKey(key("return"), s, R, finish, runAsync);
    expect(calls).toHaveLength(0);
    expect(get()).toBe("untouched"); // rekey 不 finish
    expect(s.screen).toBe("provider-input");
    expect(s.providerInputMode).toBe("rekey");
    expect(s.addType).toBe("anthropic");
  });

  it("subscription provider 选 relogin → finish provider-login（不再 runAsync 委托）", () => {
    const s = appState();
    s.providers = [provider({ id: "p1", type: "claude-subscription", builtin: true })];
    s.providerSelectedId = "p1";
    s.defaultProviderId = "p1"; // 去掉 default，actions=[relogin,back]
    s.providerDetailIdx = 0;
    const { finish, get } = finishCapture();
    handleProviderDetailKey(key("return"), s, R, finish, captureRunAsync().runAsync);
    expect(get()).toEqual({ type: "provider-login", tool: "claude" });
  });

  it("codex-subscription relogin → finish provider-login tool=codex", () => {
    const s = appState();
    s.providers = [provider({ id: "p1", type: "codex-subscription", builtin: true })];
    s.providerSelectedId = "p1";
    s.defaultProviderId = "p1";
    s.providerDetailIdx = 0;
    const { finish, get } = finishCapture();
    handleProviderDetailKey(key("return"), s, R, finish, captureRunAsync().runAsync);
    expect(get()).toEqual({ type: "provider-login", tool: "codex" });
  });
});

// ─── handleOptionPickerKey ─────────────────────────────────────────
// 新增屏：group 行 space/return 后弹出的单选选择器。
// 签名 (key, state, renderer)，无 finish/runAsync。totalRows = groupOptions.length + 1（末位是「无」）。
describe("TP-OTUI-K13 handleOptionPickerKey", () => {
  // clientData 默认 launchOptions 含 model-a / model-b（同 group "model"）
  const picker = (idx = 0, enabled: string[] = []) => {
    const s = appState({ screen: "option-picker", optionPickerGroup: "model", optionPickerIdx: idx });
    s.clients[0].enabled = new Set(enabled);
    return s;
  };

  it("无 optionPickerGroup → 回 launcher", () => {
    const s = appState({ screen: "option-picker", optionPickerGroup: undefined });
    handleOptionPickerKey(key("return"), s, R);
    expect(s.screen).toBe("launcher");
  });

  it("无 current client → 回 launcher 不抛", () => {
    const s = appState({ screen: "option-picker", optionPickerGroup: "model", clients: [] });
    expect(() => handleOptionPickerKey(key("return"), s, R)).not.toThrow();
    expect(s.screen).toBe("launcher");
  });

  it("escape / q → 回 launcher（不改 enabled）", () => {
    const s = picker(1, ["model-a"]);
    handleOptionPickerKey(key("escape"), s, R);
    expect(s.screen).toBe("launcher");
    expect([...s.clients[0].enabled]).toEqual(["model-a"]);

    const s2 = picker(1, ["model-a"]);
    handleOptionPickerKey(key("q"), s2, R);
    expect(s2.screen).toBe("launcher");
  });

  it("up/down 在 totalRows(=groupOptions+1) 上循环 wrap", () => {
    // groupOptions = [model-a, model-b]，totalRows = 3
    const s = picker(0);
    handleOptionPickerKey(key("down"), s, R);
    expect(s.optionPickerIdx).toBe(1);
    handleOptionPickerKey(key("down"), s, R);
    expect(s.optionPickerIdx).toBe(2);
    handleOptionPickerKey(key("down"), s, R); // wrap 0
    expect(s.optionPickerIdx).toBe(0);
    handleOptionPickerKey(key("up"), s, R); // wrap 末尾
    expect(s.optionPickerIdx).toBe(2);
  });

  it("return 选 idx=0（「无」）→ 清空 group 内所有 enabled", () => {
    const s = picker(0, ["model-a"]);
    handleOptionPickerKey(key("return"), s, R);
    expect(s.screen).toBe("launcher");
    expect(s.clients[0].enabled.has("model-a")).toBe(false);
    expect(s.clients[0].enabled.has("model-b")).toBe(false);
  });

  it("return 选 idx=1 → 选中 model-a，清掉 model-b", () => {
    const s = picker(1, ["model-b"]);
    handleOptionPickerKey(key("return"), s, R);
    expect([...s.clients[0].enabled]).toEqual(["model-a"]);
  });

  it("return 选 idx=2 → 选中 model-b", () => {
    const s = picker(2, ["model-a"]);
    handleOptionPickerKey(key("return"), s, R);
    expect([...s.clients[0].enabled]).toEqual(["model-b"]);
  });

  it("space 等效 return（都能确认选择）", () => {
    const s = picker(1, []);
    handleOptionPickerKey(key("space"), s, R);
    expect([...s.clients[0].enabled]).toEqual(["model-a"]);
  });

  it("外组选项（skip-perms）不受 group 选择影响", () => {
    const s = picker(1, ["skip-perms", "model-b"]);
    handleOptionPickerKey(key("return"), s, R);
    expect(s.clients[0].enabled.has("skip-perms")).toBe(true);
    expect([...s.clients[0].enabled]).toEqual(["skip-perms", "model-a"]);
  });
});
