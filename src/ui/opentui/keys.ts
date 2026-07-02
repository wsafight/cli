import type { CliRenderer, KeyEvent } from "@opentui/core";
import {
  deleteProvider,
  detectProviders,
  mergeDetectedProviders,
  resolveProviderContext,
  setClientProvider,
  setDefaultProvider,
  updateProvider,
} from "../../providers";
import { getModelChoices, isProviderCompatible } from "../../providers/types";
import { ADD_TYPES } from "./theme";
import { redraw } from "./render";
import {
  appendInput,
  buildOptionRows,
  detailActions,
  getGroupSelection,
  getSelectedProvider,
  inputBackspace,
  isPlain,
  keyChar,
  selectedArgs,
} from "./helpers";
import { reloadLauncherData, resetForClient, startProviderInput } from "./state";
import {
  backToLauncher,
  openAgentDetail,
  finishProviderAdd,
  openAgents,
  openProviders,
  openStats,
  refreshAgentDetail,
  refreshProviders,
} from "./actions";
import { cancelSession, closeSession, purgeDead, sendToSession, startSession } from "../../agent/manager";
import { writeApprovalResponse } from "../../agent/storage";
import { identify, reset as resetAnalytics } from "../../analytics";
import type { AppState, LauncherResult } from "./types";

export function handleLauncherKey(
  key: KeyEvent,
  state: AppState,
  renderer: CliRenderer,
  finish: (result: LauncherResult | null) => void,
  runAsync: (fn: () => Promise<void>) => void,
) {
  const current = state.clients[state.clientIdx];
  if (!current) return;
  const rows = buildOptionRows(current.launchOptions, state.zh);
  const name = key.name;
  const plain = isPlain(key);

  if (name === "q" || name === "escape") {
    finish({ type: "exit" });
    return;
  }
  if (plain && name === "a") {
    runAsync(() => openAgents(state));
    return;
  }
  if (plain && name === "p") {
    runAsync(() => openProviders(state));
    return;
  }
  if (plain && name === "s") {
    runAsync(() => openStats(state));
    return;
  }
  if (plain && name === "c") {
    state.screen = "config";
    state.apiKeyValue = "";
    state.apiKeyStatus = "idle";
    state.apiKeyError = undefined;
    redraw(renderer, state);
    return;
  }
  if (plain && name === "l") {
    state.screen = "language";
    redraw(renderer, state);
    return;
  }

  const numeric = Number.parseInt(name, 10);
  if (plain && numeric >= 1 && numeric <= state.clients.length) {
    state.clientIdx = numeric - 1;
    resetForClient(state);
    redraw(renderer, state);
    return;
  }

  if (name === "tab") {
    if (key.shift) state.clientIdx = state.clientIdx > 0 ? state.clientIdx - 1 : state.clients.length - 1;
    else state.clientIdx = state.clientIdx < state.clients.length - 1 ? state.clientIdx + 1 : 0;
    resetForClient(state);
    redraw(renderer, state);
    return;
  }

  if (name === "left") {
    if (state.focus === "tabs") {
      state.clientIdx = state.clientIdx > 0 ? state.clientIdx - 1 : state.clients.length - 1;
      resetForClient(state);
    } else if (state.focus === "options") {
      state.focus = "projects";
      state.projectIdx = Math.min(state.projectIdx, current.projects.length - 1);
    }
    redraw(renderer, state);
    return;
  }
  if (name === "right") {
    if (state.focus === "tabs") {
      state.clientIdx = state.clientIdx < state.clients.length - 1 ? state.clientIdx + 1 : 0;
      resetForClient(state);
    } else if (state.focus === "projects" && rows.length > 0) {
      state.focus = "options";
      state.optionIdx = Math.min(state.optionIdx, rows.length - 1);
    }
    redraw(renderer, state);
    return;
  }
  if (name === "down") {
    if (state.focus === "tabs") {
      state.focus = "projects";
    } else if (state.focus === "projects") {
      if (state.projectIdx < current.projects.length - 1) state.projectIdx += 1;
    } else if (state.optionIdx < rows.length - 1) state.optionIdx += 1;
    redraw(renderer, state);
    return;
  }
  if (name === "up") {
    if (state.focus === "options") {
      if (state.optionIdx > 0) state.optionIdx -= 1;
      else state.focus = "tabs";
    } else if (state.focus === "projects") {
      if (state.projectIdx > 0) state.projectIdx -= 1;
      else state.focus = "tabs";
    }
    redraw(renderer, state);
    return;
  }

  if ((name === "space" || name === "return") && state.focus === "options") {
    const row = rows[state.optionIdx];
    if (row?.kind === "provider") {
      runAsync(() => openProviders(state));
      return;
    }
    if (row?.kind === "flag") {
      if (current.enabled.has(row.opt.id)) current.enabled.delete(row.opt.id);
      else current.enabled.add(row.opt.id);
      redraw(renderer, state);
      return;
    }
    if (row?.kind === "group") {
      const groupOptions = current.launchOptions.filter((option) => option.group === row.group);
      const selected = getGroupSelection(current.launchOptions, current.enabled, row.group);
      const selectedIdx = selected ? groupOptions.findIndex((option) => option.id === selected.id) + 1 : 0;
      state.optionPickerGroup = row.group;
      state.optionPickerIdx = Math.max(0, selectedIdx);
      state.screen = "option-picker";
      redraw(renderer, state);
      return;
    }
  }

  if (name === "return") {
    const project = current.projects[state.projectIdx];
    const selected = selectedArgs(current);
    finish({
      type: "launch",
      clientId: current.client.id,
      projectPath: project?.path,
      ...selected,
    });
  }
}

