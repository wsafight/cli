import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { SessionMeta, NormalizedFrame } from "../src/agent/types";

// Mock ROOT by importing internal
import {
  initSession, readMeta, writeMeta, appendFrame,
  listSessions, tailLog, removeSession,
  writeApprovalRequest, writeApprovalResponse, listPendingApprovals,
} from "../src/agent/storage";

describe("agent/storage", () => {
  let testDir: string;
  const testSid = "test-sid-12345678-abcd-1234-5678-abcdef012345";

  const baseMeta: SessionMeta = {
    sid: testSid,
    backend: "claude",
    name: "test-session",
    model: "claude-sonnet-4-6",
    workdir: "/tmp/test",
    status: "idle",
    turnCount: 0,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };

  // Note: these tests use the real ~/.tako/agent-sessions/ directory.
  // We use a unique sid to avoid collision and clean up after.

  afterEach(async () => {
    await removeSession(testSid);
  });

  it("initSession creates dir and meta", async () => {
    await initSession(baseMeta);
    const meta = await readMeta(testSid);
    expect(meta).not.toBeNull();
    expect(meta!.sid).toBe(testSid);
    expect(meta!.backend).toBe("claude");
    expect(meta!.name).toBe("test-session");
  });

  it("writeMeta updates meta atomically", async () => {
    await initSession(baseMeta);
    const updated = { ...baseMeta, status: "running" as const, turnCount: 3 };
    await writeMeta(updated);
    const read = await readMeta(testSid);
    expect(read!.status).toBe("running");
    expect(read!.turnCount).toBe(3);
  });

  it("writeMeta skips underscore-prefixed keys", async () => {
    await initSession(baseMeta);
    const withInternal = { ...baseMeta, __env: { SECRET: "key" } } as any;
    await writeMeta(withInternal);
    const { _internal } = await import("../src/agent/storage");
    const raw = await readFile(join(_internal.ROOT, testSid, "meta.json"), "utf-8");
    expect(raw).not.toContain("SECRET");
  });

  it("appendFrame + tailLog round-trip", async () => {
    await initSession(baseMeta);
    const frame: NormalizedFrame = { ts: Date.now(), kind: "turn_started", turnId: "t1" };
    await appendFrame(testSid, frame);
    await appendFrame(testSid, { ts: Date.now(), kind: "text_delta", text: "hello" });
    const log = await tailLog(testSid, 10);
    expect(log).toHaveLength(2);
    expect(log[0].kind).toBe("turn_started");
    expect(log[1].kind).toBe("text_delta");
  });

  it("approval request/response lifecycle", async () => {
    await initSession(baseMeta);
    await writeApprovalRequest(testSid, {
      approvalId: "apr-001",
      method: "item/commandExecution/requestApproval",
      params: { command: "rm -rf /tmp/test" },
      approvalType: "exec",
      requestedAt: Date.now(),
    });

    let pending = await listPendingApprovals(testSid);
    expect(pending).toHaveLength(1);
    expect(pending[0].approvalId).toBe("apr-001");

    await writeApprovalResponse(testSid, "apr-001", {
      decision: "deny",
      reason: "dangerous",
      by: "test",
      decidedAt: Date.now(),
    });

    pending = await listPendingApprovals(testSid);
    expect(pending).toHaveLength(0);
  });

  it("removeSession cleans up directory", async () => {
    await initSession(baseMeta);
    expect(await readMeta(testSid)).not.toBeNull();
    await removeSession(testSid);
    expect(await readMeta(testSid)).toBeNull();
  });
});
