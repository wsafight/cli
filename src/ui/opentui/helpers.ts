import type { KeyEvent } from "@opentui/core";
import type { LaunchOption } from "../../clients";
import type { Provider } from "../../providers/types";
import type { SessionMeta } from "../../agent/types";
import { THEME } from "./theme";
import type { AppState, ClientData, DetailAction, LauncherResult, OptionRow } from "./types";

export function buildOptionRows(opts: LaunchOption[], zh: boolean): OptionRow[] {
  const rows: OptionRow[] = [];
  const seen = new Set<string>();
  for (const opt of opts) {
    if (!opt.group) {
      rows.push({ kind: "flag", opt });
      continue;
    }
    if (!seen.has(opt.group)) {
      seen.add(opt.group);
      rows.push({
        kind: "group",
        group: opt.group,
        title: opt.group === "model" ? (zh ? "模型" : "Model") : opt.group,
      });
    }
  }
  rows.push({ kind: "provider", title: zh ? "服务商" : "Provider" });
  return rows;
}

export function getGroupSelection(opts: LaunchOption[], enabled: Set<string>, group: string) {
  return opts.find((o) => o.group === group && enabled.has(o.id));
}

export function selectedArgs(current: ClientData): Pick<Extract<LauncherResult, { type: "launch" }>, "args" | "envVars" | "selectedOptionIds"> {
  const args: string[] = [];
  const envVars: Record<string, string> = {};
  const selectedOptionIds: string[] = [];
  for (const option of current.launchOptions) {
    if (!current.enabled.has(option.id)) continue;
    args.push(...option.args);
    if (option.envVars) Object.assign(envVars, option.envVars);
    selectedOptionIds.push(option.id);
  }
  return { args, envVars, selectedOptionIds };
}

export function cycleGroupSelection(current: ClientData, group: string) {
  const groupOpts = current.launchOptions.filter((o) => o.group === group);
  if (groupOpts.length === 0) return;
  const currentIdx = groupOpts.findIndex((o) => current.enabled.has(o.id));
  for (const opt of groupOpts) current.enabled.delete(opt.id);
  if (currentIdx < groupOpts.length - 1) current.enabled.add(groupOpts[currentIdx + 1].id);
}

export function restoreStdin() {
  try {
    process.stdin.removeAllListeners();
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.unref();
  } catch {
    // ignore
  }
}

export function keyChar(key: KeyEvent): string {
  if (key.ctrl || key.meta || key.option) return "";
  if (key.sequence && key.sequence.length === 1 && key.sequence >= " ") return key.sequence;
  if (key.name && key.name.length === 1) return key.name;
  return "";
}

export function isPlain(key: KeyEvent) {
  return !key.ctrl && !key.meta && !key.option;
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 4)}${"*".repeat(Math.min(value.length - 8, 20))}${value.slice(-4)}`;
}

export function getSelectedProvider(state: AppState) {
  return state.providers.find((p) => p.id === state.providerSelectedId);
}

export function detailActions(provider: Provider, state: AppState): DetailAction[] {
  const subscription = provider.type === "claude-subscription" || provider.type === "codex-subscription";
  return [
    ...(provider.id !== state.defaultProviderId ? (["default"] as DetailAction[]) : []),
    ...(subscription ? (["relogin"] as DetailAction[]) : (["rekey"] as DetailAction[])),
    ...(provider.builtin ? [] : (["delete"] as DetailAction[])),
    "back",
  ];
}

export function actionLabel(action: DetailAction, zh: boolean) {
  const labels: Record<DetailAction, string> = {
    default: zh ? "设为默认" : "Set default",
    rekey: zh ? "更新 Key" : "Update key",
    relogin: zh ? "重新登录" : "Re-login",
    delete: zh ? "删除" : "Delete",
    back: zh ? "返回" : "Back",
  };
  return labels[action];
}

export function fmtAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function statusColor(status: SessionMeta["status"]): string {
  switch (status) {
    case "running":
      return THEME.yellow;
    case "awaiting_approval":
      return THEME.magenta;
    case "idle":
      return THEME.green;
    case "closed":
      return THEME.gray;
    case "dead":
      return THEME.red;
    default:
      return THEME.text;
  }
}

export function statusMarker(status: SessionMeta["status"]): string {
  switch (status) {
    case "running":
      return "~";
    case "awaiting_approval":
      return "?";
    case "idle":
      return "*";
    case "dead":
      return "!";
    default:
      return "-";
  }
}

export function inputBackspace(state: AppState) {
  if (state.screen === "config") {
    state.apiKeyValue = state.apiKeyValue.slice(0, -1);
    state.apiKeyStatus = "idle";
    return;
  }
  if (state.screen === "agent-new") {
    if (state.agentField === "model") state.agentModel = state.agentModel.slice(0, -1);
    if (state.agentField === "name") state.agentName = state.agentName.slice(0, -1);
    return;
  }
  if (state.screen === "agent-detail") {
    state.agentDetailInput = state.agentDetailInput.slice(0, -1);
    return;
  }
  switch (state.providerInputMode) {
    case "add-key":
    case "rekey":
      state.addKey = state.addKey.slice(0, -1);
      break;
    case "add-url":
      state.addUrl = state.addUrl.slice(0, -1);
      break;
    case "add-model":
      state.addModel = state.addModel.slice(0, -1);
      break;
    case "add-ctx":
      state.addCtx = state.addCtx.slice(0, -1);
      break;
  }
}

export function appendInput(state: AppState, char: string) {
  if (!char) return;
  if (state.screen === "config") {
    state.apiKeyValue += char;
    state.apiKeyStatus = "idle";
    return;
  }
  if (state.screen === "agent-new") {
    if (state.agentField === "model") state.agentModel += char;
    if (state.agentField === "name") state.agentName += char;
    return;
  }
  if (state.screen === "agent-detail") {
    state.agentDetailInput += char;
    return;
  }
  switch (state.providerInputMode) {
    case "add-key":
    case "rekey":
      state.addKey += char;
      break;
    case "add-url":
      state.addUrl += char;
      break;
    case "add-model":
      state.addModel += char;
      break;
    case "add-ctx":
      if (/^[0-9]$/.test(char)) state.addCtx += char;
      break;
  }
}