export function handleOptionPickerKey(key: KeyEvent, state: AppState, renderer: CliRenderer) {
  const current = state.clients[state.clientIdx];
  const group = state.optionPickerGroup;
  if (!current || !group) {
    state.screen = "launcher";
    redraw(renderer, state);
    return;
  }

  const groupOptions = current.launchOptions.filter((option) => option.group === group);
  const totalRows = groupOptions.length + 1;
  const name = key.name;

  if (name === "escape" || (isPlain(key) && name === "q")) {
    state.screen = "launcher";
    redraw(renderer, state);
    return;
  }
  if (name === "up") {
    state.optionPickerIdx = state.optionPickerIdx > 0 ? state.optionPickerIdx - 1 : totalRows - 1;
    redraw(renderer, state);
    return;
  }
  if (name === "down") {
    state.optionPickerIdx = state.optionPickerIdx < totalRows - 1 ? state.optionPickerIdx + 1 : 0;
    redraw(renderer, state);
    return;
  }
  if (name === "return" || name === "space") {
    for (const option of groupOptions) current.enabled.delete(option.id);
    if (state.optionPickerIdx > 0) {
      const selected = groupOptions[state.optionPickerIdx - 1];
      if (selected) current.enabled.add(selected.id);
    }
    state.screen = "launcher";
    redraw(renderer, state);
  }
}

