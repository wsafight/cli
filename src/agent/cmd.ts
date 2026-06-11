import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { logPath, listPendingApprovals, writeApprovalResponse, readApprovalResponse } from "./storage";
import {
  startSession, sendToSession, cancelSession, closeSession,
  listAllSessions, showSession, purgeDead, setAgentDefault, getAgentDefaults,
} from "./manager";
import { loadPolicy, readSessionPolicyOverride, writeSessionPolicyOverride, appendSessionExecAllow, DEFAULT_POLICY } from "./policy";
import { printFrame, toLeanFrame, describeApproval, type PrintMode } from "./printer";
import type { ApprovalMode, Backend, NormalizedFrame } from "./types";

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) { flags[a.slice(2, eq)] = a.slice(eq + 1); }
      else { const next = args[i + 1]; if (next !== undefined && !next.startsWith("--")) { flags[a.slice(2)] = next; i++; } else flags[a.slice(2)] = true; }
    } else { positional.push(a); }
  }
  return { positional, flags };
}

function fmtAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export async function runAgentCommand(rawArgs: string[]): Promise<void> {
  const sub = rawArgs[0];
  const rest = rawArgs.slice(1);
  if (!sub || sub === "help" || sub === "-h" || sub === "--help") { printHelp(); return; }
  switch (sub) {
    case "start": return cmdStart(rest);
    case "list": case "ls": return cmdList();
    case "send": return cmdSend(rest);
    case "cancel": return cmdCancel(rest);
    case "close": return cmdClose(rest);
    case "show": return cmdShow(rest);
    case "attach": return cmdAttach(rest);
    case "purge": return cmdPurge();
    case "default": return cmdSetDefault(rest);
    case "defaults": return cmdShowDefaults();
    case "approve": return cmdApprove(rest);
    case "pending": return cmdPending(rest);
    case "policy": return cmdPolicy(rest);
    case "wait": return cmdWait(rest);
    default: console.error(`未知子命令: ${sub}`); printHelp(); process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
tako agent <子命令> [...]

  start <claude|codex> [--model X] [--name N] [--cwd .] [--provider id] [--approval yolo|external]
  list                              列出所有 session
  send [--json|--verbose] <sid> <prompt>
  cancel <sid>                      中止当前 turn
  close <sid> [--purge]             关闭 session
  show <sid> [--lines N] [--json]   查看详情+日志
  attach <sid> [--json|--verbose]   实时跟随日志流
  purge                             清理 closed/dead session

  pending <sid> [--json]            列待审批请求
  wait <sid> [--json] [--timeout N] 阻塞到下一决策点
  approve <sid> <id> <allow|deny>   回复审批

  policy <sid> show                 显示生效策略
  policy <sid> allow-exec <regex>   加白名单
  policy <sid> deny-exec <regex>    加黑名单
  policy <sid> reset                清空 session 策略

  default <backend> <providerId>    设默认 provider
  defaults                          查看默认
`);
}

async function resolveSid(prefix: string | undefined): Promise<string> {
  if (!prefix) { console.error("缺少 sid 参数"); process.exit(1); }
  const all = await listAllSessions();
  const matches = all.filter((m) => m.sid.startsWith(prefix));
  if (matches.length === 0) return prefix;
  if (matches.length > 1) { console.error(`sid 前缀 "${prefix}" 匹配多个`); process.exit(1); }
  return matches[0].sid;
}

async function cmdStart(args: string[]): Promise<void> {
  const { positional, flags } = parseFlags(args);
  const backend = positional[0] as Backend | undefined;
  if (backend !== "claude" && backend !== "codex") { console.error("用法: tako agent start <claude|codex>"); process.exit(1); }
  let approvalMode: ApprovalMode | undefined;
  if (typeof flags.approval === "string") {
    if (flags.approval !== "yolo" && flags.approval !== "external") { console.error("--approval 仅支持 yolo|external"); process.exit(1); }
    approvalMode = flags.approval;
  }
  const meta = await startSession({
    backend, model: typeof flags.model === "string" ? flags.model : undefined,
    name: typeof flags.name === "string" ? flags.name : undefined,
    workdir: typeof flags.cwd === "string" ? flags.cwd : undefined,
    providerId: typeof flags.provider === "string" ? flags.provider : undefined, approvalMode,
  });
  console.log(`✓ ${meta.backend} session 已创建`);
  console.log(`  sid:      ${meta.sid}`);
  console.log(`  name:     ${meta.name}`);
  if (meta.model) console.log(`  model:    ${meta.model}`);
  console.log(`  workdir:  ${meta.workdir}`);
  console.log(`  approval: ${meta.approvalMode ?? "yolo"}`);
  console.log(`\n后续：tako agent send ${meta.sid} "你的 prompt"`);
}

async function cmdList(): Promise<void> {
  const sessions = await listAllSessions();
  if (sessions.length === 0) { console.log("(暂无 session)"); return; }
  const rows = sessions.map((m) => ({
    sid: m.sid.slice(0, 8), backend: m.backend, name: m.name.slice(0, 20),
    model: (m.model ?? "-").slice(0, 24), status: m.status, turns: String(m.turnCount),
    age: fmtAge(Date.now() - m.createdAt), last: fmtAge(Date.now() - m.lastActiveAt),
  }));
  const headers = ["sid", "backend", "name", "model", "status", "turns", "age", "last"];
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r as any)[h].length)));
  const fmt = (vals: string[]) => vals.map((v, i) => v.padEnd(widths[i])).join("  ");
  console.log(fmt(headers));
  console.log(fmt(widths.map((w) => "─".repeat(w))));
  for (const r of rows) console.log(fmt(headers.map((h) => (r as any)[h])));
}

async function cmdSend(args: string[]): Promise<void> {
  const flags: Set<string> = new Set();
  const rest = [...args];
  while (rest[0] && rest[0].startsWith("--")) flags.add(rest.shift()!);
  const sid = rest[0]; const prompt = rest.slice(1).join(" ");
  if (!sid || !prompt) { console.error("用法: tako agent send [--json|--verbose] <sid> <prompt...>"); process.exit(1); }
  const mode: PrintMode = flags.has("--json") ? "json" : flags.has("--verbose") ? "verbose" : "human";
  const fullSid = await resolveSid(sid);
  if (mode !== "json") console.log(`→ ${fullSid.slice(0, 8)}`);
  await sendToSession(fullSid, prompt, { onFrame: (f) => printFrame(f, mode) });
}

async function cmdCancel(args: string[]): Promise<void> {
  const sid = await resolveSid(args[0]);
  await cancelSession(sid);
  console.log(`✓ 已中止 ${sid.slice(0, 8)}`);
}

async function cmdClose(args: string[]): Promise<void> {
  const { positional, flags } = parseFlags(args);
  const sid = await resolveSid(positional[0]);
  await closeSession(sid, !!flags.purge);
  console.log(`✓ 已关闭 ${sid.slice(0, 8)}${flags.purge ? "（已删除目录）" : ""}`);
}

async function cmdShow(args: string[]): Promise<void> {
  const { positional, flags } = parseFlags(args);
  const sid = await resolveSid(positional[0]);
  const lines = typeof flags.lines === "string" ? parseInt(flags.lines, 10) : 30;
  const mode: PrintMode = flags.json ? "json" : "human";
  const data = await showSession(sid, lines);
  if (!data) { console.error(`session ${sid} 不存在`); process.exit(1); }
  if (mode === "json") { process.stdout.write(JSON.stringify({ meta: data.meta, alive: data.alive, log: data.log.map(toLeanFrame) }, null, 2) + "\n"); return; }
  const m = data.meta;
  console.log(`# ${m.sid.slice(0, 8)}  ${m.backend}${m.model ? ` ${m.model}` : ""}`);
  console.log(`name=${m.name}  status=${m.status}  turns=${m.turnCount}  approval=${m.approvalMode ?? "yolo"}  alive=${data.alive}`);
  console.log(`workdir=${m.workdir}`);
  console.log(`\n--- log (${data.log.length}) ---`);
  for (const f of data.log) printFrame(f, mode);
}

async function cmdAttach(args: string[]): Promise<void> {
  const { positional, flags } = parseFlags(args);
  const sid = await resolveSid(positional[0]);
  const mode: PrintMode = flags.json ? "json" : flags.verbose ? "verbose" : "human";
  if (!existsSync(logPath(sid))) { console.error(`session ${sid} 不存在`); process.exit(1); }
  let pos = (await stat(logPath(sid))).size;
  if (mode !== "json") console.log(`(attached to ${sid.slice(0, 8)}; Ctrl-C 退出)`);
  const poll = setInterval(async () => {
    try {
      const sz = (await stat(logPath(sid))).size;
      if (sz <= pos) return;
      const stream = createReadStream(logPath(sid), { start: pos, end: sz - 1 });
      pos = sz;
      let buf = "";
      stream.on("data", (chunk) => {
        buf += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
        let idx;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
          if (!line.trim()) continue;
          try { printFrame(JSON.parse(line), mode); } catch { /* skip */ }
        }
      });
    } catch { /* retry next tick */ }
  }, 200);
  await new Promise<void>((resolve) => { process.on("SIGINT", () => { clearInterval(poll); resolve(); }); });
}

