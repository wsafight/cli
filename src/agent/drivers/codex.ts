import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Driver, NormalizedFrame, SendHooks, SessionMeta, StartOpts } from "../types";
import {
  appendFrame, writeMeta, sessionDir,
  writeApprovalRequest, readApprovalResponse, type ApprovalRequest,
} from "../storage";
import { evaluatePolicy, loadPolicy } from "../policy";
import { getClient, getClientEntryPath, getClientBinPath } from "../../clients/base";
import { getBunPath } from "../../installer";

const now = () => Date.now();

class StdioRpcClient {
  private proc: ChildProcess;
  private buf = "";
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private notifyHandlers: ((method: string, params: any) => void)[] = [];
  private serverReqHandler: ((method: string, id: number | string, params: any) => void) | null = null;
  private closed = false;

  constructor(proc: ChildProcess) {
    this.proc = proc;
    proc.stdout?.on("data", (chunk: Buffer) => this.onData(chunk));
    proc.on("close", () => this.onClose());
    proc.on("error", () => this.onClose());
  }

  private onData(chunk: Buffer): void {
    this.buf += chunk.toString("utf-8");
    let idx;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      try { this.dispatch(JSON.parse(line)); } catch { /* skip */ }
    }
  }

  private dispatch(msg: any): void {
    if (msg && typeof msg === "object") {
      if (msg.id !== undefined && (("result" in msg) || ("error" in msg))) {
        const p = this.pending.get(msg.id);
        if (p) { this.pending.delete(msg.id); if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result); }
        return;
      }
      if (msg.method && msg.id !== undefined) { this.serverReqHandler?.(msg.method, msg.id, msg.params); return; }
      if (msg.method) { for (const h of this.notifyHandlers) h(msg.method, msg.params); }
    }
  }

  private onClose(): void { this.closed = true; for (const [, p] of this.pending) p.reject(new Error("rpc closed")); this.pending.clear(); }
  private write(obj: any): void { if (this.closed) return; this.proc.stdin?.write(JSON.stringify(obj) + "\n"); }

  request<T = any>(method: string, params: any): Promise<T> {
    if (this.closed) return Promise.reject(new Error("rpc closed"));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.write({ jsonrpc: "2.0", method, params, id }); });
  }
  notify(method: string, params: any): void { this.write({ jsonrpc: "2.0", method, params }); }
  reply(id: number | string, result: any): void { this.write({ jsonrpc: "2.0", id, result }); }
  replyError(id: number | string, code: number, message: string): void { this.write({ jsonrpc: "2.0", id, error: { code, message } }); }
  onNotification(h: (method: string, params: any) => void): void { this.notifyHandlers.push(h); }
  onServerRequest(h: (method: string, id: number | string, params: any) => void): void { this.serverReqHandler = h; }
  pid(): number | undefined { return this.proc.pid; }
  kill(sig: NodeJS.Signals = "SIGTERM"): void { try { this.proc.kill(sig); } catch { /* ignore */ } }
  close(): void { try { this.proc.stdin?.end(); } catch { /* ignore */ } this.kill("SIGTERM"); }
}

async function spawnAppServerStdio(workdir: string, env: Record<string, string>): Promise<StdioRpcClient> {
  const client = getClient("codex");
  if (!client) throw new Error("codex client 未注册");
  const bin = (await getClientEntryPath(client)) ?? getClientBinPath(client);
  const fullEnv = { ...process.env, ...env };
  const cmd = client.runtime === "native" ? bin : await getBunPath();
  const args = client.runtime === "native" ? ["app-server"] : [bin, "app-server"];
  const proc = spawn(cmd, args, { env: fullEnv, cwd: workdir, stdio: ["pipe", "pipe", "pipe"] });
  proc.stderr?.on("data", () => {});
  return new StdioRpcClient(proc);
}

async function doInit(rpc: StdioRpcClient): Promise<void> {
  await rpc.request("initialize", { clientInfo: { name: "tako-agent", title: "Tako Agent", version: "0.1" }, capabilities: null });
}

function buildThreadParams(opts: { workdir: string; model?: string; providerHint?: { type: string }; approvalMode?: "yolo" | "external" }, base: any = {}): any {
  const external = opts.approvalMode === "external";
  const p: any = { cwd: opts.workdir, approvalPolicy: external ? "untrusted" : "never", sandbox: external ? "workspace-write" : "danger-full-access", ...base };
  if (opts.model) p.model = opts.model;
  if (opts.providerHint?.type === "tako" || opts.providerHint?.type === "custom") p.modelProvider = "tako";
  return p;
}