export function handleProvidersKey(
  key: KeyEvent,
  state: AppState,
  renderer: CliRenderer,
  runAsync: (fn: () => Promise<void>) => void,
) {
  const client = state.clients[state.providerTabIdx]?.client;
  const compatible = client ? state.providers.filter((p) => isProviderCompatible(p, client.id)) : [];
  const totalRows = compatible.length + 3;
  const name = key.name;
  const plain = isPlain(key);

  if (name === "left") state.providerTabIdx = state.providerTabIdx > 0 ? state.providerTabIdx - 1 : state.clients.length - 1;
  else if (name === "right") state.providerTabIdx = state.providerTabIdx < state.clients.length - 1 ? state.providerTabIdx + 1 : 0;
  else if (name === "up") state.providerRowIdx = state.providerRowIdx > 0 ? state.providerRowIdx - 1 : totalRows - 1;
  else if (name === "down") state.providerRowIdx = state.providerRowIdx < totalRows - 1 ? state.providerRowIdx + 1 : 0;
  else if ((plain && (name === "d" || name === "e")) && state.providerRowIdx < compatible.length) {
    state.providerSelectedId = compatible[state.providerRowIdx].id;
    state.providerDetailIdx = 0;
    state.screen = "provider-detail";
  } else if (name === "return") {
    if (state.providerRowIdx < compatible.length && client) {
      const provider = compatible[state.providerRowIdx];
      runAsync(async () => {
        await setClientProvider(client.id, provider.id);
        let syncError: string | undefined;
        if (client.setupConfigFiles) {
          try {
            await client.setupConfigFiles(resolveProviderContext(provider));
          } catch (error) {
            syncError = error instanceof Error ? error.message : String(error);
          }
        }
        await refreshProviders(state);
        await reloadLauncherData(state);
        state.clientIdx = state.clients.findIndex((c) => c.client.id === client.id);
        if (state.clientIdx < 0) state.clientIdx = 0;
        backToLauncher(state);
        state.message = syncError
          ? (state.zh ? `服务商已绑定，配置同步失败：${syncError}` : `Provider bound, config sync failed: ${syncError}`)
          : (state.zh ? "服务商已绑定" : "Provider bound");
      });
      return;
    }
    if (state.providerRowIdx === compatible.length) {
      state.screen = "provider-add-type";
      state.providerRowIdx = 0;
    } else if (state.providerRowIdx === compatible.length + 1) {
      runAsync(async () => {
        const detected = await detectProviders();
        const added = await mergeDetectedProviders(detected);
        if (added > 0) {
          resetAnalytics();
          identify();
        }
        await refreshProviders(state);
        await reloadLauncherData(state);
        state.message = state.zh ? `扫描完成，新增 ${added} 个` : `Scan complete, ${added} added`;
      });
      return;
    } else {
      backToLauncher(state);
    }
  }
  redraw(renderer, state);
}

export function handleProviderDetailKey(
  key: KeyEvent,
  state: AppState,
  renderer: CliRenderer,
  finish: (result: LauncherResult | null) => void,
  runAsync: (fn: () => Promise<void>) => void,
) {
  const provider = getSelectedProvider(state);
  if (!provider) {
    state.screen = "providers";
    redraw(renderer, state);
    return;
  }
  const actions = detailActions(provider, state);
  if (key.name === "up" || key.name === "left") state.providerDetailIdx = state.providerDetailIdx > 0 ? state.providerDetailIdx - 1 : actions.length - 1;
  else if (key.name === "down" || key.name === "right") state.providerDetailIdx = state.providerDetailIdx < actions.length - 1 ? state.providerDetailIdx + 1 : 0;
  else if (key.name === "return") {
    const action = actions[state.providerDetailIdx];
    if (action === "back") state.screen = "providers";
    if (action === "default") {
      runAsync(async () => {
        await setDefaultProvider(provider.id);
        await refreshProviders(state);
        await reloadLauncherData(state);
        state.screen = "providers";
        state.message = state.zh ? "已设为默认" : "Set as default";
      });
      return;
    }
    if (action === "delete") {
      runAsync(async () => {
        await deleteProvider(provider.id);
        await refreshProviders(state);
        await reloadLauncherData(state);
        state.screen = "providers";
        state.message = state.zh ? "已删除" : "Deleted";
      });
      return;
    }
    if (action === "rekey") {
      state.addType = provider.type;
      startProviderInput(state, "rekey");
    }
    if (action === "relogin") {
      finish({ type: "provider-login", tool: provider.type === "codex-subscription" ? "codex" : "claude" });
      return;
    }
  }
  redraw(renderer, state);
}

