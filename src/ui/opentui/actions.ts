import {
  addProvider,
  getClientProvider,
  getDefaultProvider,
  getProviders,
  updateProvider,
} from "../../providers";
import {
  getDefaultBaseUrl,
  getDefaultModel,
  getDefaultSupportedClients,
  PROVIDER_TYPE_NAMES,
} from "../../providers/types";
import { identify, reset as resetAnalytics, track } from "../../analytics";
import { getUserStats } from "../../stats";
import { getAgentDefaults, listAllSessions, showSession } from "../../agent/manager";
import { listPendingApprovals } from "../../agent/storage";
import { reloadLauncherData } from "./state";
import type { AppState, SubscriptionTool } from "./types";

export async function refreshQuota(state: AppState) {
  const provider = state.clients[state.clientIdx]?.activeProvider;
  if (!provider) {
    state.quota = undefined;
    state.quotaKey = undefined;
    return;
  }
  const key = `${provider.id}:${provider.type}`;
  if (state.quotaKey === key && state.quota) return;
  state.quotaKey = key;
  const { getOfficialQuota } = await import("../../quota");
  const quota = await getOfficialQuota(provider);
  if (state.quotaKey === key) state.quota = quota;
}

export async function refreshProviders(state: AppState) {
  state.providers = await getProviders();
  state.defaultProviderId = (await getDefaultProvider())?.id;
  const bindings: Record<string, string | undefined> = {};
  for (const clientData of state.clients) {
    bindings[clientData.client.id] = (await getClientProvider(clientData.client.id))?.id;
  }
  state.clientBindings = bindings;
}

export async function openProviders(state: AppState) {
  state.screen = "providers";
  state.message = "";
  state.providerTabIdx = state.clientIdx;
  state.providerRowIdx = 0;
  await refreshProviders(state);
}

export async function openStats(state: AppState) {
  state.screen = "stats";
  state.message = "";
  state.statsLoading = true;
  state.statsError = undefined;
  const result = await getUserStats();
  if (result.success && result.data) {
    state.statsData = result.data;
  } else {
    state.statsError = result.error || (state.zh ? "未知错误" : "Unknown error");
  }
  state.statsLoading = false;
}

export async function openAgents(state: AppState) {
  state.screen = "agents";
  state.message = "";
  state.agentError = undefined;
  const [sessions, defaults] = await Promise.all([listAllSessions(), getAgentDefaults()]);
  state.agentSessions = sessions;
  state.agentDefaults = defaults;
  state.agentIdx = Math.max(0, Math.min(state.agentIdx, sessions.length - 1));
}

export async function refreshAgentDetail(state: AppState) {
  const sid = state.agentDetailSid;
  if (!sid) return;
  const [data, pending] = await Promise.all([
    showSession(sid, 200),
    listPendingApprovals(sid),
  ]);
  if (!data) {
    state.agentError = state.zh ? "Session 不存在" : "Session not found";
    state.screen = "agents";
    await openAgents(state);
    return;
  }
  state.agentDetailMeta = data.meta;
  state.agentDetailFrames = data.log;
  state.agentDetailAlive = data.alive;
  state.agentPendingApprovals = pending;
}

export async function openAgentDetail(state: AppState, sid: string) {
  state.screen = "agent-detail";
  state.agentDetailSid = sid;
  state.agentDetailInput = "";
  state.agentDetailStatus = "idle";
  state.agentError = undefined;
  await refreshAgentDetail(state);
}

export function backToLauncher(state: AppState) {
  state.screen = "launcher";
  state.message = "";
  state.apiKeyStatus = "idle";
  state.apiKeyError = undefined;
}

function setRawModeForChild(enabled: boolean) {
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(enabled);
  } catch {
    // ignore
  }
}

function authCommand(tool: SubscriptionTool) {
  return tool === "claude"
    ? ["claude", "auth", "login", "--claudeai"]
    : ["codex", "login"];
}