function buildApprovalReply(method: string, allow: boolean): any {
  if (method === "applyPatchApproval" || method === "execCommandApproval") return { decision: allow ? "approved" : "denied" };
  if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") return { decision: allow ? "accept" : "decline" };
  if (method === "item/permissions/requestApproval") return allow ? { permissions: { allowedTools: ["*"] }, scope: "turn" } : { permissions: {}, scope: "turn" };
  if (method === "mcpServer/elicitation/request") return { action: allow ? "accept" : "decline" };
  return { decision: allow ? "approved" : "denied" };
}

function classifyApproval(method: string): "exec" | "patch" | "permission" | "tool" | "other" {
  if (method.includes("commandExecution") || method === "execCommandApproval") return "exec";
  if (method.includes("fileChange") || method === "applyPatchApproval") return "patch";
  if (method.includes("permissions")) return "permission";
  if (method.includes("tool/")) return "tool";
  return "other";
}

async function waitForApprovalResponse(sid: string, approvalId: string, timeoutMs = 300_000, pollMs = 200): Promise<{ allow: boolean; reason?: string; by?: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const resp = await readApprovalResponse(sid, approvalId);
    if (resp) return { allow: resp.decision === "allow", reason: resp.reason, by: resp.by };
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return { allow: false, reason: `timeout after ${Math.round(timeoutMs / 1000)}s`, by: "tako-timeout" };
}

export const codexDriver: Driver = {
  backend: "codex",

  async start(opts: StartOpts): Promise<SessionMeta> {
    const meta: SessionMeta = {
      sid: opts.sid, backend: "codex", name: opts.name, model: opts.model,
      workdir: opts.workdir, status: "idle", approvalMode: opts.approvalMode ?? "yolo",
      turnCount: 0, createdAt: now(), lastActiveAt: now(), providerId: opts.providerId,
    };
    await appendFrame(meta.sid, { ts: now(), kind: "session_started", sid: meta.sid, backend: "codex", model: meta.model });
    (meta as any).__providerHint = opts.providerHint;
    return meta;
  },

  async send(meta, prompt, hooks): Promise<SessionMeta> {
    const env = ((meta as any).__env as Record<string, string>) ?? {};
    const providerHint = (meta as any).__providerHint as { type: string } | undefined;
    const rpc = await spawnAppServerStdio(meta.workdir, env);
    const pidFile = join(sessionDir(meta.sid), "turn.pid");
    if (rpc.pid()) await writeFile(pidFile, String(rpc.pid()));

    const approvalMode = meta.approvalMode ?? "yolo";
    rpc.onServerRequest((method, id, params) => {
      if (approvalMode === "yolo") { rpc.replyError(id, -32603, `tako-agent yolo mode: ${method} declined`); return; }
      const approvalId = String(id);
      const approvalType = classifyApproval(method);
      void (async () => {
        const policy = await loadPolicy(meta.sid);
        const verdict = evaluatePolicy(policy, method, params, meta.workdir);
        if (verdict.kind === "auto_allow") {
          await appendFrame(meta.sid, { ts: now(), kind: "tool_result", itemId: approvalId, output: { approval: "auto_allowed", reason: verdict.reason } });
          rpc.reply(id, buildApprovalReply(method, true)); return;
        }
        if (verdict.kind === "auto_deny") {
          await appendFrame(meta.sid, { ts: now(), kind: "error", message: `auto_deny: ${verdict.reason}`, raw: { method, params } });
          rpc.reply(id, buildApprovalReply(method, false)); return;
        }
        const req: ApprovalRequest = { approvalId, method, params, approvalType, requestedAt: now() };
        await writeApprovalRequest(meta.sid, req);
        await appendFrame(meta.sid, { ts: now(), kind: "approval_required", approvalId, approvalType, params });
        meta.status = "awaiting_approval"; await writeMeta(meta);
        const decision = await waitForApprovalResponse(meta.sid, approvalId);
        meta.status = "running"; await writeMeta(meta);
        rpc.reply(id, buildApprovalReply(method, decision.allow));
      })().catch((e) => { rpc.replyError(id, -32603, `approval bridge error: ${e?.message ?? e}`); });
    });

    let chain: Promise<void> = Promise.resolve();
    rpc.onNotification((method, params) => {
      const frames = normalizeCodex(method, params);
      if (!frames.length) return;
      chain = chain.then(async () => { for (const f of frames) { await appendFrame(meta.sid, f); hooks?.onFrame?.(f); } });
    });

    meta.status = "running"; meta.lastActiveAt = now(); await writeMeta(meta);
    const turnDone = new Promise<void>((resolve) => { rpc.onNotification((m) => { if (m === "turn/completed" || m === "turn/failed") resolve(); }); });

    let success = false;
    try {
      await doInit(rpc);
      if (!meta.codexThreadId) {
        const thread = await rpc.request<any>("thread/start", buildThreadParams({ workdir: meta.workdir, model: meta.model, providerHint, approvalMode }));
        meta.codexThreadId = thread?.threadId ?? thread?.id ?? thread?.thread?.id;
        if (!meta.codexThreadId) throw new Error(`thread/start 无 threadId`);
      } else {
        await rpc.request("thread/resume", buildThreadParams({ workdir: meta.workdir, model: meta.model, providerHint, approvalMode }, { threadId: meta.codexThreadId }));
      }
      await rpc.request("turn/start", { threadId: meta.codexThreadId, input: [{ type: "text", text: prompt, text_elements: [] }] });
      await Promise.race([turnDone, new Promise<void>((_, rej) => setTimeout(() => rej(new Error("turn timeout 10min")), 600_000))]);
      await chain;
      success = true;
    } catch (e) {
      await appendFrame(meta.sid, { ts: now(), kind: "error", message: e instanceof Error ? e.message : String(e) });
    }

    rpc.close();
    await unlink(pidFile).catch(() => {});
    if (success) meta.turnCount++;
    meta.lastActiveAt = now(); meta.status = "idle"; await writeMeta(meta);
    return meta;
  },

  async cancel(meta): Promise<void> {
    const pidFile = join(sessionDir(meta.sid), "turn.pid");
    try { const fs = await import("node:fs/promises"); const pid = parseInt(await fs.readFile(pidFile, "utf-8"), 10); if (pid > 0) process.kill(pid, "SIGTERM"); } catch { /* not running */ }
  },

  async close(meta): Promise<void> {
    if (meta.codexThreadId) {
      try { const env = ((meta as any).__env as Record<string, string>) ?? {}; const rpc = await spawnAppServerStdio(meta.workdir, env); await doInit(rpc).catch(() => {}); await rpc.request("thread/archive", { threadId: meta.codexThreadId }).catch(() => {}); rpc.close(); } catch { /* ignore */ }
    }
    await appendFrame(meta.sid, { ts: now(), kind: "session_closed" });
    meta.status = "closed"; meta.lastActiveAt = now(); await writeMeta(meta);
  },

  async isAlive(meta): Promise<boolean> { return meta.status !== "closed"; },
};

