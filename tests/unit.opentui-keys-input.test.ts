import { describe, it, expect, mock, beforeEach } from "bun:test";

// 把 render 模块的 redraw 整体替换成 no-op，避免触发 OpenTUI 真渲染。
// keys.ts 只读 redraw 的副作用（画屏），单测只关心状态迁移，所以 no-op 合理。
// 与 unit.opentui-keys-nav.test.ts 共用同一套策略，本文件覆盖 K07–K12。
mock.module("../src/ui/opentui/render", () => ({
  redraw: () => {},
}));

import {
  handleProviderAddTypeKey,
  handleProviderInputKey,
  handleAgentsKey,
  handleAgentDetailKey,
  handleAgentNewKey,
} from "../src/ui/opentui/keys";
import { ADD_TYPES } from "../src/ui/opentui/theme";
import { getDefaultModel } from "../src/providers/types";
import { appState, provider, key, captureRunAsync } from "./_helpers/opentui";

// TP-OTUI-KEYS-INPUT = OpenTUI keys.ts handler 测试（K07–K12：provider 流转 / agents / agent-detail / agent-new）。
// 策略：mock 掉 redraw + 捕获式 runAsync，验证状态迁移与异步委托。
// runAsync 只记录 fn 不执行，避免触发真 IO。finish 用捕获回调验证结果。

beforeEach(() => { mock.clearAllMocks?.(); });
const R = {} as any; // redraw 已 mock，handler 不再碰 renderer

// finish 捕获：handler 第4参（provider-add-type / provider-detail）会用 finish 返回 provider-login 等。
function finishCapture() {
  let captured: unknown = "untouched";
  const finish = (r: unknown) => { captured = r; };
  return { finish, get: () => captured };
}

// ─── handleProviderAddTypeKey ──────────────────────────────────────
// 新签名：(key, state, renderer, finish) —— 第4参是 finish，无 runAsync
describe("TP-OTUI-K07 handleProviderAddTypeKey", () => {
  it("up/down 在 ADD_TYPES 上循环 wrap", () => {
    const s = appState();
    const noop = () => {};
    handleProviderAddTypeKey(key("down"), s, R, noop);
    expect(s.providerRowIdx).toBe(1);
    // 走到末尾再 down → wrap 0
    for (let i = 0; i < ADD_TYPES.length - 1; i++) handleProviderAddTypeKey(key("down"), s, R, noop);
    expect(s.providerRowIdx).toBe(0);
    handleProviderAddTypeKey(key("up"), s, R, noop);
    expect(s.providerRowIdx).toBe(ADD_TYPES.length - 1);
  });

  it("return 选 claude-subscription → finish provider-login(claude)", () => {
    const s = appState();
    s.providerRowIdx = ADD_TYPES.indexOf("claude-subscription");
    const { finish, get } = finishCapture();
    handleProviderAddTypeKey(key("return"), s, R, finish);
    expect(get()).toEqual({ type: "provider-login", tool: "claude" });
  });

  it("return 选 codex-subscription → finish provider-login(codex)", () => {
    const s = appState();
    s.providerRowIdx = ADD_TYPES.indexOf("codex-subscription");
    const { finish, get } = finishCapture();
    handleProviderAddTypeKey(key("return"), s, R, finish);
    expect(get()).toEqual({ type: "provider-login", tool: "codex" });
  });

  it("return 选普通类型 → startProviderInput(add-key)，addModel 填默认", () => {
    const s = appState();
    s.providerRowIdx = ADD_TYPES.indexOf("anthropic");
    handleProviderAddTypeKey(key("return"), s, R, finishCapture().finish);
    expect(s.screen).toBe("provider-input");
    expect(s.providerInputMode).toBe("add-key");
    expect(s.addType).toBe("anthropic");
    expect(s.addModel).toBe(getDefaultModel("anthropic") || "");
    expect(s.addKey).toBe("");
    expect(s.addUrl).toBe("");
  });
});

// ─── handleProviderInputKey ────────────────────────────────────────
describe("TP-OTUI-K08 handleProviderInputKey — add-model 选择菜单", () => {
  it("add-model 模式有 choices 时 up/down/return 走菜单分支", () => {
    const s = appState();
    s.screen = "provider-input";
    s.providerInputMode = "add-model";
    s.addType = "anthropic";
    const { runAsync, calls } = captureRunAsync();
    handleProviderInputKey(key("down"), s, R, runAsync);
    // 不触发 finish（return 才会）
    expect(calls).toHaveLength(0);
    handleProviderInputKey(key("return"), s, R, runAsync);
    expect(calls).toHaveLength(1); // finishProviderAdd 委托
    expect(s.addModel.length).toBeGreaterThan(0);
  });
});

