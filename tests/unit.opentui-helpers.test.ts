import { describe, it, expect } from "bun:test";
import {
  buildOptionRows,
  getGroupSelection,
  selectedArgs,
  cycleGroupSelection,
  keyChar,
  isPlain,
  maskSecret,
  getSelectedProvider,
  detailActions,
  actionLabel,
  fmtAge,
  statusColor,
  statusMarker,
  inputBackspace,
  appendInput,
} from "../src/ui/opentui/helpers";
import { THEME } from "../src/ui/opentui/theme";
import { opt, provider, appState, clientData } from "./_helpers/opentui";

// TP-OTUI = OpenTUI helpers 纯逻辑测试。覆盖 helpers.ts 全部导出函数。
// 约定：测合约不测实现——重构内部时这些断言不应改。

// ─── buildOptionRows ────────────────────────────────────────────────
describe("TP-OTUI-01 buildOptionRows", () => {
  it("flag 选项 → flag 行", () => {
    const rows = buildOptionRows([opt("skip-perms")], false);
    expect(rows).toHaveLength(2); // flag 行 + 末尾 provider 行
    expect(rows[0]).toEqual({ kind: "flag", opt: opt("skip-perms") });
    expect(rows[1]).toEqual({ kind: "provider", title: "Provider" });
  });

  it("中文模式 provider 行标题为「服务商」", () => {
    const rows = buildOptionRows([], true);
    expect(rows[0]).toEqual({ kind: "provider", title: "服务商" });
  });

  it("model group 只生成一行 group 行（去重），标题随语言", () => {
    const rows = buildOptionRows(
      [opt("model-a", { group: "model" }), opt("model-b", { group: "model" })],
      true,
    );
    expect(rows.map((r) => r.kind)).toEqual(["group", "provider"]);
    expect((rows[0] as { title: string }).title).toBe("模型");
  });

  it("非 model group 的 title 用 group 名本身", () => {
    const rows = buildOptionRows([opt("x", { group: "region" })], false);
    expect(rows[0]).toEqual({ kind: "group", group: "region", title: "region" });
  });

  it("空选项仍追加 provider 行", () => {
    expect(buildOptionRows([], false)).toHaveLength(1);
  });

  it("混合顺序：flag / flag / group / provider", () => {
    const rows = buildOptionRows(
      [opt("a"), opt("b"), opt("c", { group: "model" }), opt("d", { group: "model" })],
      false,
    );
    const kinds = rows.map((r) => r.kind);
    expect(kinds).toEqual(["flag", "flag", "group", "provider"]);
  });
});

// ─── getGroupSelection ──────────────────────────────────────────────
describe("TP-OTUI-02 getGroupSelection", () => {
  const opts = [opt("a", { group: "model" }), opt("b", { group: "model" })];

  it("返回当前 enabled 的那个 group 成员", () => {
    expect(getGroupSelection(opts, new Set(["b"]), "model")).toEqual(opts[1]);
  });

  it("group 无 enabled 时返回 undefined", () => {
    expect(getGroupSelection(opts, new Set(), "model")).toBeUndefined();
  });

  it("group 不存在时返回 undefined", () => {
    expect(getGroupSelection(opts, new Set(["a"]), "region")).toBeUndefined();
  });

  it("enabled 含非 group 成员不影响结果", () => {
    expect(getGroupSelection(opts, new Set(["zzz", "a"]), "model")).toEqual(opts[0]);
  });
});