export function handleProviderAddTypeKey(
  key: KeyEvent,
  state: AppState,
  renderer: CliRenderer,
  finish: (result: LauncherResult | null) => void,
) {
  if (key.name === "up") state.providerRowIdx = state.providerRowIdx > 0 ? state.providerRowIdx - 1 : ADD_TYPES.length - 1;
  else if (key.name === "down") state.providerRowIdx = state.providerRowIdx < ADD_TYPES.length - 1 ? state.providerRowIdx + 1 : 0;
  else if (key.name === "return") {
    state.addType = ADD_TYPES[state.providerRowIdx];
    if (state.addType === "claude-subscription" || state.addType === "codex-subscription") {
      finish({ type: "provider-login", tool: state.addType === "codex-subscription" ? "codex" : "claude" });
      return;
    }
    startProviderInput(state, "add-key");
  }
  redraw(renderer, state);
}

export function handleProviderInputKey(
  key: KeyEvent,
  state: AppState,
  renderer: CliRenderer,
  runAsync: (fn: () => Promise<void>) => void,
) {
  const name = key.name;
  const choices = state.providerInputMode === "add-model" ? getModelChoices(state.addType) : undefined;

  if (choices) {
    if (name === "up") state.providerRowIdx = state.providerRowIdx > 0 ? state.providerRowIdx - 1 : choices.length - 1;
    else if (name === "down") state.providerRowIdx = state.providerRowIdx < choices.length - 1 ? state.providerRowIdx + 1 : 0;
    else if (name === "return") {
      state.addModel = choices[state.providerRowIdx];
      runAsync(() => finishProviderAdd(state));
      return;
    }
    redraw(renderer, state);
    return;
  }

  if (name === "backspace" || name === "delete") inputBackspace(state);
  else if (name === "return") {
    if (state.providerInputMode === "rekey") {
      const provider = getSelectedProvider(state);
      if (!provider) return;
      runAsync(async () => {
        await updateProvider(provider.id, { apiKey: state.addKey });
        await refreshProviders(state);
        await reloadLauncherData(state);
        state.screen = "providers";
        state.message = state.zh ? "Key 已更新" : "Key updated";
      });
      return;
    }
    if (state.providerInputMode === "add-key" && state.addKey) {
      if (state.addType === "custom") startProviderInput(state, "add-url");
      else startProviderInput(state, "add-model");
    } else if (state.providerInputMode === "add-url") {
      startProviderInput(state, "add-model");
    } else if (state.providerInputMode === "add-model") {
      if (state.addModel.trim()) startProviderInput(state, "add-ctx");
      else runAsync(() => finishProviderAdd(state));
      return;
    } else if (state.providerInputMode === "add-ctx") {
      runAsync(() => finishProviderAdd(state));
      return;
    }
  } else {
    appendInput(state, keyChar(key));
  }
  redraw(renderer, state);
}

export function handleAgentsKey(
  key: KeyEvent,
  state: AppState,
  renderer: CliRenderer,
  runAsync: (fn: () => Promise<void>) => void,
) {
  const name = key.name;
  const sessions = state.agentSessions || [];
  if (name === "up") state.agentIdx = state.agentIdx > 0 ? state.agentIdx - 1 : Math.max(0, sessions.length - 1);
  else if (name === "down") state.agentIdx = state.agentIdx < sessions.length - 1 ? state.agentIdx + 1 : 0;
  else if (isPlain(key) && name === "r") {
    runAsync(() => openAgents(state));
    return;
  } else if (isPlain(key) && name === "n") {
    state.screen = "agent-new";
    state.agentBackend = "claude";
    state.agentModel = "";
    state.agentName = "";
    state.agentField = "backend";
    state.agentError = undefined;
  } else if ((name === "return" || (isPlain(key) && name === "o")) && sessions[state.agentIdx]) {
    runAsync(() => openAgentDetail(state, sessions[state.agentIdx].sid));
    return;
  } else if (isPlain(key) && name === "p") {
    runAsync(async () => {
      const count = await purgeDead();
      await openAgents(state);
      state.message = state.zh ? `已清理 ${count} 个 session` : `Purged ${count} sessions`;
    });
    return;
  } else if ((isPlain(key) && (name === "d" || name === "x")) && sessions[state.agentIdx]) {
    const session = sessions[state.agentIdx];
    runAsync(async () => {
      await closeSession(session.sid, name === "x");
      await openAgents(state);
      state.message = name === "x" ? (state.zh ? "已删除" : "Purged") : (state.zh ? "已关闭" : "Closed");
    });
    return;
  }
  redraw(renderer, state);
}