describe("TP-OTUI-K09 handleProviderInputKey — 文本输入与回车流转", () => {
  it("add-key 模式：字符追加到 addKey；rekey 模式同理", () => {
    const s = appState();
    s.screen = "provider-input";
    s.providerInputMode = "add-key";
    handleProviderInputKey(key("k", { sequence: "k" }), s, R, captureRunAsync().runAsync);
    expect(s.addKey).toBe("k");
  });

  it("backspace 删末尾", () => {
    const s = appState();
    s.screen = "provider-input";
    s.providerInputMode = "add-key";
    s.addKey = "abc";
    handleProviderInputKey(key("backspace"), s, R, captureRunAsync().runAsync);
    expect(s.addKey).toBe("ab");
  });

  it("add-key + 有 key + custom → 流转到 add-url", () => {
    const s = appState();
    s.screen = "provider-input";
    s.providerInputMode = "add-key";
    s.addType = "custom";
    s.addKey = "sk-x";
    handleProviderInputKey(key("return"), s, R, captureRunAsync().runAsync);
    expect(s.providerInputMode).toBe("add-url");
  });

  it("add-key + 有 key + 非 custom → 流转到 add-model", () => {
    const s = appState();
    s.screen = "provider-input";
    s.providerInputMode = "add-key";
    s.addType = "anthropic";
    s.addKey = "sk-x";
    handleProviderInputKey(key("return"), s, R, captureRunAsync().runAsync);
    expect(s.providerInputMode).toBe("add-model");
  });

  it("add-key + 空 key → return 不流转（停在 add-key）", () => {
    const s = appState();
    s.screen = "provider-input";
    s.providerInputMode = "add-key";
    s.addKey = "";
    handleProviderInputKey(key("return"), s, R, captureRunAsync().runAsync);
    expect(s.providerInputMode).toBe("add-key");
  });

  it("add-url → 流转到 add-model", () => {
    const s = appState();
    s.screen = "provider-input";
    s.providerInputMode = "add-url";
    handleProviderInputKey(key("return"), s, R, captureRunAsync().runAsync);
    expect(s.providerInputMode).toBe("add-model");
  });

  it("add-model + 空 model → 直接委托 finishProviderAdd", () => {
    const s = appState();
    s.screen = "provider-input";
    s.providerInputMode = "add-model";
    s.addType = "tako"; // tako 有 model choices？若无 choices 走文本分支
    s.addModel = "  ";
    const { runAsync, calls } = captureRunAsync();
    handleProviderInputKey(key("return"), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("add-ctx → 委托 finishProviderAdd", () => {
    const s = appState();
    s.screen = "provider-input";
    s.providerInputMode = "add-ctx";
    const { runAsync, calls } = captureRunAsync();
    handleProviderInputKey(key("return"), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("rekey + return → 委托 updateProvider（需要 selectedProvider）", () => {
    const s = appState();
    s.screen = "provider-input";
    s.providerInputMode = "rekey";
    s.providers = [provider({ id: "p1" })];
    s.providerSelectedId = "p1";
    s.addKey = "newkey";
    const { runAsync, calls } = captureRunAsync();
    handleProviderInputKey(key("return"), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("rekey + 无 selectedProvider → return no-op（不委托）", () => {
    const s = appState();
    s.screen = "provider-input";
    s.providerInputMode = "rekey";
    s.providerSelectedId = undefined;
    const { runAsync, calls } = captureRunAsync();
    handleProviderInputKey(key("return"), s, R, runAsync);
    expect(calls).toHaveLength(0);
  });
});

// ─── handleAgentsKey ───────────────────────────────────────────────
describe("TP-OTUI-K10 handleAgentsKey", () => {
  const sessions = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ sid: `s${i}`, status: "idle" as const }));

  it("up/down 在 sessions 上循环 wrap", () => {
    const s = appState({ agentSessions: sessions(3) as any, agentIdx: 0 });
    const { runAsync } = captureRunAsync();
    handleAgentsKey(key("down"), s, R, runAsync); // 1
    handleAgentsKey(key("down"), s, R, runAsync); // 2
    handleAgentsKey(key("down"), s, R, runAsync); // wrap 0
    expect(s.agentIdx).toBe(0);
    handleAgentsKey(key("up"), s, R, runAsync); // wrap 末尾
    expect(s.agentIdx).toBe(2);
  });

  it("无 sessions 时 down 不越界（保持 0）", () => {
    const s = appState({ agentSessions: [], agentIdx: 0 });
    handleAgentsKey(key("down"), s, R, captureRunAsync().runAsync);
    expect(s.agentIdx).toBe(0);
  });

  it("r → 委托 openAgents", () => {
    const s = appState();
    const { runAsync, calls } = captureRunAsync();
    handleAgentsKey(key("r"), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("n → 进 agent-new 屏并重置字段", () => {
    const s = appState({ agentModel: "stale", agentName: "stale", agentField: "name" });
    handleAgentsKey(key("n"), s, R, captureRunAsync().runAsync);
    expect(s.screen).toBe("agent-new");
    expect(s.agentBackend).toBe("claude");
    expect(s.agentModel).toBe("");
    expect(s.agentName).toBe("");
    expect(s.agentField).toBe("backend");
  });

  it("return/o 选中 session → 委托 openAgentDetail", () => {
    const s = appState({ agentSessions: sessions(2) as any, agentIdx: 1 });
    const { runAsync, calls } = captureRunAsync();
    handleAgentsKey(key("return"), s, R, runAsync);
    expect(calls).toHaveLength(1);
    // o 同效
    const s2 = appState({ agentSessions: sessions(2) as any, agentIdx: 1 });
    handleAgentsKey(key("o"), s2, R, captureRunAsync().runAsync);
  });

  it("return 在空 sessions → no-op（不委托）", () => {
    const s = appState({ agentSessions: [], agentIdx: 0 });
    const { runAsync, calls } = captureRunAsync();
    handleAgentsKey(key("return"), s, R, runAsync);
    expect(calls).toHaveLength(0);
  });

  it("p → 委托 purgeDead", () => {
    const s = appState();
    const { runAsync, calls } = captureRunAsync();
    handleAgentsKey(key("p"), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("d/x 选中 session → 委托 closeSession（d=close, x=purge）", () => {
    const s = appState({ agentSessions: sessions(1) as any, agentIdx: 0 });
    const { runAsync, calls } = captureRunAsync();
    handleAgentsKey(key("d"), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("d 无 session → no-op", () => {
    const s = appState({ agentSessions: [], agentIdx: 0 });
    const { runAsync, calls } = captureRunAsync();
    handleAgentsKey(key("d"), s, R, runAsync);
    expect(calls).toHaveLength(0);
  });
});

// ─── handleAgentDetailKey ──────────────────────────────────────────
describe("TP-OTUI-K11 handleAgentDetailKey", () => {
  it("无 sid → 委托 openAgents", () => {
    const s = appState({ agentDetailSid: undefined });
    const { runAsync, calls } = captureRunAsync();
    handleAgentDetailKey(key("return"), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("ctrl+c 在非 sending → 委托 openAgents（返回列表）", () => {
    const s = appState({ agentDetailSid: "s1", agentDetailStatus: "idle" });
    const { runAsync, calls } = captureRunAsync();
    handleAgentDetailKey(key("c", { ctrl: true }), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("ctrl+c 在 sending → 置 cancelling（不委托 openAgents，启动 cancel）", () => {
    const s = appState({ agentDetailSid: "s1", agentDetailStatus: "sending" });
    const { runAsync, calls } = captureRunAsync();
    handleAgentDetailKey(key("c", { ctrl: true }), s, R, runAsync);
    expect(s.agentDetailStatus).toBe("cancelling");
    // 不走 runAsync（直接 void cancelSession），calls 为 0
    expect(calls).toHaveLength(0);
  });

  it("ctrl+y / ctrl+n 在无 pending approval → no-op", () => {
    const s = appState({ agentDetailSid: "s1", agentPendingApprovals: [] });
    const { runAsync, calls } = captureRunAsync();
    handleAgentDetailKey(key("y", { ctrl: true }), s, R, runAsync);
    expect(calls).toHaveLength(0);
  });

  it("ctrl+y 在有 pending approval → 委托 writeApprovalResponse(allow)", () => {
    const s = appState({
      agentDetailSid: "s1",
      agentPendingApprovals: [{ approvalId: "a1" } as any],
    });
    const { runAsync, calls } = captureRunAsync();
    handleAgentDetailKey(key("y", { ctrl: true }), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("escape → 委托 openAgents", () => {
    const s = appState({ agentDetailSid: "s1" });
    const { runAsync, calls } = captureRunAsync();
    handleAgentDetailKey(key("escape"), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("q 在 input 非空时 不退出（继续输入）；input 空时退出", () => {
    const s = appState({ screen: "agent-detail", agentDetailSid: "s1", agentDetailInput: "hi" });
    const { runAsync, calls } = captureRunAsync();
    handleAgentDetailKey(key("q", { sequence: "q" }), s, R, runAsync);
    expect(calls).toHaveLength(0); // 不退出，作为输入
    expect(s.agentDetailInput).toBe("hiq");

    const s2 = appState({ screen: "agent-detail", agentDetailSid: "s1", agentDetailInput: "" });
    handleAgentDetailKey(key("q"), s2, R, runAsync);
  });

  it("r → 委托 refreshAgentDetail", () => {
    const s = appState({ agentDetailSid: "s1" });
    const { runAsync, calls } = captureRunAsync();
    handleAgentDetailKey(key("r"), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });

  it("backspace 删末尾", () => {
    const s = appState({ screen: "agent-detail", agentDetailSid: "s1", agentDetailInput: "abc" });
    handleAgentDetailKey(key("backspace"), s, R, captureRunAsync().runAsync);
    expect(s.agentDetailInput).toBe("ab");
  });

  it("return 空 prompt → no-op", () => {
    const s = appState({ agentDetailSid: "s1", agentDetailInput: "  ", agentDetailStatus: "idle" });
    const { runAsync, calls } = captureRunAsync();
    handleAgentDetailKey(key("return"), s, R, runAsync);
    expect(calls).toHaveLength(0);
    expect(s.agentDetailStatus).toBe("idle"); // 不进入 sending
  });

  it("return 有 prompt + idle → 进 sending 并清空 input（不委托 runAsync）", () => {
    const s = appState({ agentDetailSid: "s1", agentDetailInput: "hello", agentDetailStatus: "idle" });
    const { runAsync, calls } = captureRunAsync();
    handleAgentDetailKey(key("return"), s, R, runAsync);
    expect(s.agentDetailStatus).toBe("sending");
    expect(s.agentDetailInput).toBe("");
    expect(calls).toHaveLength(0); // sendToSession 走 void 不走 runAsync
  });

  it("return 在 sending 状态 → no-op（避免重复发送）", () => {
    const s = appState({ agentDetailSid: "s1", agentDetailInput: "x", agentDetailStatus: "sending" });
    handleAgentDetailKey(key("return"), s, R, captureRunAsync().runAsync);
    expect(s.agentDetailStatus).toBe("sending");
  });

  it("普通字符 → 追加到 input", () => {
    const s = appState({ screen: "agent-detail", agentDetailSid: "s1", agentDetailInput: "ab" });
    handleAgentDetailKey(key("c", { sequence: "c" }), s, R, captureRunAsync().runAsync);
    expect(s.agentDetailInput).toBe("abc");
  });
});

// ─── handleAgentNewKey ─────────────────────────────────────────────
describe("TP-OTUI-K12 handleAgentNewKey", () => {
  it("tab/down 正向切字段 backend→model→name→backend", () => {
    const s = appState({ screen: "agent-new", agentField: "backend" });
    const { runAsync } = captureRunAsync();
    handleAgentNewKey(key("tab"), s, R, runAsync);
    expect(s.agentField).toBe("model");
    handleAgentNewKey(key("down"), s, R, runAsync);
    expect(s.agentField).toBe("name");
    handleAgentNewKey(key("tab"), s, R, runAsync);
    expect(s.agentField).toBe("backend");
  });

  it("up 反向切字段 backend→name→model→backend", () => {
    const s = appState({ screen: "agent-new", agentField: "backend" });
    const { runAsync } = captureRunAsync();
    handleAgentNewKey(key("up"), s, R, runAsync);
    expect(s.agentField).toBe("name");
    handleAgentNewKey(key("up"), s, R, runAsync);
    expect(s.agentField).toBe("model");
    handleAgentNewKey(key("up"), s, R, runAsync);
    expect(s.agentField).toBe("backend");
  });

  it("space/left/right 在 backend 字段 → 切换 claude↔codex", () => {
    for (const kName of ["space", "left", "right"] as const) {
      const s = appState({ screen: "agent-new", agentField: "backend", agentBackend: "claude" });
      handleAgentNewKey(key(kName), s, R, captureRunAsync().runAsync);
      expect(s.agentBackend).toBe("codex");
    }
  });

  it("space 在非 backend 字段 → 不切 backend（走 appendInput）", () => {
    const s = appState({ screen: "agent-new", agentField: "model", agentBackend: "claude", agentModel: "" });
    handleAgentNewKey(key("space", { sequence: " " }), s, R, captureRunAsync().runAsync);
    expect(s.agentBackend).toBe("claude");
  });

  it("backspace 在 model 字段 → 删 model", () => {
    const s = appState({ screen: "agent-new", agentField: "model", agentModel: "gpt" });
    handleAgentNewKey(key("backspace"), s, R, captureRunAsync().runAsync);
    expect(s.agentModel).toBe("gp");
  });

  it("普通字符在 model 字段 → 追加", () => {
    const s = appState({ screen: "agent-new", agentField: "model", agentModel: "gp" });
    handleAgentNewKey(key("t", { sequence: "t" }), s, R, captureRunAsync().runAsync);
    expect(s.agentModel).toBe("gpt");
  });

  it("return → 委托 startSession", () => {
    const s = appState({ screen: "agent-new", agentBackend: "claude", agentModel: "m", agentName: "n" });
    const { runAsync, calls } = captureRunAsync();
    handleAgentNewKey(key("return"), s, R, runAsync);
    expect(calls).toHaveLength(1);
  });
});
