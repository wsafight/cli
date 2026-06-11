import type { NormalizedFrame } from "./types";

export type PrintMode = "human" | "json" | "verbose";

export function printFrame(f: NormalizedFrame, mode: PrintMode = "human"): void {
  if (mode === "json") { process.stdout.write(JSON.stringify(toLeanFrame(f)) + "\n"); return; }
  if (mode === "verbose") { printVerbose(f, new Date(f.ts).toISOString().slice(11, 23)); return; }
  printHuman(f);
}

function printHuman(f: NormalizedFrame): void {
  switch (f.kind) {
    case "text_delta": process.stdout.write(f.text); break;
    case "tool_use": {
      const cmd = extractShellCommand(f.input) ?? truncate(JSON.stringify(f.input), 240);
      console.log(`\n$ ${cmd}`);
      break;
    }
    case "tool_result": {
      const summary = summarizeToolResult(f.output);
      if (summary) console.log(`  ${summary}`);
      break;
    }
    case "approval_required":
      console.log(`\n⚠ APPROVAL [${f.approvalType}] id=${f.approvalId}`);
      console.log(`  ${describeApproval(f.approvalType, f.params)}`);
      break;
    case "turn_completed":
      console.log(`\n◀ turn done${f.stopReason && f.stopReason !== "end_turn" ? ` (${f.stopReason})` : ""}`);
      break;
    case "error": console.log(`\n✗ ${f.message}`); break;
    default: break;
  }
}

function printVerbose(f: NormalizedFrame, ts: string): void {
  switch (f.kind) {
    case "session_started": console.log(`[${ts}] ▶ session_started ${f.backend}${f.model ? ` model=${f.model}` : ""}`); break;
    case "turn_started": console.log(`[${ts}] ▶ turn_started ${f.turnId}`); break;
    case "text_delta": process.stdout.write(f.text); break;
    case "reasoning_delta": console.log(`\n[${ts}] 💭 ${truncate(f.text, 240)}`); break;
    case "tool_use": console.log(`\n[${ts}] 🔧 ${f.name} ${truncate(JSON.stringify(f.input), 240)}`); break;
    case "tool_result": console.log(`[${ts}] ✓ ${truncate(JSON.stringify(f.output), 240)}`); break;
    case "approval_required": console.log(`[${ts}] ⚠ approval_required (${f.approvalType}) id=${f.approvalId}`); break;
    case "turn_completed": console.log(`\n[${ts}] ◀ turn_completed${f.stopReason ? ` (${f.stopReason})` : ""}`); break;
    case "error": console.log(`\n[${ts}] ✗ ${f.message}`); break;
    case "session_closed": console.log(`[${ts}] ⏹ session_closed`); break;
  }
}

export function toLeanFrame(f: NormalizedFrame): unknown {
  const base: any = { kind: f.kind, ts: f.ts };
  switch (f.kind) {
    case "session_started": base.backend = f.backend; if (f.model) base.model = f.model; base.sid = f.sid; return base;
    case "turn_started": return base;
    case "text_delta": base.text = f.text; return base;
    case "reasoning_delta": base.text = f.text; return base;
    case "tool_use": { base.tool = f.name; const cmd = extractShellCommand(f.input); base.input = cmd ? { command: cmd } : f.input; return base; }
    case "tool_result": base.summary = summarizeToolResult(f.output) ?? ""; return base;
    case "approval_required": base.approvalId = f.approvalId; base.approvalType = f.approvalType; base.detail = describeApproval(f.approvalType, f.params); return base;
    case "turn_completed": if (f.stopReason && f.stopReason !== "end_turn") base.stopReason = f.stopReason; return base;
    case "error": base.message = f.message; return base;
    case "session_closed": return base;
  }
}

export function extractShellCommand(input: any): string | null {
  if (!input || typeof input !== "object") return null;
  const cmd = input.command ?? input.cmd;
  if (typeof cmd !== "string") return null;
  const m = cmd.match(/^(?:\S*sh|\S*bash|\S*zsh)(?:\s+-\w+)*\s+["'](.*)["']\s*$/s);
  return m ? m[1] : cmd;
}

export function summarizeToolResult(output: any): string | null {
  if (!output) return null;
  if (typeof output === "string") return truncate(output, 160);
  if (typeof output !== "object") return String(output);
  if ((output as any).approval) {
    const a = (output as any).approval;
    const reason = (output as any).reason ? `: ${(output as any).reason}` : "";
    return `[${a}]${reason}`;
  }
  const stdout = (output as any).stdout ?? (output as any).output;
  const exitCode = (output as any).exit_code ?? (output as any).exitCode;
  if (typeof stdout === "string" || typeof exitCode === "number") {
    const firstLine = typeof stdout === "string" ? stdout.split("\n").find((s) => s.trim()) ?? "" : "";
    const head = firstLine.length <= 120 ? firstLine : firstLine.slice(0, 120) + "…";
    const codePart = typeof exitCode === "number" ? ` (exit ${exitCode})` : "";
    return `${head}${codePart}`;
  }
  return truncate(JSON.stringify(output), 160);
}

export function describeApproval(type: string, params: any): string {
  if (type === "exec") {
    const cmd = String((params as any)?.command ?? "");
    const inner = cmd.match(/^(?:\S*sh|\S*bash|\S*zsh)(?:\s+-\w+)*\s+["'](.*)["']\s*$/s);
    return `command=${truncate(inner ? inner[1] : cmd, 200)}`;
  }
  if (type === "patch") {
    const paths: string[] = [];
    if (Array.isArray((params as any)?.changes)) for (const c of (params as any).changes) if (c?.path) paths.push(c.path);
    if ((params as any)?.path) paths.push((params as any).path);
    return paths.length ? `paths=${paths.slice(0, 5).join(", ")}` : truncate(JSON.stringify(params), 200);
  }
  return truncate(JSON.stringify(params), 200);
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `…(+${s.length - n})`;
}
