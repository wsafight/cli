import {
  DISPLAY_PER_CLIENT,
  formatLastUsed,
  formatProjectPath,
  getLastClientForCwd,
  getLastSelectedOptionsForClient,
  getRecentProjectsForClient,
} from "../../project-history";
import { getAllClients } from "../../clients";
import { getClientLaunchOptions } from "../../clients/base";
import { getClientProvider, getDefaultProvider, getProvidersForClient } from "../../providers";
import { getDefaultModel } from "../../providers/types";
import { getLocale } from "../../i18n";
import { LANGUAGES } from "./theme";
import { buildOptionRows } from "./helpers";
import type { AppState, ClientData, ProjectItem, ProviderInputMode } from "./types";

export async function createInitialState(): Promise<AppState> {
  const launcher = await loadLauncherData();
  const locale = getLocale();
  return {
    ...launcher,
    screen: "launcher",
    busy: false,
    message: "",
    providers: [],
    defaultProviderId: undefined,
    clientBindings: {},
    providerTabIdx: launcher.clientIdx,
    providerRowIdx: 0,
    providerDetailIdx: 0,
    optionPickerGroup: undefined,
    optionPickerIdx: 0,
    scrollOffset: 0,
    scrollScreen: "launcher",
    providerSelectedId: undefined,
    providerInputMode: "add-key",
    addType: "tako",
    addKey: "",
    addUrl: "",
    addModel: "",
    addCtx: "",
    statsLoading: false,
    apiKeyValue: "",
    apiKeyStatus: "idle",
    languageIdx: Math.max(0, LANGUAGES.findIndex((l) => l.value === locale)),
    agentDefaults: {},
    agentIdx: 0,
    agentDetailFrames: [],
    agentDetailInput: "",
    agentDetailStatus: "idle",
    agentPendingApprovals: [],
    agentBackend: "claude",
    agentModel: "",
    agentName: "",
    agentField: "backend",
  };
}

export async function loadLauncherData(): Promise<Pick<AppState, "clients" | "clientIdx" | "focus" | "projectIdx" | "optionIdx" | "zh">> {
  const all = getAllClients();
  const lastId = await getLastClientForCwd();
  const defaultProv = await getDefaultProvider();
  const zh = getLocale() === "zh";

  const sorted = [...all].sort((a, b) => {
    if (a.id === lastId) return -1;
    if (b.id === lastId) return 1;
    return 0;
  });

  const clients: ClientData[] = [];
  for (const client of sorted) {
    const recent = await getRecentProjectsForClient(client.id, DISPLAY_PER_CLIENT, true);
    const cwd = process.cwd();
    const projects: ProjectItem[] = [
      {
        label: zh ? "在当前目录启动" : "Launch in current directory",
        hint: formatProjectPath(cwd, 48),
        path: cwd,
      },
      ...recent.map((p) => ({
        label: formatProjectPath(p.path, 48),
        hint: formatLastUsed(p.lastLaunchedAt),
        path: p.path,
      })),
    ];
    const providers = await getProvidersForClient(client.id);
    const bound = await getClientProvider(client.id);
    const activeProvider =
      bound || providers.find((p) => p.id === defaultProv?.id) || providers[0];
    const launchOptions = getClientLaunchOptions(client, activeProvider);
    const validIds = new Set(launchOptions.map((o) => o.id));
    const savedIds = await getLastSelectedOptionsForClient(client.id);
    const enabled = new Set(savedIds.filter((id) => validIds.has(id)));
    const providerModelId = activeProvider?.model ? `model-${activeProvider.model}` : undefined;
    if (
      providerModelId &&
      launchOptions.some((o) => o.id === providerModelId) &&
      !launchOptions.some((o) => o.group === "model" && enabled.has(o.id))
    ) {
      enabled.add(providerModelId);
    }
    clients.push({ client, projects, providers, activeProvider, launchOptions, enabled });
  }

  return { clients, clientIdx: 0, focus: "tabs", projectIdx: 0, optionIdx: 0, zh };
}

export async function reloadLauncherData(state: AppState) {
  const currentId = state.clients[state.clientIdx]?.client.id;
  const next = await loadLauncherData();
  state.clients = next.clients;
  state.zh = next.zh;
  const idx = currentId ? state.clients.findIndex((c) => c.client.id === currentId) : -1;
  state.clientIdx = idx >= 0 ? idx : 0;
  clampIndexes(state);
}

export function clampIndexes(state: AppState) {
  const current = state.clients[state.clientIdx];
  if (!current) return;
  const rows = buildOptionRows(current.launchOptions, state.zh);
  state.projectIdx = Math.max(0, Math.min(state.projectIdx, current.projects.length - 1));
  state.optionIdx = Math.max(0, Math.min(state.optionIdx, rows.length - 1));
}

export function resetForClient(state: AppState) {
  if (state.focus === "options") state.focus = "tabs";
  state.projectIdx = 0;
  state.optionIdx = 0;
  state.optionPickerGroup = undefined;
  state.optionPickerIdx = 0;
}

export function startProviderInput(state: AppState, mode: ProviderInputMode) {
  state.screen = "provider-input";
  state.providerInputMode = mode;
  state.providerRowIdx = 0;
  state.addKey = "";
  if (mode === "add-key") {
    state.addUrl = "";
    state.addModel = getDefaultModel(state.addType) || "";
    state.addCtx = "";
  }
}