// ─── selectedArgs ───────────────────────────────────────────────────
describe("TP-OTUI-03 selectedArgs", () => {
  it("收集 enabled 选项的 args/envVars/ids", () => {
    const cd = clientData({
      enabled: new Set(["skip-perms", "model-a"]),
    });
    const r = selectedArgs(cd);
    expect(r.args).toContain("--dangerously-skip-permissions");
    expect(r.args).toContain("--model");
    expect(r.args).toContain("a");
    expect(r.selectedOptionIds.sort()).toEqual(["model-a", "skip-perms"]);
  });

  it("envVars 合并多个 enabled 选项", () => {
    const cd = clientData({
      launchOptions: [
        opt("a", { envVars: { X: "1" } }),
        opt("b", { envVars: { Y: "2" } }),
      ],
      enabled: new Set(["a", "b"]),
    });
    expect(selectedArgs(cd).envVars).toEqual({ X: "1", Y: "2" });
  });

  it("无 enabled → 空数组/空对象", () => {
    const cd = clientData({ enabled: new Set() });
    const r = selectedArgs(cd);
    expect(r.args).toEqual([]);
    expect(r.envVars).toEqual({});
    expect(r.selectedOptionIds).toEqual([]);
  });

  it("args 顺序按 launchOptions 原始顺序，非 enabled 顺序", () => {
    const cd = clientData({
      launchOptions: [opt("first"), opt("second")],
      enabled: new Set(["second", "first"]),
    });
    expect(selectedArgs(cd).selectedOptionIds).toEqual(["first", "second"]);
  });
});

// ─── cycleGroupSelection ────────────────────────────────────────────
describe("TP-OTUI-04 cycleGroupSelection", () => {
  it("从第 0 个前进到第 1 个", () => {
    const cd = clientData({ enabled: new Set(["model-a"]) });
    cycleGroupSelection(cd, "model");
    expect([...cd.enabled]).toEqual(["model-b"]);
  });

  it("末尾再 cycle → 全部取消（group 内无选中）", () => {
    const cd = clientData({ enabled: new Set(["model-b"]) });
    cycleGroupSelection(cd, "model");
    expect(cd.enabled.has("model-a")).toBe(false);
    expect(cd.enabled.has("model-b")).toBe(false);
  });

  it("group 内无选中时 cycle → 选中第 1 个", () => {
    const cd = clientData({ enabled: new Set() });
    cycleGroupSelection(cd, "model");
    expect([...cd.enabled]).toEqual(["model-a"]);
  });

  it("group 不存在时 no-op", () => {
    const cd = clientData({ enabled: new Set(["model-a"]) });
    cycleGroupSelection(cd, "region");
    expect([...cd.enabled]).toEqual(["model-a"]);
  });

  it("只保留 group 内一个 enabled（外组选项不受影响）", () => {
    const cd = clientData({ enabled: new Set(["skip-perms", "model-a"]) });
    cycleGroupSelection(cd, "model");
    expect(cd.enabled.has("skip-perms")).toBe(true);
    expect([...cd.enabled].filter((id) => id.startsWith("model"))).toEqual(["model-b"]);
  });
});

// ─── keyChar / isPlain ──────────────────────────────────────────────
describe("TP-OTUI-05 keyChar", () => {
  const K = (name: string, seq = "", extra: Record<string, unknown> = {}) =>
    ({ name, ctrl: false, meta: false, shift: false, option: false, sequence: seq, ...extra }) as any;

  it("单字符 sequence 返回该字符", () => {
    expect(keyChar(K("a", "a"))).toBe("a");
  });

  it("ctrl 修饰键返回空串", () => {
    expect(keyChar(K("c", "c", { ctrl: true }))).toBe("");
  });

  it("meta / option 修饰键返回空串", () => {
    expect(keyChar(K("a", "a", { meta: true }))).toBe("");
    expect(keyChar(K("a", "a", { option: true }))).toBe("");
  });

  it("多字符 sequence（如 ANSI 序列）返回空串", () => {
    expect(keyChar(K("up", "\x1b[A"))).toBe("");
  });

  it("无 sequence 但 name 单字符时返回 name", () => {
    expect(keyChar(K("a"))).toBe("a");
  });

  it("特殊键名（enter 等多字符 name）返回空串", () => {
    expect(keyChar(K("return"))).toBe("");
    expect(keyChar(K("escape"))).toBe("");
  });

  it("sequence 为控制字符但 name 单字符 → 仍返回 name（第二分支兜底）", () => {
    // 第一分支 sequence >= " " 不成立，但 name.length===1 时第二分支返回 name
    expect(keyChar(K("a", "\n"))).toBe("a");
  });
});