export async function runSubscriptionAuthCommand(tool: SubscriptionTool): Promise<{ ok: boolean; exitCode?: number | null; error?: string }> {
  const cmd = authCommand(tool);
  setRawModeForChild(false);
  try {
    const proc = Bun.spawn(cmd, { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    await proc.exited;
    return { ok: proc.exitCode === 0, exitCode: proc.exitCode };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    setRawModeForChild(false);
  }
}

export async function syncSubscriptionProviderFromLocalAuth(tool: SubscriptionTool, zh: boolean): Promise<{ ok: boolean; message: string }> {
  const { invalidateQuotaCache } = await import("../../quota");
  const providers = await getProviders();

  if (tool === "claude") {
    try {
      const chk = Bun.spawn(["claude", "auth", "status"], { stdout: "pipe", stderr: "pipe" });
      const txt = await new Response(chk.stdout).text();
      await chk.exited;
      const status = JSON.parse(txt.trim());
      if (!status.loggedIn || status.authMethod !== "claude.ai") {
        return { ok: false, message: zh ? "Claude 登录未完成" : "Claude login not completed" };
      }
      const email = status.email || "";
      const sub = status.subscriptionType || "pro";
      const name = `Claude ${sub.charAt(0).toUpperCase() + sub.slice(1)}${email ? ` (${email})` : ""}`;
      const { readClaudeAuth } = await import("../../clients/claude-credentials");
      const snapshot = await readClaudeAuth();
      const authData = snapshot.credentials || snapshot.oauthAccount
        ? { credentials: snapshot.credentials, oauthAccount: snapshot.oauthAccount }
        : undefined;
      const existing = providers.find((p) => p.type === "claude-subscription" && (p.email || "") === email);
      if (existing) {
        await updateProvider(existing.id, { authData });
        invalidateQuotaCache(existing.id, "claude-subscription");
        resetAnalytics();
        identify();
        return { ok: true, message: zh ? "Claude tokens 已更新" : "Claude tokens updated" };
      } else {
        await addProvider({
          name,
          type: "claude-subscription",
          email,
          subscriptionType: sub,
          supportedClients: getDefaultSupportedClients("claude-subscription"),
          authData,
        });
        resetAnalytics();
        identify();
        return { ok: true, message: zh ? "Claude 订阅已添加" : "Claude subscription added" };
      }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  } else {
    try {
      const fs = await import("fs/promises");
      const { homedir } = await import("os");
      const { join } = await import("path");
      const auth = JSON.parse(await fs.readFile(join(homedir(), ".codex", "auth.json"), "utf-8"));
      if (auth.auth_mode !== "chatgpt" || !auth.tokens?.access_token) {
        return { ok: false, message: zh ? "Codex 登录未完成" : "Codex login not completed" };
      }
      let email = "";
      try {
        email = JSON.parse(atob(auth.tokens.id_token.split(".")[1])).email || "";
      } catch {
        // ignore
      }
      const existing = providers.find((p) => p.type === "codex-subscription" && (p.email || "") === email);
      if (existing) {
        await updateProvider(existing.id, { authData: auth });
        invalidateQuotaCache(existing.id, "codex-subscription");
        resetAnalytics();
        identify();
        return { ok: true, message: zh ? "Codex tokens 已更新" : "Codex tokens updated" };
      } else {
        await addProvider({
          name: email ? `Codex Plus (${email})` : "Codex Subscription",
          type: "codex-subscription",
          email: email || undefined,
          supportedClients: getDefaultSupportedClients("codex-subscription"),
          authData: auth,
        });
        resetAnalytics();
        identify();
        return { ok: true, message: zh ? "Codex 订阅已添加" : "Codex subscription added" };
      }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }
}

export async function finishProviderAdd(state: AppState) {
  const name = PROVIDER_TYPE_NAMES[state.addType]?.[state.zh ? "zh" : "en"] || state.addType;
  const ctxNum = state.addCtx ? Number.parseInt(state.addCtx, 10) : NaN;
  await addProvider({
    name,
    type: state.addType,
    apiKey: state.addKey,
    baseUrl: state.addUrl || getDefaultBaseUrl(state.addType),
    model: state.addModel || getDefaultModel(state.addType),
    modelContextWindow: Number.isFinite(ctxNum) && ctxNum > 0 ? ctxNum : undefined,
    supportedClients: getDefaultSupportedClients(state.addType),
  });
  track("provider_added", { provider_type: state.addType, method: "manual" });
  resetAnalytics();
  identify();
  await refreshProviders(state);
  await reloadLauncherData(state);
  state.screen = "providers";
  state.providerRowIdx = 0;
  state.message = state.zh ? "已添加服务商" : "Provider added";
}

export async function openClientVersions(state: AppState) {
  state.screen = "client-versions";
  state.message = "";
  state.clientVersionsClientIdx = Math.max(0, Math.min(state.clientVersionsClientIdx, state.clients.length - 1));
  await loadClientVersions(state);
}

export async function loadClientVersions(state: AppState) {
  const clientData = state.clients[state.clientVersionsClientIdx];
  if (!clientData) return;
  state.clientVersionsLoading = true;
  state.clientVersionsError = undefined;
  state.clientVersions = [];
  state.clientVersionsIdx = 0;
  try {
    const { listAvailableVersions, getInstalledVersion } = await import("../../installer-versions");
    const [versions, installed] = await Promise.all([
      listAvailableVersions(clientData.client.package),
      getInstalledVersion(clientData.client),
    ]);
    state.clientVersions = versions.map((v) => ({ ...v, isCurrent: v.version === installed }));
  } catch (error) {
    state.clientVersionsError = error instanceof Error ? error.message : String(error);
  } finally {
    state.clientVersionsLoading = false;
  }
}

export async function installClientVersion(state: AppState, version: string) {
  const clientData = state.clients[state.clientVersionsClientIdx];
  if (!clientData) return;
  const { installAtVersion } = await import("../../installer-versions");
  await installAtVersion(clientData.client, version);
  state.message = state.zh ? `已切换到 ${version}` : `Switched to ${version}`;
  await loadClientVersions(state);
}

export async function dismissKeyGuide(action: "skip" | "never") {
  const { TAKO_DIR } = await import("../../config");
  const { join } = await import("path");
  const file = join(TAKO_DIR, ".key-prompt.json");
  const data = action === "never" ? { never: true } : { dismissed: new Date().toISOString().slice(0, 10) };
  await Bun.write(file, JSON.stringify(data));
}

export async function shouldShowKeyGuide(): Promise<boolean> {
  const { TAKO_DIR, hasApiKey } = await import("../../config");
  if (await hasApiKey()) return false;
  const { join } = await import("path");
  const file = join(TAKO_DIR, ".key-prompt.json");
  let data: { dismissed?: string; never?: boolean } = {};
  try {
    data = await Bun.file(file).json();
  } catch {
    data = {};
  }
  if (data.never) return false;
  const today = new Date().toISOString().slice(0, 10);
  if (data.dismissed === today) return false;
  return true;
}