export function handleAgentDetailKey(
  key: KeyEvent,
  state: AppState,
  renderer: CliRenderer,
  runAsync: (fn: () => Promise<void>) => void,
) {
  const name = key.name;
  const sid = state.agentDetailSid;
  if (!sid) {
    runAsync(() => openAgents(state));
    return;
  }

  if (key.ctrl && name === "c") {
    if (state.agentDetailStatus === "sending") {
      state.agentDetailStatus = "cancelling";
      redraw(renderer, state);
      void cancelSession(sid)
        .catch((error) => {
          state.agentError = error instanceof Error ? error.message : String(error);
        })
        .finally(() => {
          state.agentDetailStatus = "idle";
          void refreshAgentDetail(state).finally(() => redraw(renderer, state));
        });
      return;
    }
    runAsync(() => openAgents(state));
    return;
  }

  if (key.ctrl && (name === "y" || name === "n")) {
    const top = state.agentPendingApprovals[0];
    if (!top) return;
    runAsync(async () => {
      await writeApprovalResponse(sid, top.approvalId, {
        decision: name === "y" ? "allow" : "deny",
        by: "tui",
        decidedAt: Date.now(),
      });
      await refreshAgentDetail(state);
      state.message = name === "y" ? (state.zh ? "已批准" : "Approved") : (state.zh ? "已拒绝" : "Denied");
    });
    return;
  }

  if (name === "escape" || (isPlain(key) && name === "q" && !state.agentDetailInput)) {
    runAsync(() => openAgents(state));
    return;
  }
  if (isPlain(key) && name === "r") {
    runAsync(() => refreshAgentDetail(state));
    return;
  }

  if (name === "backspace" || name === "delete") {
    inputBackspace(state);
    redraw(renderer, state);
    return;
  }

  if (name === "return") {
    const prompt = state.agentDetailInput.trim();
    if (!prompt || state.agentDetailStatus !== "idle") return;
    state.agentDetailInput = "";
    state.agentDetailStatus = "sending";
    state.agentError = undefined;
    redraw(renderer, state);
    void sendToSession(sid, prompt)
      .catch((error) => {
        state.agentError = error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        state.agentDetailStatus = "idle";
        void refreshAgentDetail(state).finally(() => redraw(renderer, state));
      });
    return;
  }

  appendInput(state, keyChar(key));
  redraw(renderer, state);
}

export function handleAgentNewKey(
  key: KeyEvent,
  state: AppState,
  renderer: CliRenderer,
  runAsync: (fn: () => Promise<void>) => void,
) {
  const name = key.name;
  if (name === "tab" || name === "down") {
    state.agentField = state.agentField === "backend" ? "model" : state.agentField === "model" ? "name" : "backend";
  } else if (name === "up") {
    state.agentField = state.agentField === "backend" ? "name" : state.agentField === "model" ? "backend" : "model";
  } else if ((name === "space" || name === "left" || name === "right") && state.agentField === "backend") {
    state.agentBackend = state.agentBackend === "claude" ? "codex" : "claude";
  } else if (name === "backspace" || name === "delete") {
    inputBackspace(state);
  } else if (name === "return") {
    runAsync(async () => {
      try {
        const meta = await startSession({
          backend: state.agentBackend,
          model: state.agentModel.trim() || undefined,
          name: state.agentName.trim() || undefined,
        });
        await openAgents(state);
        const idx = state.agentSessions?.findIndex((s) => s.sid === meta.sid) ?? -1;
        if (idx >= 0) state.agentIdx = idx;
        state.message = state.zh ? "Session 已创建" : "Session created";
      } catch (error) {
        state.agentError = error instanceof Error ? error.message : String(error);
      }
    });
    return;
  } else {
    appendInput(state, keyChar(key));
  }
  redraw(renderer, state);
}
