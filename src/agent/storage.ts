import { join } from "node:path";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile, rename, readdir, rm, appendFile } from "node:fs/promises";
import type { SessionMeta, NormalizedFrame } from "./types";

const ROOT = join(homedir(), ".tako", "agent-sessions");

export function sessionDir(sid: string): string {
  return join(ROOT, sid);
}

export function metaPath(sid: string): string {
  return join(sessionDir(sid), "meta.json");
}

export function logPath(sid: string): string {
  return join(sessionDir(sid), "log.ndjson");
}

export function approvalsDir(sid: string): string {
  return join(sessionDir(sid), "approvals");
}
export function approvalReqPath(sid: string, approvalId: string): string {
  return join(approvalsDir(sid), `${approvalId}.req.json`);
}
export function approvalRespPath(sid: string, approvalId: string): string {
  return join(approvalsDir(sid), `${approvalId}.resp.json`);
}

async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

export async function initSession(meta: SessionMeta): Promise<void> {
  await ensureDir(sessionDir(meta.sid));
  await writeMeta(meta);
  await appendFile(logPath(meta.sid), "");
}

export async function readMeta(sid: string): Promise<SessionMeta | null> {
  try {
    const text = await readFile(metaPath(sid), "utf-8");
    return JSON.parse(text) as SessionMeta;
  } catch { return null; }
}

export async function writeMeta(meta: SessionMeta): Promise<void> {
  const dir = sessionDir(meta.sid);
  await ensureDir(dir);
  const tmp = join(dir, "meta.json.tmp");
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k.startsWith("_")) continue;
    clean[k] = v;
  }
  await writeFile(tmp, JSON.stringify(clean, null, 2), "utf-8");
  await rename(tmp, metaPath(meta.sid));
}

export async function appendFrame(sid: string, frame: NormalizedFrame): Promise<void> {
  await appendFile(logPath(sid), JSON.stringify(frame) + "\n", "utf-8");
}

export async function listSessions(): Promise<SessionMeta[]> {
  await ensureDir(ROOT);
  const entries = await readdir(ROOT, { withFileTypes: true });
  const out: SessionMeta[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = await readMeta(e.name);
    if (m) out.push(m);
  }
  out.sort((a, b) => b.lastActiveAt - a.lastActiveAt);
  return out;
}

export async function tailLog(sid: string, lines: number): Promise<NormalizedFrame[]> {
  let text: string;
  try { text = await readFile(logPath(sid), "utf-8"); }
  catch { return []; }
  const all = text.split("\n").filter(Boolean);
  const tail = all.slice(-lines);
  const out: NormalizedFrame[] = [];
  for (const line of tail) {
    try { out.push(JSON.parse(line) as NormalizedFrame); }
    catch { /* skip */ }
  }
  return out;
}

export async function removeSession(sid: string): Promise<void> {
  try { await rm(sessionDir(sid), { recursive: true, force: true }); }
  catch { /* ignore */ }
}

// Approval file protocol
export interface ApprovalRequest {
  approvalId: string;
  method: string;
  params: unknown;
  approvalType: "exec" | "patch" | "permission" | "tool" | "other";
  requestedAt: number;
}

export interface ApprovalResponse {
  decision: "allow" | "deny";
  reason?: string;
  by?: string;
  decidedAt: number;
}

export async function writeApprovalRequest(sid: string, req: ApprovalRequest): Promise<void> {
  await ensureDir(approvalsDir(sid));
  const tmp = approvalReqPath(sid, req.approvalId) + ".tmp";
  await writeFile(tmp, JSON.stringify(req, null, 2), "utf-8");
  await rename(tmp, approvalReqPath(sid, req.approvalId));
}

export async function readApprovalRequest(sid: string, approvalId: string): Promise<ApprovalRequest | null> {
  try {
    return JSON.parse(await readFile(approvalReqPath(sid, approvalId), "utf-8")) as ApprovalRequest;
  } catch { return null; }
}

export async function writeApprovalResponse(sid: string, approvalId: string, resp: ApprovalResponse): Promise<void> {
  await ensureDir(approvalsDir(sid));
  const tmp = approvalRespPath(sid, approvalId) + ".tmp";
  await writeFile(tmp, JSON.stringify(resp, null, 2), "utf-8");
  await rename(tmp, approvalRespPath(sid, approvalId));
}

export async function readApprovalResponse(sid: string, approvalId: string): Promise<ApprovalResponse | null> {
  try {
    return JSON.parse(await readFile(approvalRespPath(sid, approvalId), "utf-8")) as ApprovalResponse;
  } catch { return null; }
}

export async function listPendingApprovals(sid: string): Promise<ApprovalRequest[]> {
  try {
    const entries = await readdir(approvalsDir(sid));
    const out: ApprovalRequest[] = [];
    for (const e of entries) {
      if (!e.endsWith(".req.json")) continue;
      const id = e.slice(0, -".req.json".length);
      const req = await readApprovalRequest(sid, id);
      if (!req) continue;
      const resp = await readApprovalResponse(sid, id);
      if (!resp) out.push(req);
    }
    out.sort((a, b) => a.requestedAt - b.requestedAt);
    return out;
  } catch { return []; }
}

export const _internal = { ROOT };