async function cmdPurge(): Promise<void> { const n = await purgeDead(); console.log(`✓ 清理了 ${n} 个 session`); }

async function cmdApprove(args: string[]): Promise<void> {
  const { positional, flags } = parseFlags(args);
  const sid = await resolveSid(positional[0]);
  const approvalId = positional[1]; const decision = positional[2];
  if (!approvalId || (decision !== "allow" && decision !== "deny")) { console.error("用法: tako agent approve <sid> <approvalId> <allow|deny>"); process.exit(1); }
  const existing = await readApprovalResponse(sid, approvalId);
  if (existing) { console.error(`approval ${approvalId} 已批为 ${existing.decision}`); process.exit(1); }
  await writeApprovalResponse(sid, approvalId, {
    decision, reason: typeof flags.reason === "string" ? flags.reason : undefined,
    by: typeof flags.by === "string" ? flags.by : "cli", decidedAt: Date.now(),
  });
  console.log(`✓ approval ${approvalId} = ${decision}`);
  if (typeof flags.rule === "string" && decision === "allow") {
    await appendSessionExecAllow(sid, flags.rule);
    console.log(`✓ policy: exec_allow += /${flags.rule}/`);
  }
}

async function cmdPending(args: string[]): Promise<void> {
  const { positional, flags } = parseFlags(args);
  const sid = await resolveSid(positional[0]);
  const pending = await listPendingApprovals(sid);
  if (flags.json) { process.stdout.write(JSON.stringify(pending.map((r) => ({ approvalId: r.approvalId, type: r.approvalType, detail: describeApproval(r.approvalType, r.params) })), null, 2) + "\n"); return; }
  if (pending.length === 0) { console.log("(无 pending)"); return; }
  for (const r of pending) { console.log(`[${r.approvalType}] id=${r.approvalId}  ${describeApproval(r.approvalType, r.params)}`); }
}