describe("TP-OTUI-06 isPlain", () => {
  const K = (extra: Record<string, unknown> = {}) =>
    ({ name: "a", ctrl: false, meta: false, shift: false, option: false, ...extra }) as any;

  it("无修饰键为 plain", () => {
    expect(isPlain(K())).toBe(true);
  });

  it("ctrl/meta/option 任一为 true 则非 plain", () => {
    expect(isPlain(K({ ctrl: true }))).toBe(false);
    expect(isPlain(K({ meta: true }))).toBe(false);
    expect(isPlain(K({ option: true }))).toBe(false);
  });

  it("shift 不影响 plain 判定", () => {
    expect(isPlain(K({ shift: true }))).toBe(true);
  });
});

// ─── maskSecret ─────────────────────────────────────────────────────
describe("TP-OTUI-07 maskSecret", () => {
  it("空串返回空串", () => {
    expect(maskSecret("")).toBe("");
  });

  it("≤8 字符全部掩码", () => {
    expect(maskSecret("abc")).toBe("***");
    expect(maskSecret("12345678")).toBe("********");
  });

  it(">8 字符保留首 4 + 末 4，中间掩码", () => {
    expect(maskSecret("123456789")).toBe("1234*6789");
    expect(maskSecret("sk-abcdef123456")).toBe("sk-a*******3456");
  });

  it("长串掩码最多 20 个 *（避免撑爆 UI）", () => {
    const long = "a".repeat(60);
    const masked = maskSecret(long);
    const starCount = [...masked].filter((c) => c === "*").length;
    expect(starCount).toBe(20);
    expect(masked.startsWith("aaaa")).toBe(true);
    expect(masked.endsWith("aaaa")).toBe(true);
  });
});

// ─── getSelectedProvider / detailActions / actionLabel ─────────────
describe("TP-OTUI-08 getSelectedProvider", () => {
  it("按 providerSelectedId 命中", () => {
    const s = appState({ providers: [provider({ id: "p1" }), provider({ id: "p2" })], providerSelectedId: "p2" });
    expect(getSelectedProvider(s)?.id).toBe("p2");
  });

  it("未命中返回 undefined", () => {
    const s = appState({ providers: [provider({ id: "p1" })], providerSelectedId: "pX" });
    expect(getSelectedProvider(s)).toBeUndefined();
  });

  it("providerSelectedId 为 undefined 时返回 undefined", () => {
    const s = appState({ providers: [provider({ id: "p1" })], providerSelectedId: undefined });
    expect(getSelectedProvider(s)).toBeUndefined();
  });
});

describe("TP-OTUI-09 detailActions", () => {
  it("非默认 builtin provider：default + rekey + back（无 delete）", () => {
    const s = appState({ defaultProviderId: "other" });
    const p = provider({ id: "p1", type: "tako", builtin: true });
    expect(detailActions(p, s)).toEqual(["default", "rekey", "back"]);
  });

  it("已是默认 provider：去掉 default", () => {
    const s = appState({ defaultProviderId: "p1" });
    const p = provider({ id: "p1", builtin: true });
    expect(detailActions(p, s)).toEqual(["rekey", "back"]);
  });

  it("claude-subscription → relogin 代替 rekey", () => {
    const s = appState({ defaultProviderId: "x" });
    const p = provider({ id: "p1", type: "claude-subscription", builtin: true });
    expect(detailActions(p, s)).toContain("relogin");
    expect(detailActions(p, s)).not.toContain("rekey");
  });

  it("codex-subscription → relogin", () => {
    const s = appState({ defaultProviderId: "x" });
    const p = provider({ id: "p1", type: "codex-subscription", builtin: true });
    expect(detailActions(p, s)).toContain("relogin");
  });

  it("非 builtin → 含 delete", () => {
    const s = appState({ defaultProviderId: "x" });
    const p = provider({ id: "p1", builtin: false });
    expect(detailActions(p, s)).toContain("delete");
  });

  it("builtin → 不含 delete", () => {
    const s = appState({ defaultProviderId: "x" });
    const p = provider({ id: "p1", builtin: true });
    expect(detailActions(p, s)).not.toContain("delete");
  });

  it("back 永远在末尾", () => {
    const s = appState({ defaultProviderId: "x" });
    const p = provider({ id: "p1", builtin: false, type: "anthropic" });
    const acts = detailActions(p, s);
    expect(acts[acts.length - 1]).toBe("back");
  });
});

