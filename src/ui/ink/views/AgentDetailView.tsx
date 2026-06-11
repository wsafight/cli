import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useInput, useStdin } from "ink";
import { detectLocale } from "../../../i18n";
import { cancelSession, sendToSession, showSession } from "../../../agent/manager";
import { logPath, listPendingApprovals, writeApprovalResponse, type ApprovalRequest } from "../../../agent/storage";
import type { NormalizedFrame, SessionMeta } from "../../../agent/types";

const POLL_MS = 300;
const MAX_FRAMES = 200;

function fmtAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function frameLine(f: NormalizedFrame): { color?: string; text: string; dim?: boolean } {
  const ts = new Date(f.ts).toISOString().slice(11, 19);
  switch (f.kind) {
    case "session_started": return { dim: true, text: `[${ts}] ▶ session_started ${f.backend}` };
    case "turn_started": return { color: "cyan", text: `[${ts}] ▶ turn_started` };
    case "text_delta": return { text: f.text };
    case "reasoning_delta": return { dim: true, text: `[${ts}] 💭 ${f.text.slice(0, 200)}` };
    case "tool_use": return { color: "yellow", text: `[${ts}] 🔧 ${f.name} ${JSON.stringify(f.input).slice(0, 160)}` };
    case "tool_result": return { color: "green", text: `[${ts}] ✓ result` };
    case "approval_required": return { color: "magenta", text: `[${ts}] ⚠ approval(${f.approvalType})` };
    case "turn_completed": return { color: "cyan", text: `[${ts}] ◀ turn_completed` };
    case "error": return { color: "red", text: `[${ts}] ✗ ${f.message}` };
    case "session_closed": return { dim: true, text: `[${ts}] ⏹ closed` };
    default: return { text: JSON.stringify(f) };
  }
}

export function AgentDetailView({ sid, onBack }: { sid: string; onBack: () => void }) {
  const zh = detectLocale() === "zh";
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [frames, setFrames] = useState<NormalizedFrame[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"idle" | "sending" | "cancelling">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ApprovalRequest[]>([]);
  const posRef = useRef(0);

  const refreshMeta = useCallback(async () => {
    const data = await showSession(sid, MAX_FRAMES);
    if (!data) return;
    setMeta(data.meta); setFrames(data.log);
    try { const fs = await import("node:fs/promises"); const s = await fs.stat(logPath(sid)); posRef.current = s.size; } catch { posRef.current = 0; }
  }, [sid]);

  useEffect(() => { void refreshMeta(); }, [refreshMeta]);

  useEffect(() => {
    let stopped = false; let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (stopped) return;
      try {
        const fs = await import("node:fs/promises");
        const s = await fs.stat(logPath(sid));
        if (s.size > posRef.current) {
          const fd = await fs.open(logPath(sid), "r");
          const buf = Buffer.alloc(s.size - posRef.current);
          await fd.read(buf, 0, buf.length, posRef.current); await fd.close(); posRef.current = s.size;
          const newFrames: NormalizedFrame[] = [];
          for (const line of buf.toString("utf-8").split("\n")) { if (!line.trim()) continue; try { newFrames.push(JSON.parse(line)); } catch { /* skip */ } }
          if (newFrames.length) setFrames((prev) => [...prev, ...newFrames].slice(-MAX_FRAMES));
        }
        if (Math.random() < 0.1) { const data = await showSession(sid, 0); if (data) setMeta(data.meta); }
        setPending(await listPendingApprovals(sid));
      } catch { /* retry */ }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [sid]);

  const submit = useCallback(async () => {
    if (busy !== "idle" || !input.trim()) return;
    const prompt = input; setInput(""); setError(null); setBusy("sending");
    try { await sendToSession(sid, prompt); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy("idle"); const data = await showSession(sid, 0); if (data) setMeta(data.meta); }
  }, [sid, input, busy]);

  const doCancel = useCallback(async () => {
    if (busy !== "sending") return onBack();
    setBusy("cancelling"); await cancelSession(sid).catch(() => {});
  }, [busy, sid, onBack]);

  const approveTopmost = useCallback(async (allow: boolean) => {
    const top = pending[0]; if (!top) return;
    await writeApprovalResponse(sid, top.approvalId, { decision: allow ? "allow" : "deny", by: "tui", decidedAt: Date.now() });
    setPending((p) => p.filter((x) => x.approvalId !== top.approvalId));
  }, [pending, sid]);

  useInput((ch, key) => {
    if (key.ctrl && ch === "y") { void approveTopmost(true); return; }
    if (key.ctrl && ch === "n") { void approveTopmost(false); return; }
    if (key.escape) { void doCancel(); return; }
    if (key.ctrl && ch === "c") { void doCancel(); return; }
    if (key.ctrl && ch === "d") { onBack(); return; }
    if (key.return) { void submit(); return; }
    if (key.backspace || key.delete) { setInput((p) => p.slice(0, -1)); return; }
    if (input.length === 0 && ch === "q") { onBack(); return; }
    if (ch && !key.ctrl && ch.length === 1) setInput((p) => p + ch);
  });

  if (!meta) return <Box paddingX={2} paddingY={1}><Text dimColor>{zh ? "加载中..." : "loading..."}</Text></Box>;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box><Text bold>Session </Text><Text color="cyan">{meta.sid.slice(0, 8)}</Text><Text>  </Text><Text dimColor>{meta.name}</Text></Box>
      <Box><Text dimColor>{meta.backend} · {meta.model ?? "-"} · status={meta.status} · turns={meta.turnCount}</Text></Box>
      <Box><Text dimColor>{zh ? "工作目录：" : "cwd: "}{meta.workdir}</Text></Box>

      {pending.length > 0 && (
        <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1}>
          <Text color="magenta" bold>⚠ {pending.length} {zh ? "个待审批" : "pending"} — <Text bold>Ctrl-Y</Text> {zh ? "批准" : "allow"} / <Text bold>Ctrl-N</Text> {zh ? "拒绝" : "deny"}</Text>
          {pending.slice(0, 3).map((r, i) => (<Text key={r.approvalId} color={i === 0 ? "magenta" : undefined} dimColor={i !== 0}>{i === 0 ? "▶ " : "  "}[{r.approvalType}] {r.approvalId.slice(0, 12)}</Text>))}
        </Box>
      )}

      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        {frames.length === 0 ? (<Text dimColor>{zh ? "（暂无日志）" : "(no log yet)"}</Text>) : (
          frames.slice(-30).map((f, i) => { const line = frameLine(f); return <Text key={i} color={line.color} dimColor={line.dim}>{line.text || " "}</Text>; })
        )}
      </Box>

      {error && <Box marginTop={1}><Text color="red">✗ {error}</Text></Box>}

      <Box marginTop={1}>
        <Text color="cyan" bold>{busy === "sending" ? "⏳ " : busy === "cancelling" ? "✋ " : "▶ "}</Text>
        <Text>{input}</Text>
        {busy === "idle" && <Text inverse> </Text>}
        {busy === "sending" && <Text dimColor>  ({zh ? "正在发送…ESC 取消" : "sending… ESC cancel"})</Text>}
      </Box>

      <Box marginTop={1} gap={2}>
        <Text dimColor bold>Enter</Text><Text dimColor>{zh ? "发送" : "send"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>^Y/^N</Text><Text dimColor>{zh ? "批/拒" : "allow/deny"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>ESC</Text><Text dimColor>{zh ? "返回" : "back"}</Text>
      </Box>
    </Box>
  );
}
