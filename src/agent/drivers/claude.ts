import { spawn } from "node:child_process";
import type { Driver, NormalizedFrame, SendHooks, SessionMeta, StartOpts } from "../types";
import { appendFrame, writeMeta } from "../storage";
import { getClient, getClientEntryPath, getClientBinPath } from "../../clients/base";
import { getBunPath } from "../../installer";

const now = () => Date.now();

interface RunningChild {
  pid: number;
  kill: (sig?: NodeJS.Signals) => void;
}
const runningChildren = new Map<string, RunningChild>();

export const claudeDriver: Driver = {
  backend: "claude",

  async start(opts: StartOpts): Promise<SessionMeta> {
    const meta: SessionMeta = {
      sid: opts.sid,
      backend: "claude",
      name: opts.name,
      model: opts.model,
      workdir: opts.workdir,
      status: "idle",
      turnCount: 0,
      createdAt: now(),
      lastActiveAt: now(),
      providerId: opts.providerId,
    };
    await appendFrame(meta.sid, { ts: now(), kind: "session_started", sid: meta.sid, backend: "claude", model: meta.model });
    return meta;
  },

  async send(meta, prompt, hooks): Promise<SessionMeta> {
    const client = getClient("claude-code");
    if (!client) throw new Error("claude-code client 未注册");
    let bin = await getClientEntryPath(client);
    if (!bin) bin = getClientBinPath(client);

    const isFirstTurn = meta.turnCount === 0;
    const args = [
      "--print",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
    ];
    if (isFirstTurn) args.push("--session-id", meta.sid);
    else args.push("--resume", meta.sid);
    if (meta.model) args.push("--model", meta.model);
    args.push("--permission-mode", "bypassPermissions");

    const env = { ...process.env, ...(meta as any).__env };
    delete (meta as any).__env;

    const cmd = client.runtime === "native" ? bin : await getBunPath();
    const cmdArgs = client.runtime === "native" ? args : [bin, ...args];
    const proc = spawn(cmd, cmdArgs, { env, cwd: meta.workdir, stdio: ["pipe", "pipe", "pipe"] });

    runningChildren.set(meta.sid, { pid: proc.pid!, kill: (s) => proc.kill(s ?? "SIGINT") });

    const userMsg = { type: "user", message: { role: "user", content: [{ type: "text", text: prompt }] } };
    proc.stdin.write(JSON.stringify(userMsg) + "\n");
    proc.stdin.end();

    meta.status = "running";
    meta.lastActiveAt = now();
    await writeMeta(meta);

    let stderrBuf = "";
    proc.stderr.on("data", (d) => { stderrBuf += d.toString(); });

    const turnId = `t${meta.turnCount + 1}`;
    await emit(meta.sid, { ts: now(), kind: "turn_started", turnId }, hooks);

    let buf = "";
    proc.stdout.on("data", async (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        try {
          const raw = JSON.parse(line);
          for (const f of normalizeClaude(raw, turnId)) await emit(meta.sid, f, hooks);
        } catch { /* non-JSON */ }
      }
    });

    const exitCode: number = await new Promise((resolve) => {
      proc.on("close", (code) => resolve(code ?? 0));
    });

    runningChildren.delete(meta.sid);
    if (exitCode === 0) meta.turnCount++;
    meta.lastActiveAt = now();
    meta.status = "idle";

    if (exitCode !== 0) {
      await emit(meta.sid, { ts: now(), kind: "error", message: `claude exited ${exitCode}${stderrBuf ? `: ${stderrBuf.slice(0, 500)}` : ""}` }, hooks);
    }
    await writeMeta(meta);
    return meta;
  },

  async cancel(meta): Promise<void> {
    const child = runningChildren.get(meta.sid);
    if (child) child.kill("SIGINT");
  },

  async close(meta): Promise<void> {
    const child = runningChildren.get(meta.sid);
    if (child) child.kill("SIGTERM");
    runningChildren.delete(meta.sid);
    await emit(meta.sid, { ts: now(), kind: "session_closed" });
    meta.status = "closed";
    meta.lastActiveAt = now();
    await writeMeta(meta);
  },

  async isAlive(): Promise<boolean> { return true; },
};

async function emit(sid: string, frame: NormalizedFrame, hooks?: SendHooks): Promise<void> {
  await appendFrame(sid, frame);
  hooks?.onFrame?.(frame);
}

function normalizeClaude(raw: any, turnId: string): NormalizedFrame[] {
  const out: NormalizedFrame[] = [];
  const t = now();

  if (raw?.type === "assistant" && raw?.message?.content) {
    for (const c of raw.message.content) {
      if (c?.type === "text" && typeof c.text === "string") {
        out.push({ ts: t, kind: "text_delta", text: c.text, itemId: raw.message.id });
      } else if (c?.type === "tool_use") {
        out.push({ ts: t, kind: "tool_use", name: c.name ?? "?", input: c.input, itemId: c.id });
      } else if (c?.type === "thinking" && typeof c.thinking === "string") {
        out.push({ ts: t, kind: "reasoning_delta", text: c.thinking });
      }
    }
  } else if (raw?.type === "user" && raw?.message?.content) {
    for (const c of raw.message.content) {
      if (c?.type === "tool_result") {
        out.push({ ts: t, kind: "tool_result", itemId: c.tool_use_id, output: c.content });
      }
    }
  } else if (raw?.type === "result") {
    if (raw.is_error) out.push({ ts: t, kind: "error", message: typeof raw.result === "string" ? raw.result : "claude reported error", raw });
    out.push({ ts: t, kind: "turn_completed", turnId, stopReason: raw.stop_reason, usage: raw.usage });
  } else if (raw?.type === "stream_event" && raw?.event?.delta?.thinking) {
    out.push({ ts: t, kind: "reasoning_delta", text: String(raw.event.delta.thinking) });
  }
  return out;
}

export function attachEnv(meta: SessionMeta, env: Record<string, string>): SessionMeta {
  (meta as any).__env = env;
  return meta;
}