export function attachEnv(meta: SessionMeta, env: Record<string, string>): SessionMeta {
  (meta as any).__env = env; return meta;
}

function normalizeCodex(method: string, params: any): NormalizedFrame[] {
  const out: NormalizedFrame[] = [];
  const t = now();
  switch (method) {
    case "turn/started": out.push({ ts: t, kind: "turn_started", turnId: params?.turn?.id ?? "?" }); break;
    case "turn/completed": out.push({ ts: t, kind: "turn_completed", turnId: params?.turn?.id, usage: params?.turn?.usage }); break;
    case "item/agentMessage/delta": if (typeof params?.delta === "string") out.push({ ts: t, kind: "text_delta", text: params.delta, itemId: params.itemId }); break;
    case "item/reasoning/textDelta": case "item/reasoning/summaryTextDelta": if (typeof params?.delta === "string") out.push({ ts: t, kind: "reasoning_delta", text: params.delta }); break;
    case "item/started": {
      const it = params?.item; if (!it) break;
      if (it.type === "commandExecution") out.push({ ts: t, kind: "tool_use", name: "shell", input: { command: it.command }, itemId: it.id });
      else if (it.type === "fileChange") out.push({ ts: t, kind: "tool_use", name: "fileChange", input: it, itemId: it.id });
      else if (it.type === "mcpToolCall") out.push({ ts: t, kind: "tool_use", name: it.serverName ? `${it.serverName}.${it.toolName}` : (it.toolName ?? "mcp"), input: it.args, itemId: it.id });
      break;
    }
    case "item/completed": {
      const it = params?.item; if (!it) break;
      if (it.type === "commandExecution" || it.type === "fileChange" || it.type === "mcpToolCall") out.push({ ts: t, kind: "tool_result", itemId: it.id, output: it });
      break;
    }
    case "error": case "warning": out.push({ ts: t, kind: "error", message: params?.message ?? method, raw: params }); break;
  }
  return out;
}
