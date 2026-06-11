import { describe, it, expect } from "bun:test";
import { filterSessions } from "../src/agent/manager";
import type { SessionMeta, SessionStatus, Backend } from "../src/agent/types";

function meta(over: Partial<SessionMeta>): SessionMeta {
  return {
    sid: over.sid ?? "00000000-0000-0000-0000-000000000000",
    backend: (over.backend ?? "claude") as Backend,
    name: over.name ?? "s",
    model: over.model,
    workdir: over.workdir ?? "/tmp",
    status: (over.status ?? "idle") as SessionStatus,
    approvalMode: over.approvalMode ?? "yolo",
    turnCount: over.turnCount ?? 0,
    createdAt: over.createdAt ?? 0,
    lastActiveAt: over.lastActiveAt ?? 0,
    providerId: over.providerId,
  };
}

describe("agent/filterSessions", () => {
  const all: SessionMeta[] = [
    meta({ sid: "a", name: "fg-1", status: "idle", turnCount: 0, backend: "claude", model: "mimo" }),
    meta({ sid: "b", name: "fg-2", status: "running", turnCount: 1, backend: "claude", model: "mimo" }),
    meta({ sid: "c", name: "other", status: "closed", turnCount: 3, backend: "codex" }),
    meta({ sid: "d", name: "fg-3", status: "dead", turnCount: 0, backend: "codex" }),
  ];

  // TP-AGENT-04: 默认隐藏 closed
  it("hides closed by default", () => {
    const r = filterSessions(all);
    expect(r.map((m) => m.sid).sort()).toEqual(["a", "b", "d"]);
  });

  // TP-AGENT-04: includeClosed 显示全部
  it("includeClosed shows closed too", () => {
    expect(filterSessions(all, { includeClosed: true }).length).toBe(4);
  });

  // TP-AGENT-01: status 精确过滤
  it("filters by status list", () => {
    const r = filterSessions(all, { status: ["running", "closed"] });
    expect(r.map((m) => m.sid).sort()).toEqual(["b", "c"]);
  });

  // TP-AGENT-02: name 前缀
  it("filters by name prefix", () => {
    const r = filterSessions(all, { namePrefix: "fg-" });
    expect(r.map((m) => m.sid).sort()).toEqual(["a", "b", "d"]);
  });

  // TP-AGENT-03: turns 精确匹配 0
  it("filters by turns === 0", () => {
    const r = filterSessions(all, { turns: 0 });
    expect(r.map((m) => m.sid).sort()).toEqual(["a", "d"]);
  });

  // TP-AGENT-05: 组合 — 挑出 fg- 前缀且 0-turn idle
  it("combines name-prefix + status + turns", () => {
    const r = filterSessions(all, { namePrefix: "fg-", status: ["idle"], turns: 0 });
    expect(r.map((m) => m.sid)).toEqual(["a"]);
  });

  it("filters by backend and model", () => {
    expect(filterSessions(all, { backend: "codex", includeClosed: true }).map((m) => m.sid).sort())
      .toEqual(["c", "d"]);
    expect(filterSessions(all, { model: "mimo" }).map((m) => m.sid).sort())
      .toEqual(["a", "b"]);
  });
});