async function cmdPolicy(args: string[]): Promise<void> {
  if (args[0] === "default-show") { console.log(JSON.stringify(DEFAULT_POLICY, null, 2)); return; }
  const sid = await resolveSid(args[0]); const sub = args[1];
  if (!sub || sub === "show") {
    const effective = await loadPolicy(sid); const override = await readSessionPolicyOverride(sid);
    console.log("=== effective policy ==="); console.log(JSON.stringify(effective, null, 2));
    console.log("\n=== session override ==="); console.log(Object.keys(override).length === 0 ? "(空)" : JSON.stringify(override, null, 2));
    return;
  }
  const arg = args.slice(2).join(" ").trim();
  if (sub === "allow-exec" || sub === "deny-exec") {
    if (!arg) { console.error(`用法: tako agent policy <sid> ${sub} <regex>`); process.exit(1); }
    const p = await readSessionPolicyOverride(sid);
    const key = sub === "allow-exec" ? "exec_allow" : "exec_deny";
    const list = p[key] ?? []; if (!list.includes(arg)) list.push(arg); p[key] = list;
    await writeSessionPolicyOverride(sid, p); console.log(`✓ ${key} += /${arg}/`); return;
  }
  if (sub === "reset") { await writeSessionPolicyOverride(sid, {}); console.log("✓ 策略已清空"); return; }
  console.error(`未知 policy 子命令: ${sub}`); process.exit(1);
}

