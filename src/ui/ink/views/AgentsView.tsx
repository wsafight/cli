import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import { detectLocale } from "../../../i18n";
import { listAllSessions, closeSession, purgeDead, getAgentDefaults, startSession } from "../../../agent/manager";
import type { Backend, SessionMeta } from "../../../agent/types";
import { AgentDetailView } from "./AgentDetailView";

function fmtAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function statusColor(s: SessionMeta["status"]): string {
  switch (s) { case "running": return "yellow"; case "idle": return "green"; case "closed": return "gray"; case "dead": return "red"; default: return "white"; }
}

type Mode = { kind: "list" } | { kind: "new"; backend: Backend; model: string; name: string; field: "backend" | "model" | "name" } | { kind: "detail"; sid: string };

export function AgentsView({ onDone }: { onDone: () => void }) {
  const zh = detectLocale() === "zh";
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  const refresh = useCallback(async () => {
    const [list, d] = await Promise.all([listAllSessions(), getAgentDefaults()]);
    setSessions(list); setDefaults(d);
    setIdx((cur) => Math.max(0, Math.min(cur, list.length - 1)));
  }, []);

  useEffect(() => { void refresh(); }, [refresh, tick]);
  useEffect(() => { const i = setInterval(() => setTick((t) => t + 1), 5000); return () => clearInterval(i); }, []);

  useInput((input, key) => {
    if (busy) return;
    if (mode.kind !== "list") return;
    if (key.escape || input === "q") { onDone(); return; }
    if (input === "n") { setMode({ kind: "new", backend: "claude", model: "", name: "", field: "backend" }); return; }
    if (!sessions || sessions.length === 0) { if (input === "r") setTick((t) => t + 1); return; }
    if (key.upArrow || input === "k") { setIdx((i) => Math.max(0, i - 1)); return; }
    if (key.downArrow || input === "j") { setIdx((i) => Math.min(sessions.length - 1, i + 1)); return; }
    if (input === "r") { setTick((t) => t + 1); return; }
    if (input === "p") { setBusy(zh ? "清理中..." : "purging..."); void purgeDead().then(() => { setBusy(null); refresh(); }); return; }
    const cur = sessions[idx]; if (!cur) return;
    if (key.return || input === "o") { setMode({ kind: "detail", sid: cur.sid }); return; }
    if (input === "d") { setBusy(`closing ${cur.sid.slice(0, 8)}...`); void closeSession(cur.sid, false).then(() => { setBusy(null); refresh(); }); return; }
    if (input === "x") { setBusy(`purging ${cur.sid.slice(0, 8)}...`); void closeSession(cur.sid, true).then(() => { setBusy(null); refresh(); }); return; }
  });

  if (mode.kind === "detail") return <AgentDetailView sid={mode.sid} onBack={() => { setMode({ kind: "list" }); refresh(); }} />;
  if (mode.kind === "new") return <NewSessionForm initial={mode} onCancel={() => setMode({ kind: "list" })} onCreated={(sid) => { setMode({ kind: "detail", sid }); }} />;

  if (!sessions) return <Box paddingX={2} paddingY={1}><Text dimColor>{zh ? "加载中..." : "loading..."}</Text></Box>;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>{zh ? "Agent 会话管理" : "Agent Sessions"}</Text>
      <Box marginTop={1}><Text dimColor>{zh ? "默认 Provider：" : "Defaults: "}{Object.keys(defaults).length === 0 ? (zh ? "（未设置）" : "(unset)") : Object.entries(defaults).map(([k, v]) => `${k}=${v.slice(0, 8)}`).join(" │ ")}</Text></Box>

      {sessions.length === 0 ? (
        <Box marginTop={2} flexDirection="column">
          <Text dimColor>{zh ? "（暂无 session — 按 n 新建）" : "(no sessions — press n to create)"}</Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          <Box><Text bold>{"sid".padEnd(10)}{"backend".padEnd(9)}{"name".padEnd(20)}{"model".padEnd(22)}{"status".padEnd(9)}{"turns".padEnd(7)}{"age".padEnd(6)}last</Text></Box>
          {sessions.map((m, i) => {
            const sel = i === idx;
            return (
              <Box key={m.sid}>
                <Text color={sel ? "cyan" : undefined} inverse={sel}>{sel ? "▶ " : "  "}</Text>
                <Text color={sel ? "cyan" : undefined}>{m.sid.slice(0, 8).padEnd(10)}</Text>
                <Text>{m.backend.padEnd(9)}</Text>
                <Text>{(m.name ?? "").slice(0, 18).padEnd(20)}</Text>
                <Text dimColor>{(m.model ?? "-").slice(0, 20).padEnd(22)}</Text>
                <Text color={statusColor(m.status)}>{m.status.padEnd(9)}</Text>
                <Text>{String(m.turnCount).padEnd(7)}</Text>
                <Text dimColor>{fmtAge(Date.now() - m.createdAt).padEnd(6)}</Text>
                <Text dimColor>{fmtAge(Date.now() - m.lastActiveAt)}</Text>
              </Box>
            );
          })}
        </Box>
      )}

      {busy && <Box marginTop={1}><Text color="yellow">⏳ {busy}</Text></Box>}

      <Box marginTop={2} gap={2}>
        <Text dimColor bold>↑↓</Text><Text dimColor>{zh ? "选择" : "select"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>Enter</Text><Text dimColor>{zh ? "进入" : "open"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>n</Text><Text dimColor>{zh ? "新建" : "new"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>d</Text><Text dimColor>{zh ? "关闭" : "close"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>x</Text><Text dimColor>{zh ? "删除" : "purge"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>r</Text><Text dimColor>{zh ? "刷新" : "refresh"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>q</Text><Text dimColor>{zh ? "返回" : "back"}</Text>
      </Box>
    </Box>
  );
}

function NewSessionForm({ initial, onCancel, onCreated }: { initial: { backend: Backend; model: string; name: string; field: "backend" | "model" | "name" }; onCancel: () => void; onCreated: (sid: string) => void }) {
  const zh = detectLocale() === "zh";
  const [backend, setBackend] = useState<Backend>(initial.backend);
  const [model, setModel] = useState(initial.model);
  const [name, setName] = useState(initial.name);
  const [field, setField] = useState(initial.field);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (submitting) return; setSubmitting(true); setError(null);
    try { const meta = await startSession({ backend, model: model.trim() || undefined, name: name.trim() || undefined }); onCreated(meta.sid); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setSubmitting(false); }
  }, [backend, model, name, submitting, onCreated]);

  useInput((ch, key) => {
    if (submitting) return;
    if (key.escape) { onCancel(); return; }
    if (key.tab || key.downArrow) { setField((f) => f === "backend" ? "model" : f === "model" ? "name" : "backend"); return; }
    if (key.upArrow) { setField((f) => f === "backend" ? "name" : f === "model" ? "backend" : "model"); return; }
    if (field === "backend") { if (key.leftArrow || key.rightArrow || ch === " ") { setBackend((b) => b === "claude" ? "codex" : "claude"); return; } if (key.return) { void submit(); return; } return; }
    if (field === "model") { if (key.return) { setField("name"); return; } if (key.backspace || key.delete) { setModel((s) => s.slice(0, -1)); return; } if (ch && !key.ctrl && ch.length === 1) setModel((s) => s + ch); return; }
    if (field === "name") { if (key.return) { void submit(); return; } if (key.backspace || key.delete) { setName((s) => s.slice(0, -1)); return; } if (ch && !key.ctrl && ch.length === 1) setName((s) => s + ch); }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text bold>{zh ? "新建 Agent Session" : "New agent session"}</Text>
      <Box marginTop={1}><Text color={field === "backend" ? "cyan" : undefined} bold={field === "backend"}>{field === "backend" ? "▶ " : "  "}{zh ? "后端" : "backend"}: {backend === "claude" ? "● claude   ○ codex" : "○ claude   ● codex"}</Text></Box>
      <Box><Text color={field === "model" ? "cyan" : undefined} bold={field === "model"}>{field === "model" ? "▶ " : "  "}{zh ? "模型" : "model"}: {model || (zh ? "（留空走默认）" : "(default)")}{field === "model" && <Text inverse> </Text>}</Text></Box>
      <Box><Text color={field === "name" ? "cyan" : undefined} bold={field === "name"}>{field === "name" ? "▶ " : "  "}{zh ? "名字" : "name"}: {name || (zh ? "（留空自动）" : "(auto)")}{field === "name" && <Text inverse> </Text>}</Text></Box>
      {error && <Box marginTop={1}><Text color="red">✗ {error}</Text></Box>}
      {submitting && <Box marginTop={1}><Text color="yellow">⏳ {zh ? "创建中..." : "creating..."}</Text></Box>}
      <Box marginTop={1} gap={2}>
        <Text dimColor bold>Tab/↑↓</Text><Text dimColor>{zh ? "切字段" : "switch"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>Enter</Text><Text dimColor>{zh ? "创建" : "create"}</Text>
        <Text dimColor>│</Text>
        <Text dimColor bold>ESC</Text><Text dimColor>{zh ? "取消" : "cancel"}</Text>
      </Box>
    </Box>
  );
}