describe("TP-OTUI-10 actionLabel", () => {
  it("英文标签", () => {
    expect(actionLabel("default", false)).toBe("Set default");
    expect(actionLabel("rekey", false)).toBe("Update key");
    expect(actionLabel("relogin", false)).toBe("Re-login");
    expect(actionLabel("delete", false)).toBe("Delete");
    expect(actionLabel("back", false)).toBe("Back");
  });

  it("中文标签", () => {
    expect(actionLabel("default", true)).toBe("设为默认");
    expect(actionLabel("rekey", true)).toBe("更新 Key");
    expect(actionLabel("relogin", true)).toBe("重新登录");
    expect(actionLabel("delete", true)).toBe("删除");
    expect(actionLabel("back", true)).toBe("返回");
  });
});

// ─── fmtAge ─────────────────────────────────────────────────────────
describe("TP-OTUI-11 fmtAge", () => {
  it("<60s 显示秒，Math.floor", () => {
    expect(fmtAge(0)).toBe("0s");
    expect(fmtAge(59999)).toBe("59s");
    expect(fmtAge(1000)).toBe("1s");
  });

  it("<3600s 显示分钟，Math.floor", () => {
    expect(fmtAge(60000)).toBe("1m");
    expect(fmtAge(3599999)).toBe("59m");
  });

  it("<86400s 显示小时", () => {
    expect(fmtAge(3600000)).toBe("1h");
    expect(fmtAge(86399999)).toBe("23h");
  });

  it("≥86400s 显示天", () => {
    expect(fmtAge(86400000)).toBe("1d");
    expect(fmtAge(86400000 * 3)).toBe("3d");
  });
});

// ─── statusColor / statusMarker ────────────────────────────────────
describe("TP-OTUI-12 statusColor", () => {
  it("每个已知状态映射到 THEME 调色板", () => {
    expect(statusColor("running")).toBe(THEME.yellow);
    expect(statusColor("awaiting_approval")).toBe(THEME.magenta);
    expect(statusColor("idle")).toBe(THEME.green);
    expect(statusColor("closed")).toBe(THEME.gray);
    expect(statusColor("dead")).toBe(THEME.red);
  });

  it("未知状态 fallback 到 THEME.text", () => {
    expect(statusColor("unknown" as any)).toBe(THEME.text);
  });
});

describe("TP-OTUI-13 statusMarker", () => {
  it("已知状态 marker", () => {
    expect(statusMarker("running")).toBe("~");
    expect(statusMarker("awaiting_approval")).toBe("?");
    expect(statusMarker("idle")).toBe("*");
    expect(statusMarker("dead")).toBe("!");
  });

  it("closed/未知 → '-'", () => {
    expect(statusMarker("closed")).toBe("-");
    expect(statusMarker("unknown" as any)).toBe("-");
  });
});

// ─── appendInput / inputBackspace ──────────────────────────────────
describe("TP-OTUI-14 appendInput — config screen", () => {
  it("追加到 apiKeyValue 并重置状态为 idle", () => {
    const s = appState({ screen: "config", apiKeyValue: "ab", apiKeyStatus: "error" });
    appendInput(s, "c");
    expect(s.apiKeyValue).toBe("abc");
    expect(s.apiKeyStatus).toBe("idle");
  });

  it("空 char 是 no-op", () => {
    const s = appState({ screen: "config", apiKeyValue: "ab" });
    appendInput(s, "");
    expect(s.apiKeyValue).toBe("ab");
  });
});