async function cmdWait(args: string[]): Promise<void> {
  const { positional, flags } = parseFlags(args);
  const sid = await resolveSid(positional[0]);
  const json = !!flags.json;
  const timeoutMs = typeof flags.timeout === "string" ? Number(flags.timeout) * 1000 : 600_000;
  const sinceTs = typeof flags.since === "string" ? Number(flags.since) : 0;
  if (!existsSync(logPath(sid))) { if (json) process.stdout.write(JSON.stringify({ event: "not_found", sid }) + "\n"); else console.error(`session ${sid} 不存在`); process.exit(1); }
  let pos = sinceTs > 0 ? 0 : (await stat(logPath(sid))).size;
  const startWaitTs = Date.now(); const collectedText: string[] = [];
  while (Date.now() - startWaitTs < timeoutMs) {
    try {
      const sz = (await stat(logPath(sid))).size;
      if (sz > pos) {
        const fs = await import("node:fs/promises");
        const fd = await fs.open(logPath(sid), "r");
        const buf = Buffer.alloc(sz - pos); await fd.read(buf, 0, buf.length, pos); await fd.close(); pos = sz;
        for (const line of buf.toString("utf-8").split("\n")) {
          if (!line.trim()) continue;
          let f: NormalizedFrame; try { f = JSON.parse(line); } catch { continue; }
          if (sinceTs > 0 && f.ts < sinceTs) continue;
          if (f.kind === "text_delta") { collectedText.push(f.text); continue; }
          if (f.kind === "approval_required") { const p = await listPendingApprovals(sid); if (json) process.stdout.write(JSON.stringify({ event: "approval_required", pending: p.map((r) => ({ approvalId: r.approvalId, type: r.approvalType })) }) + "\n"); else console.log(`event=approval_required pending=${p.length}`); process.exit(0); }
          if (f.kind === "turn_completed") { if (json) process.stdout.write(JSON.stringify({ event: "turn_completed", text: collectedText.join("") }) + "\n"); else { console.log("event=turn_completed"); if (collectedText.join("").trim()) console.log(collectedText.join("").trim()); } process.exit(2); }
          if (f.kind === "error") { if (json) process.stdout.write(JSON.stringify({ event: "error", message: f.message }) + "\n"); else console.error(`event=error ${f.message}`); process.exit(1); }
          if (f.kind === "session_closed") { if (json) process.stdout.write(JSON.stringify({ event: "session_closed" }) + "\n"); else console.log("event=session_closed"); process.exit(3); }
        }
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (json) process.stdout.write(JSON.stringify({ event: "timeout" }) + "\n"); else console.error("event=timeout");
  process.exit(1);
}

async function cmdSetDefault(args: string[]): Promise<void> {
  const backend = args[0] as Backend; const providerId = args[1];
  if ((backend !== "claude" && backend !== "codex") || !providerId) { console.error("用法: tako agent default <claude|codex> <providerId>"); process.exit(1); }
  await setAgentDefault(backend, providerId); console.log(`✓ ${backend} 默认 provider = ${providerId}`);
}

async function cmdShowDefaults(): Promise<void> {
  const d = await getAgentDefaults();
  if (Object.keys(d).length === 0) console.log("(未设置)");
  else for (const [k, v] of Object.entries(d)) console.log(`${k.padEnd(8)} → ${v}`);
}
