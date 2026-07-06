import { getDefaultModel } from "../../providers/types";
import { getLocale } from "../../i18n";
import { loadLauncherData as loadSharedLauncherData } from "../shared/launcher-data";
import { buildOptionRows, enabledWithProviderDefaultModel } from "../shared/launch-options";
import { LANGUAGES } from "./theme";
import type { AppState, ClientData, ProviderInputMode } from "./types";

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
    modelPickerMode: "collapsed",
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
    keyGuideIdx: 0,
    clientVersions: [],
    clientVersionsClientIdx: 0,
    clientVersionsIdx: 0,
    clientVersionsLoading: false,
  };
}

export async function loadLauncherData(): Promise<Pick<AppState, "clients" | "clientIdx" | "focus" | "projectIdx" | "optionIdx" | "zh" | "pickCounts">> {
  const launcher = await loadSharedLauncherData(48);
  const clients: ClientData[] = launcher.clients.map((client) => ({
    ...client,
    enabled: enabledWithProviderDefaultModel(
      new Set(client.lastSelectedOptionIds),
      client.launchOptions,
      client.activeProvider?.model,
    ),
  }));

  return {
    clients,
    clientIdx: launcher.defaultIdx,
    focus: "tabs",
    projectIdx: 0,
    optionIdx: 0,
    zh: launcher.zh,
    pickCounts: launcher.pickCounts,
  };
}

export async function reloadLauncherData(state: AppState) {
  const currentId = state.clients[state.clientIdx]?.client.id;
  const next = await loadLauncherData();
  state.clients = next.clients;
  state.zh = next.zh;
  state.pickCounts = next.pickCounts;
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
  state.modelPickerMode = "collapsed";
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
