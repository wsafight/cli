import { describe, it, expect } from "bun:test";
import { clampIndexes, resetForClient, startProviderInput } from "../src/ui/opentui/state";
import { getDefaultModel } from "../src/providers/types";
import { appState, clientData } from "./_helpers/opentui";

// TP-OTUI-STATE = OpenTUI state.ts 纯逻辑函数测试。
// 只测不触发 IO 的纯状态迁移：clampIndexes / resetForClient / startProviderInput。
// createInitialState / loadLauncherData / reloadLauncherData 依赖 getAllClients、
// project-history、providers 等真实模块，完整隔离需 mock 5+ 内部函数，
// 按 CLAUDE.md 测试纪律（"mock 5+ 内部函数 = 反向耦合"）不在此强测。

// clientData 默认 launchOptions: skip-perms(flag), model-a(group), model-b(group)
// buildOptionRows → [flag, group:model, provider] → 3 行

// ─── clampIndexes ───────────────────────────────────────────────────
describe("TP-OTUI-S01 clampIndexes", () => {
  it("projectIdx / optionIdx 在范围内不变", () => {
    const s = appState({ projectIdx: 0, optionIdx: 1 });
    clampIndexes(s);
    expect(s.projectIdx).toBe(0);
    expect(s.optionIdx).toBe(1);
  });

  it("projectIdx 越界 → clamp 到 projects.length-1", () => {
    const s = appState({ projectIdx: 99 });
    clampIndexes(s);
    expect(s.projectIdx).toBe(s.clients[0].projects.length - 1);
  });

  it("optionIdx 越界 → clamp 到 rows.length-1", () => {
    const s = appState({ optionIdx: 99 });
    clampIndexes(s);
    // rows = [flag, group, provider] → 3，idx 上限 2
    expect(s.optionIdx).toBe(2);
  });

  it("负 idx → clamp 到 0", () => {
    const s = appState({ projectIdx: -5, optionIdx: -5 });
    clampIndexes(s);
    expect(s.projectIdx).toBe(0);
    expect(s.optionIdx).toBe(0);
  });

  it("clientIdx 越界（无 current client）→ no-op 不抛", () => {
    const s = appState({ clients: [], clientIdx: 5, projectIdx: 3, optionIdx: 3 });
    expect(() => clampIndexes(s)).not.toThrow();
    expect(s.projectIdx).toBe(3); // 未被改
    expect(s.optionIdx).toBe(3);
  });

  it("zh=true 时 rows 仍按 launchOptions 结构生成（长度一致）", () => {
    const s = appState({ zh: true, optionIdx: 99 });
    clampIndexes(s);
    expect(s.optionIdx).toBe(2); // 同样 3 行
  });
});

// ─── resetForClient ─────────────────────────────────────────────────
describe("TP-OTUI-S02 resetForClient", () => {
  it("focus=options → 回退到 tabs", () => {
    const s = appState({ focus: "options" });
    resetForClient(s);
    expect(s.focus).toBe("tabs");
  });

  it("focus=tabs 不变", () => {
    const s = appState({ focus: "tabs" });
    resetForClient(s);
    expect(s.focus).toBe("tabs");
  });

  it("focus=projects 不变（只有 options 会被回退）", () => {
    const s = appState({ focus: "projects" });
    resetForClient(s);
    expect(s.focus).toBe("projects");
  });

  it("projectIdx / optionIdx 归零", () => {
    const s = appState({ focus: "options", projectIdx: 5, optionIdx: 2 });
    resetForClient(s);
    expect(s.projectIdx).toBe(0);
    expect(s.optionIdx).toBe(0);
  });
});

// ─── startProviderInput ─────────────────────────────────────────────
describe("TP-OTUI-S03 startProviderInput", () => {
  it("通用：切到 provider-input 屏，rowIdx 归零，addKey 清空", () => {
    const s = appState({ providerRowIdx: 5, addKey: "stale" });
    startProviderInput(s, "rekey");
    expect(s.screen).toBe("provider-input");
    expect(s.providerInputMode).toBe("rekey");
    expect(s.providerRowIdx).toBe(0);
    expect(s.addKey).toBe("");
  });

  it("add-key 模式：清空 addUrl/addCtx，addModel 填 addType 的默认模型", () => {
    const s = appState({ addType: "anthropic", addUrl: "u", addModel: "m", addCtx: "c" });
    startProviderInput(s, "add-key");
    expect(s.addUrl).toBe("");
    expect(s.addCtx).toBe("");
    expect(s.addModel).toBe(getDefaultModel("anthropic") || "");
  });

  it("rekey 模式：不清 addUrl/addModel/addCtx（只清 addKey）", () => {
    const s = appState({ addUrl: "keep-u", addModel: "keep-m", addCtx: "keep-c" });
    startProviderInput(s, "rekey");
    expect(s.addUrl).toBe("keep-u");
    expect(s.addModel).toBe("keep-m");
    expect(s.addCtx).toBe("keep-c");
  });

  it("add-url / add-model / add-ctx 模式：不清 addUrl/addModel/addCtx", () => {
    for (const mode of ["add-url", "add-model", "add-ctx"] as const) {
      const s = appState({ addUrl: "u", addModel: "m", addCtx: "c" });
      startProviderInput(s, mode);
      expect(s.addUrl).toBe("u");
      expect(s.addModel).toBe("m");
      expect(s.addCtx).toBe("c");
    }
  });

  it("addType 无默认模型时 addModel 为空串", () => {
    // custom 类型通常无内置默认模型
    const s = appState({ addType: "custom" });
    startProviderInput(s, "add-key");
    expect(s.addModel).toBe(getDefaultModel("custom") || "");
  });
});