describe("TP-OTUI-15 inputBackspace — config screen", () => {
  it("删末尾并重置状态", () => {
    const s = appState({ screen: "config", apiKeyValue: "abc", apiKeyStatus: "success" });
    inputBackspace(s);
    expect(s.apiKeyValue).toBe("ab");
    expect(s.apiKeyStatus).toBe("idle");
  });

  it("空串删不报错", () => {
    const s = appState({ screen: "config", apiKeyValue: "" });
    inputBackspace(s);
    expect(s.apiKeyValue).toBe("");
  });
});

describe("TP-OTUI-16 appendInput/backspace — agent-new screen", () => {
  it("agentField=model 时追加到 agentModel", () => {
    const s = appState({ screen: "agent-new", agentField: "model", agentModel: "gpt" });
    appendInput(s, "4");
    expect(s.agentModel).toBe("gpt4");
  });

  it("agentField=name 时追加到 agentName", () => {
    const s = appState({ screen: "agent-new", agentField: "name", agentName: "my" });
    appendInput(s, "-session");
    expect(s.agentName).toBe("my-session");
  });

  it("agentField=backend 时 model/name 都不变", () => {
    const s = appState({ screen: "agent-new", agentField: "backend", agentModel: "", agentName: "" });
    appendInput(s, "x");
    expect(s.agentModel).toBe("");
    expect(s.agentName).toBe("");
  });

  it("backspace 按 agentField 删对应字段", () => {
    const s = appState({ screen: "agent-new", agentField: "name", agentName: "abc" });
    inputBackspace(s);
    expect(s.agentName).toBe("ab");
    // model 不被影响
    s.agentField = "model";
    s.agentModel = "xyz";
    inputBackspace(s);
    expect(s.agentModel).toBe("xy");
  });
});

describe("TP-OTUI-17 appendInput/backspace — agent-detail screen", () => {
  it("追加到 agentDetailInput", () => {
    const s = appState({ screen: "agent-detail", agentDetailInput: "hi" });
    appendInput(s, "!");
    expect(s.agentDetailInput).toBe("hi!");
  });

  it("backspace 删末尾", () => {
    const s = appState({ screen: "agent-detail", agentDetailInput: "hi" });
    inputBackspace(s);
    expect(s.agentDetailInput).toBe("h");
  });
});

describe("TP-OTUI-18 appendInput/backspace — provider-input 各 mode", () => {
  it("add-key / rekey → addKey", () => {
    for (const mode of ["add-key", "rekey"] as const) {
      const s = appState({ screen: "provider-input", providerInputMode: mode, addKey: "k" });
      appendInput(s, "1");
      expect(s.addKey).toBe("k1");
    }
  });

  it("add-url → addUrl", () => {
    const s = appState({ screen: "provider-input", providerInputMode: "add-url", addUrl: "http" });
    appendInput(s, "s");
    expect(s.addUrl).toBe("https");
  });

  it("add-model → addModel", () => {
    const s = appState({ screen: "provider-input", providerInputMode: "add-model", addModel: "gp" });
    appendInput(s, "t");
    expect(s.addModel).toBe("gpt");
  });

  it("add-ctx 只接受数字，拒绝字母", () => {
    const s = appState({ screen: "provider-input", providerInputMode: "add-ctx", addCtx: "1" });
    appendInput(s, "2");
    expect(s.addCtx).toBe("12");
    appendInput(s, "a");
    expect(s.addCtx).toBe("12"); // 被拒
    appendInput(s, " ");
    expect(s.addCtx).toBe("12"); // 被拒
  });

  it("backspace 按当前 mode 删对应字段", () => {
    const s = appState({ screen: "provider-input", providerInputMode: "add-url", addUrl: "abc" });
    inputBackspace(s);
    expect(s.addUrl).toBe("ab");
    s.providerInputMode = "add-ctx";
    s.addCtx = "123";
    inputBackspace(s);
    expect(s.addCtx).toBe("12");
  });
});
