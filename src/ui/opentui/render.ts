import {
  BoxRenderable,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
  type CliRenderer,
  type Renderable,
} from "@opentui/core";
import { PROVIDER_TYPE_NAMES, getModelChoices, isProviderCompatible } from "../../providers/types";
import { getLocale } from "../../i18n";
import { formatNumber } from "../../stats";
import { ADD_TYPES, CLIENT_STYLE, DEFAULT_STYLE, LANGUAGES, MIN_HEIGHT, TAKO_LOGO, TAKO_LOGO_COMPACT, THEME, VERSION } from "./theme";
import {
  actionLabel,
  buildOptionRows,
  detailActions,
  fmtAge,
  getGroupSelection,
  getSelectedProvider,
  maskSecret,
  statusColor,
  statusMarker,
} from "./helpers";
import type { AppState } from "./types";
import type { NormalizedFrame } from "../../agent/types";

function clearRoot(renderer: CliRenderer) {
  for (const child of [...renderer.root.getChildren()]) {
    renderer.root.remove(child.id);
  }
}

function box(renderer: CliRenderer, options: ConstructorParameters<typeof BoxRenderable>[1]) {
  return new BoxRenderable(renderer, options);
}

function shouldUseScroll(renderer: CliRenderer) {
  return renderer.terminalHeight < MIN_HEIGHT;
}

function pageSizing(renderer: CliRenderer) {
  return shouldUseScroll(renderer)
    ? { minHeight: MIN_HEIGHT }
    : { height: "100%" as const };
}

function maxScrollTop(scroll: ScrollBoxRenderable) {
  return Math.max(0, scroll.scrollHeight - scroll.viewport.height);
}

function syncScrollOffset(state: AppState, scroll: ScrollBoxRenderable) {
  if (maxScrollTop(scroll) <= 0) return;
  state.scrollOffset = Math.max(0, Math.round(scroll.scrollTop));
}

function mountRoot(renderer: CliRenderer, state: AppState, root: Renderable) {
  if (!shouldUseScroll(renderer)) {
    renderer.root.add(root);
    return;
  }

  const scroll = new ScrollBoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    scrollY: true,
    scrollX: false,
    viewportCulling: false,
  });
  let restoreTarget = state.scrollOffset;
  let restoring = false;
  const restoreScrollOffset = () => {
    if (restoreTarget <= 0) return;
    const maxTop = maxScrollTop(scroll);
    if (maxTop <= 0) return;
    restoring = true;
    scroll.scrollTop = Math.min(restoreTarget, maxTop);
    restoring = false;
  };
  scroll.verticalScrollBar.on("change", () => {
    if (restoring) return;
    syncScrollOffset(state, scroll);
    restoreTarget = state.scrollOffset;
  });
  scroll.content.on("resize", restoreScrollOffset);
  scroll.viewport.on("resize", restoreScrollOffset);
  scroll.add(root);
  renderer.root.add(scroll);
  if (state.scrollOffset > 0) {
    restoreScrollOffset();
    process.nextTick(restoreScrollOffset);
  }
}

function text(renderer: CliRenderer, content: string, options: Partial<ConstructorParameters<typeof TextRenderable>[1]> = {}) {
  return new TextRenderable(renderer, {
    content,
    fg: THEME.text,
    selectable: false,
    ...options,
  });
}

function addText(parent: Renderable, renderer: CliRenderer, content: string, options: Partial<ConstructorParameters<typeof TextRenderable>[1]> = {}) {
  const node = text(renderer, content, options);
  parent.add(node);
  return node;
}

function renderHintBar(renderer: CliRenderer, parent: Renderable, hints: Array<[string, string]>) {
  const hint = box(renderer, {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    paddingX: 2,
    paddingY: 0,
    marginTop: 1,
    height: 1,
    justifyContent: "center",
  });
  hints.forEach(([key, label]) => {
    const item = box(renderer, { flexDirection: "row", gap: 1 });
    addText(item, renderer, key, { fg: THEME.orange, attributes: TextAttributes.BOLD });
    addText(item, renderer, label, { fg: THEME.muted });
    hint.add(item);
  });
  parent.add(hint);
}

function renderLogo(renderer: CliRenderer, parent: Renderable, subtitle: string, color = THEME.orange) {
  const h = renderer.terminalHeight;
  if (h < 30) return;
  const wrap = box(renderer, { flexDirection: "column", alignItems: "center", marginBottom: 1 });
  const art = h >= 36 ? TAKO_LOGO : TAKO_LOGO_COMPACT;
  addText(wrap, renderer, art, { fg: color, attributes: TextAttributes.BOLD, selectable: false });
  if (subtitle && h >= 34) addText(wrap, renderer, subtitle, { fg: THEME.muted });
  parent.add(wrap);
}

function renderRows(
  renderer: CliRenderer,
  parent: Renderable,
  rows: Array<{ primary: string; secondary?: string; focused: boolean; marker?: string; color?: string }>,
) {
  const list = box(renderer, { flexDirection: "column", gap: 0 });
  for (const row of rows) {
    const rowBox = box(renderer, {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: row.focused ? THEME.panelMuted : THEME.panel,
      paddingX: 1,
      height: 1,
    });
    const left = box(renderer, { flexDirection: "row", gap: 1, flexGrow: 1 });
    addText(left, renderer, row.focused ? ">" : " ", {
      fg: row.focused ? (row.color || THEME.orange) : THEME.muted,
      attributes: row.focused ? TextAttributes.BOLD : TextAttributes.NONE,
    });
    if (row.marker) addText(left, renderer, row.marker, { fg: row.color || THEME.orange });
    addText(left, renderer, row.primary, {
      fg: row.focused ? (row.color || THEME.orange) : THEME.text,
      attributes: row.focused ? TextAttributes.BOLD : TextAttributes.NONE,
      truncate: true,
    });
    rowBox.add(left);
    if (row.secondary) addText(rowBox, renderer, row.secondary, { fg: THEME.muted, truncate: true });
    list.add(rowBox);
  }
  parent.add(list);
}

function shell(
  renderer: CliRenderer,
  state: AppState,
  titleText: string,
  color = THEME.orange,
  headerRight: { text: string; color?: string } = { text: `tako ${VERSION}`, color: THEME.muted },
  fillHeight = false,
) {
  const root = box(renderer, {
    flexDirection: "column",
    width: "100%",
    ...pageSizing(renderer),
    backgroundColor: THEME.bg,
    paddingX: 1,
    paddingY: 1,
  });
  const panel = box(renderer, {
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: color,
    backgroundColor: THEME.panel,
    paddingX: 2,
    paddingY: 1,
    gap: 1,
    flexGrow: fillHeight ? 1 : 0,
  });
  const header = box(renderer, { flexDirection: "row", justifyContent: "space-between" });
  addText(header, renderer, titleText, { fg: color, attributes: TextAttributes.BOLD });
  addText(header, renderer, headerRight.text, { fg: headerRight.color || THEME.muted, truncate: true });
  panel.add(header);
  if (state.message) addText(panel, renderer, state.message, { fg: state.message.startsWith("!") ? THEME.red : THEME.green });
  root.add(panel);
  return { root, panel };
}

export function redraw(renderer: CliRenderer, state: AppState) {
  clearRoot(renderer);
  if (state.scrollScreen !== state.screen) {
    state.scrollScreen = state.screen;
    state.scrollOffset = 0;
  } else if (!shouldUseScroll(renderer) && state.scrollOffset !== 0) {
    state.scrollOffset = 0;
  }
  switch (state.screen) {
    case "launcher":
      renderLauncher(renderer, state);
      break;
    case "providers":
      renderProviders(renderer, state);
      break;
    case "provider-detail":
      renderProviderDetail(renderer, state);
      break;
    case "provider-add-type":
      renderProviderAddType(renderer, state);
      break;
    case "provider-input":
      renderProviderInput(renderer, state);
      break;
    case "stats":
      renderStats(renderer, state);
      break;
    case "config":
      renderConfig(renderer, state);
      break;
    case "language":
      renderLanguage(renderer, state);
      break;
    case "option-picker":
      renderOptionPicker(renderer, state);
      break;
    case "agents":
      renderAgents(renderer, state);
      break;
    case "agent-detail":
      renderAgentDetail(renderer, state);
      break;
    case "agent-new":
      renderAgentNew(renderer, state);
      break;
  }
  renderer.requestRender();
}

function renderLauncher(renderer: CliRenderer, state: AppState) {
  const current = state.clients[state.clientIdx];
  if (!current) return;

  const clientStyle = CLIENT_STYLE[current.client.id] || DEFAULT_STYLE;
  const rows = buildOptionRows(current.launchOptions, state.zh);
  const providerName = current.activeProvider?.name || (state.zh ? "未配置" : "Not set");
  const compactHeight = renderer.terminalHeight < 26;
  const providerLabel = `${state.zh ? "服务商" : "Provider"}: ${providerName}`;
  const compactHeaderRight = `${providerLabel}  ·  tako ${VERSION}`;
  const { root, panel } = shell(
    renderer,
    state,
    "Tako Launcher",
    clientStyle.color,
    compactHeight
      ? { text: compactHeaderRight, color: current.activeProvider ? THEME.orange : THEME.yellow }
      : undefined,
    compactHeight,
  );

  renderLogo(renderer, panel, state.zh ? "多客户端 AI 启动器" : "Multi-client AI launcher", clientStyle.color);

  if (!compactHeight) {
    const header = box(renderer, { flexDirection: "row", gap: 1, justifyContent: "center" });
    addText(header, renderer, providerLabel, {
      fg: current.activeProvider ? THEME.orange : THEME.yellow,
      truncate: true,
    });
    panel.add(header);
  }

  const tabs = box(renderer, {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 1,
    justifyContent: "center",
  });
  const tabsFocused = state.focus === "tabs";
  state.clients.forEach((clientData, idx) => {
    const style = CLIENT_STYLE[clientData.client.id] || DEFAULT_STYLE;
    const active = idx === state.clientIdx;
    const tab = box(renderer, {
      border: true,
      borderStyle: active && tabsFocused ? "heavy" : "single",
      borderColor: active ? style.color : THEME.border,
      paddingX: 1,
      height: 3,
      backgroundColor: active && tabsFocused ? THEME.panelMuted : THEME.panel,
    });
    addText(tab, renderer, `${active && tabsFocused ? "> " : ""}${idx + 1} ${style.icon} ${clientData.client.name}`, {
      fg: active ? style.color : THEME.muted,
      attributes: active ? TextAttributes.BOLD : TextAttributes.NONE,
    });
    tabs.add(tab);
  });
  panel.add(tabs);

  const content = box(renderer, { flexDirection: "row", gap: 2, flexGrow: compactHeight ? 1 : 0 });
  const projectPanel = box(renderer, {
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: state.focus === "projects" ? clientStyle.color : THEME.border,
    title: state.zh ? "项目" : "Projects",
    titleColor: state.focus === "projects" ? clientStyle.color : THEME.muted,
    paddingX: 1,
    paddingY: 1,
    width: "58%",
  });
  renderRows(
    renderer,
    projectPanel,
    current.projects.map((p, idx) => ({
      primary: p.label,
      secondary: p.hint,
      focused: state.focus === "projects" && idx === state.projectIdx,
      color: clientStyle.color,
    })),
  );

  const optionsPanel = box(renderer, {
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: state.focus === "options" ? clientStyle.color : THEME.border,
    title: state.zh ? "启动选项" : "Options",
    titleColor: state.focus === "options" ? clientStyle.color : THEME.muted,
    paddingX: 1,
    paddingY: 1,
    flexGrow: 1,
  });
  renderRows(
    renderer,
    optionsPanel,
    rows.map((row, idx) => {
      const focused = state.focus === "options" && idx === state.optionIdx;
      if (row.kind === "flag") {
        const enabled = current.enabled.has(row.opt.id);
        return {
          primary: row.opt.label[state.zh ? "zh" : "en"] || row.opt.label.en,
          secondary: focused ? row.opt.flag : undefined,
          focused,
          marker: enabled ? "[x]" : "[ ]",
          color: enabled ? clientStyle.color : THEME.muted,
        };
      }
      if (row.kind === "group") {
        const selected = getGroupSelection(current.launchOptions, current.enabled, row.group);
        return {
          primary: `${row.title}: ${selected?.shortLabel || (state.zh ? "默认" : "Default")}`,
          secondary: focused ? (state.zh ? "Enter 选择" : "Enter to pick") : undefined,
          focused,
          marker: ">",
          color: clientStyle.color,
        };
      }
      return {
        primary: `${row.title}: ${providerName}`,
        secondary: focused ? (state.zh ? "Enter 管理" : "Enter to manage") : undefined,
        focused,
        marker: "*",
        color: current.activeProvider ? clientStyle.color : THEME.yellow,
      };
    }),
  );

  content.add(projectPanel);
  content.add(optionsPanel);
  panel.add(content);

  const navHint: [string, string] =
    state.focus === "tabs"
      ? ["\u2190\u2192", state.zh ? "\u5207\u5ba2\u6237\u7aef" : "switch client"]
      : state.focus === "projects"
        ? ["\u2192", state.zh ? "\u53bb\u9009\u9879" : "to options"]
        : ["\u2190", state.zh ? "\u53bb\u9879\u76ee" : "to projects"];
  renderHintBar(renderer, root, [
    ["Enter", state.zh ? "启动" : "launch"],
    navHint,
    ["\u2191\u2193", state.zh ? "\u9009\u62e9" : "move"],
    ["Space", state.zh ? "切换选项" : "toggle"],
    ["p", state.zh ? "服务商" : "providers"],
    ["c", "config"],
    ["s", "stats"],
    ["a", "agents"],
    ["q", state.zh ? "退出" : "quit"],
  ]);

  mountRoot(renderer, state, root);
}

function renderOptionPicker(renderer: CliRenderer, state: AppState) {
  const current = state.clients[state.clientIdx];
  const group = state.optionPickerGroup;
  if (!current || !group) {
    renderLauncher(renderer, state);
    return;
  }

  const groupOptions = current.launchOptions.filter((option) => option.group === group);
  const color = (CLIENT_STYLE[current.client.id] || DEFAULT_STYLE).color;
  const title = group === "model"
    ? (state.zh ? "选择模型" : "Pick Model")
    : (state.zh ? "选择选项" : "Pick Option");
  const currentSelection = getGroupSelection(current.launchOptions, current.enabled, group);
  const rows = [
    {
      id: "",
      primary: state.zh ? "默认" : "Default",
      secondary: currentSelection ? "" : (state.zh ? "当前" : "current"),
    },
    ...groupOptions.map((option) => ({
      id: option.id,
      primary: option.shortLabel || option.label[state.zh ? "zh" : "en"] || option.label.en,
      secondary: current.enabled.has(option.id) ? (state.zh ? "当前" : "current") : option.flag,
    })),
  ];

  const total = rows.length;
  state.optionPickerIdx = Math.max(0, Math.min(state.optionPickerIdx, total - 1));
  const visibleRows = Math.max(5, Math.min(14, renderer.terminalHeight - 10));
  const start = Math.max(0, Math.min(state.optionPickerIdx - Math.floor(visibleRows / 2), Math.max(0, total - visibleRows)));
  const visible = rows.slice(start, start + visibleRows);

  const root = box(renderer, {
    flexDirection: "column",
    width: "100%",
    ...pageSizing(renderer),
    backgroundColor: THEME.bg,
    justifyContent: "center",
    alignItems: "center",
    paddingX: 2,
  });
  const panel = box(renderer, {
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: color,
    backgroundColor: THEME.panel,
    paddingX: 2,
    paddingY: 1,
    gap: 1,
    width: "70%",
  });
  const header = box(renderer, { flexDirection: "row", justifyContent: "space-between" });
  addText(header, renderer, title, { fg: color, attributes: TextAttributes.BOLD });
  addText(header, renderer, `${state.optionPickerIdx + 1}/${total}`, { fg: THEME.muted });
  panel.add(header);
  renderRows(
    renderer,
    panel,
    visible.map((row, visibleIdx) => {
      const idx = start + visibleIdx;
      return {
        primary: row.primary,
        secondary: row.secondary,
        focused: idx === state.optionPickerIdx,
        marker: row.id && current.enabled.has(row.id) ? "[x]" : " ",
        color,
      };
    }),
  );
  addText(panel, renderer, state.zh ? "Esc 返回，不修改当前选择" : "Esc returns without changing the current selection", {
    fg: THEME.muted,
    truncate: true,
  });
  root.add(panel);
  renderHintBar(renderer, root, [["Enter", state.zh ? "确认" : "confirm"], ["↑↓", state.zh ? "选择" : "select"], ["Esc/q", state.zh ? "返回" : "back"]]);
  mountRoot(renderer, state, root);
}

function renderProviders(renderer: CliRenderer, state: AppState) {
  const current = state.clients[state.providerTabIdx];
  const client = current?.client;
  const compatible = client ? state.providers.filter((p) => isProviderCompatible(p, client.id)) : [];
  const boundId = client ? state.clientBindings[client.id] || state.defaultProviderId : state.defaultProviderId;
  const totalRows = compatible.length + 3;
  state.providerRowIdx = Math.max(0, Math.min(state.providerRowIdx, Math.max(0, totalRows - 1)));
  const color = client ? (CLIENT_STYLE[client.id] || DEFAULT_STYLE).color : THEME.orange;
  const { root, panel } = shell(renderer, state, state.zh ? "服务商管理" : "Providers", color);

  const tabs = box(renderer, { flexDirection: "row", gap: 1, justifyContent: "center" });
  state.clients.forEach((clientData, idx) => {
    const style = CLIENT_STYLE[clientData.client.id] || DEFAULT_STYLE;
    const active = idx === state.providerTabIdx;
    const tab = box(renderer, {
      border: true,
      borderStyle: active ? "heavy" : "single",
      borderColor: active ? style.color : THEME.border,
      paddingX: 1,
      height: 3,
    });
    addText(tab, renderer, `${idx + 1} ${clientData.client.name}`, {
      fg: active ? style.color : THEME.muted,
      attributes: active ? TextAttributes.BOLD : TextAttributes.NONE,
    });
    tabs.add(tab);
  });
  panel.add(tabs);

  const rows = [
    ...compatible.map((provider) => ({
      primary: provider.name,
      secondary: [
        PROVIDER_TYPE_NAMES[provider.type]?.[state.zh ? "zh" : "en"] || provider.type,
        provider.id === boundId ? (state.zh ? "当前" : "bound") : "",
        provider.id === state.defaultProviderId ? (state.zh ? "默认" : "default") : "",
      ].filter(Boolean).join("  "),
      marker: provider.id === boundId ? "*" : " ",
    })),
    { primary: state.zh ? "添加服务商" : "Add provider", secondary: "", marker: "+" },
    { primary: state.zh ? "扫描本地订阅" : "Scan local subscriptions", secondary: "", marker: "?" },
    { primary: state.zh ? "返回" : "Back", secondary: "", marker: "<" },
  ];

  const list = box(renderer, {
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: color,
    paddingX: 1,
    paddingY: 1,
  });
  renderRows(
    renderer,
    list,
    rows.map((row, idx) => ({
      ...row,
      focused: idx === state.providerRowIdx,
      color,
    })),
  );
  panel.add(list);

  renderHintBar(renderer, root, [
    ["Enter", state.zh ? "绑定/打开" : "bind/open"],
    ["d/e", state.zh ? "详情" : "detail"],
    ["arrows", state.zh ? "选择" : "select"],
    ["q/Esc", state.zh ? "返回" : "back"],
  ]);
  mountRoot(renderer, state, root);
}

function renderProviderDetail(renderer: CliRenderer, state: AppState) {
  const provider = getSelectedProvider(state);
  const { root, panel } = shell(renderer, state, state.zh ? "服务商详情" : "Provider Detail", THEME.orange);
  if (!provider) {
    addText(panel, renderer, state.zh ? "服务商不存在" : "Provider not found", { fg: THEME.red });
  } else {
    const details = [
      ["Name", provider.name],
      ["Type", PROVIDER_TYPE_NAMES[provider.type]?.[state.zh ? "zh" : "en"] || provider.type],
      ["Base URL", provider.baseUrl || "-"],
      ["Model", provider.model || "-"],
      ["Email", provider.email || "-"],
      ["Builtin", provider.builtin ? "yes" : "no"],
    ];
    for (const [label, value] of details) addText(panel, renderer, `${label}: ${value}`, { fg: THEME.text, truncate: true });

    const actions = detailActions(provider, state);
    renderRows(
      renderer,
      panel,
      actions.map((action, idx) => ({
        primary: actionLabel(action, state.zh),
        focused: idx === state.providerDetailIdx,
        marker: idx === state.providerDetailIdx ? ">" : " ",
        color: THEME.orange,
      })),
    );
  }
  renderHintBar(renderer, root, [["Enter", state.zh ? "执行" : "run"], ["arrows", state.zh ? "选择" : "select"], ["q/Esc", state.zh ? "返回" : "back"]]);
  mountRoot(renderer, state, root);
}

function renderProviderAddType(renderer: CliRenderer, state: AppState) {
  const { root, panel } = shell(renderer, state, state.zh ? "添加服务商" : "Add Provider", THEME.orange);
  renderRows(
    renderer,
    panel,
    ADD_TYPES.map((type, idx) => ({
      primary: PROVIDER_TYPE_NAMES[type]?.[state.zh ? "zh" : "en"] || type,
      secondary:
        type === "claude-subscription" || type === "codex-subscription"
          ? (state.zh ? "登录授权" : "login auth")
          : type === "custom"
            ? (state.zh ? "自定义 URL" : "custom URL")
            : "",
      focused: idx === state.providerRowIdx,
      marker: "+",
      color: THEME.orange,
    })),
  );
  renderHintBar(renderer, root, [["Enter", state.zh ? "选择" : "select"], ["q/Esc", state.zh ? "返回" : "back"]]);
  mountRoot(renderer, state, root);
}

function renderProviderInput(renderer: CliRenderer, state: AppState) {
  const titleByMode: Record<AppState["providerInputMode"], string> = {
    "add-key": state.zh ? "输入 API Key" : "Enter API key",
    "add-url": state.zh ? "输入 Base URL" : "Enter base URL",
    "add-model": state.zh ? "选择/输入模型" : "Select/enter model",
    "add-ctx": state.zh ? "输入上下文窗口 token 数" : "Enter context window tokens",
    rekey: state.zh ? "更新 API Key" : "Update API key",
  };
  const { root, panel } = shell(renderer, state, titleByMode[state.providerInputMode], THEME.orange);
  const choices = state.providerInputMode === "add-model" ? getModelChoices(state.addType) : undefined;
  if (choices) {
    renderRows(
      renderer,
      panel,
      choices.map((choice, idx) => ({
        primary: choice,
        focused: idx === state.providerRowIdx,
        marker: idx === state.providerRowIdx ? ">" : " ",
        color: THEME.orange,
      })),
    );
  } else {
    const value =
      state.providerInputMode === "add-key" || state.providerInputMode === "rekey"
        ? maskSecret(state.addKey)
        : state.providerInputMode === "add-url"
          ? state.addUrl
          : state.providerInputMode === "add-model"
            ? state.addModel
            : state.addCtx;
    addText(panel, renderer, `> ${value}_`, { fg: THEME.text, truncate: true });
  }
  renderHintBar(renderer, root, [["Enter", state.zh ? "继续" : "continue"], ["Backspace", state.zh ? "删除" : "delete"], ["q/Esc", state.zh ? "取消" : "cancel"]]);
  mountRoot(renderer, state, root);
}

function renderStats(renderer: CliRenderer, state: AppState) {
  const { root, panel } = shell(renderer, state, state.zh ? "用量统计" : "Usage Stats", THEME.green);
  if (state.statsLoading) {
    addText(panel, renderer, state.zh ? "正在获取..." : "Loading...", { fg: THEME.yellow });
  } else if (state.statsError) {
    addText(panel, renderer, `${state.zh ? "获取失败" : "Failed"}: ${state.statsError}`, { fg: THEME.red });
  } else if (state.statsData) {
    addText(panel, renderer, `${state.zh ? "总调用次数" : "Total requests"}: ${formatNumber(state.statsData.totalRequests)}`);
    addText(panel, renderer, `${state.zh ? "总消费" : "Total cost"}: ${state.statsData.totalCost}`);
    addText(panel, renderer, `${state.zh ? "今日消费" : "Today"}: ${state.statsData.todayCost}`);
    if (state.statsData.modelStats.length > 0) {
      addText(panel, renderer, state.zh ? "模型分布:" : "Models:", { fg: THEME.muted });
      for (const stat of state.statsData.modelStats.slice(0, 12)) {
        addText(panel, renderer, `${stat.model.padEnd(28)} ${String(stat.requests).padStart(6)} ${stat.cost}`, { fg: THEME.muted, truncate: true });
      }
    }
  } else {
    addText(panel, renderer, state.zh ? "暂无数据" : "No data", { fg: THEME.muted });
  }
  renderHintBar(renderer, root, [["r", state.zh ? "刷新" : "refresh"], ["q/Esc", state.zh ? "返回" : "back"]]);
  mountRoot(renderer, state, root);
}

function renderConfig(renderer: CliRenderer, state: AppState) {
  const { root, panel } = shell(renderer, state, state.zh ? "配置 API Key" : "Configure API key", THEME.orange);
  addText(panel, renderer, `> ${maskSecret(state.apiKeyValue)}_`, { truncate: true });
  if (state.apiKeyStatus === "validating") addText(panel, renderer, state.zh ? "正在验证..." : "Validating...", { fg: THEME.yellow });
  if (state.apiKeyStatus === "success") addText(panel, renderer, state.zh ? "配置成功" : "Configured", { fg: THEME.green });
  if (state.apiKeyStatus === "error") addText(panel, renderer, state.apiKeyError || "Error", { fg: THEME.red });
  renderHintBar(renderer, root, [["Enter", state.zh ? "保存" : "save"], ["Backspace", state.zh ? "删除" : "delete"], ["q/Esc", state.zh ? "返回" : "back"]]);
  mountRoot(renderer, state, root);
}

function renderLanguage(renderer: CliRenderer, state: AppState) {
  const { root, panel } = shell(renderer, state, state.zh ? "切换语言" : "Language", THEME.magenta);
  renderRows(
    renderer,
    panel,
    LANGUAGES.map((lang, idx) => ({
      primary: lang.label,
      secondary: lang.value === getLocale() ? (state.zh ? "当前" : "current") : "",
      focused: idx === state.languageIdx,
      marker: idx === state.languageIdx ? ">" : " ",
      color: THEME.magenta,
    })),
  );
  renderHintBar(renderer, root, [["Enter", state.zh ? "选择" : "select"], ["q/Esc", state.zh ? "返回" : "back"]]);
  mountRoot(renderer, state, root);
}

function renderAgents(renderer: CliRenderer, state: AppState) {
  const { root, panel } = shell(renderer, state, state.zh ? "Agent 会话" : "Agent Sessions", THEME.blue);
  addText(
    panel,
    renderer,
    `${state.zh ? "默认 Provider" : "Defaults"}: ${
      Object.keys(state.agentDefaults).length === 0
        ? "-"
        : Object.entries(state.agentDefaults).map(([k, v]) => `${k}=${v.slice(0, 8)}`).join("  ")
    }`,
    { fg: THEME.muted, truncate: true },
  );
  if (!state.agentSessions) {
    addText(panel, renderer, state.zh ? "加载中..." : "Loading...", { fg: THEME.yellow });
  } else if (state.agentSessions.length === 0) {
    addText(panel, renderer, state.zh ? "暂无 session，按 n 新建" : "No sessions, press n to create", { fg: THEME.muted });
  } else {
    renderRows(
      renderer,
      panel,
      state.agentSessions.map((session, idx) => ({
        primary: `${session.sid.slice(0, 8)}  ${session.backend.padEnd(6)}  ${(session.name || "").slice(0, 18).padEnd(18)}  ${session.status}`,
        secondary: `${session.turnCount} turns  ${fmtAge(Date.now() - session.lastActiveAt)}`,
        focused: idx === state.agentIdx,
        marker: statusMarker(session.status),
        color: statusColor(session.status),
      })),
    );
  }
  if (state.agentError) addText(panel, renderer, `! ${state.agentError}`, { fg: THEME.red, truncate: true });
  renderHintBar(renderer, root, [["Enter/o", state.zh ? "详情" : "open"], ["n", state.zh ? "新建" : "new"], ["d", state.zh ? "关闭" : "close"], ["x", state.zh ? "删除" : "purge"], ["r", state.zh ? "刷新" : "refresh"], ["q/Esc", state.zh ? "返回" : "back"]]);
  mountRoot(renderer, state, root);
}

function frameLine(frame: NormalizedFrame): { text: string; color?: string; dim?: boolean } {
  const ts = new Date(frame.ts).toISOString().slice(11, 19);
  switch (frame.kind) {
    case "session_started":
      return { text: `[${ts}] session_started ${frame.backend}${frame.model ? ` ${frame.model}` : ""}`, dim: true };
    case "turn_started":
      return { text: `[${ts}] turn_started`, color: THEME.cyan };
    case "text_delta":
      return { text: frame.text };
    case "reasoning_delta":
      return { text: `[${ts}] reasoning ${frame.text}`, dim: true };
    case "tool_use":
      return { text: `[${ts}] tool ${frame.name} ${JSON.stringify(frame.input)}`, color: THEME.yellow };
    case "tool_result":
      return { text: `[${ts}] result ${JSON.stringify(frame.output)}`, color: THEME.green };
    case "approval_required":
      return { text: `[${ts}] approval ${frame.approvalType} ${String(frame.approvalId)}`, color: THEME.magenta };
    case "turn_completed":
      return { text: `[${ts}] turn_completed${frame.stopReason ? ` ${frame.stopReason}` : ""}`, color: THEME.cyan };
    case "error":
      return { text: `[${ts}] error ${frame.message}`, color: THEME.red };
    case "session_closed":
      return { text: `[${ts}] session_closed`, dim: true };
  }
}

function renderAgentDetail(renderer: CliRenderer, state: AppState) {
  const meta = state.agentDetailMeta;
  const { root, panel } = shell(renderer, state, state.zh ? "Agent 详情" : "Agent Detail", THEME.blue);
  if (!meta) {
    addText(panel, renderer, state.zh ? "加载中..." : "Loading...", { fg: THEME.yellow });
    mountRoot(renderer, state, root);
    return;
  }

  addText(
    panel,
    renderer,
    `${meta.sid.slice(0, 8)}  ${meta.backend}  ${meta.name}  ${meta.status}${state.agentDetailAlive === false ? "  dead" : ""}`,
    { fg: statusColor(meta.status), attributes: TextAttributes.BOLD, truncate: true },
  );
  addText(panel, renderer, `${state.zh ? "工作目录" : "cwd"}: ${meta.workdir}`, { fg: THEME.muted, truncate: true });
  addText(
    panel,
    renderer,
    `${state.zh ? "模型" : "model"}: ${meta.model || "-"}  turns=${meta.turnCount}  ${state.zh ? "最近" : "last"}=${fmtAge(Date.now() - meta.lastActiveAt)}`,
    { fg: THEME.muted, truncate: true },
  );

  if (state.agentPendingApprovals.length > 0) {
    const approvals = box(renderer, {
      flexDirection: "column",
      border: true,
      borderStyle: "rounded",
      borderColor: THEME.magenta,
      paddingX: 1,
    });
    addText(approvals, renderer, `${state.agentPendingApprovals.length} ${state.zh ? "个待审批" : "pending approvals"}`, {
      fg: THEME.magenta,
      attributes: TextAttributes.BOLD,
    });
    for (const approval of state.agentPendingApprovals.slice(0, 3)) {
      addText(
        approvals,
        renderer,
        `${approval.approvalType} ${approval.approvalId.slice(0, 12)} ${JSON.stringify(approval.params)}`,
        { fg: THEME.muted, truncate: true },
      );
    }
    panel.add(approvals);
  }

  const logBox = box(renderer, {
    flexDirection: "column",
    border: true,
    borderStyle: "rounded",
    borderColor: THEME.border,
    paddingX: 1,
    title: state.zh ? "日志" : "Log",
    titleColor: THEME.muted,
  });
  const logRows = state.agentDetailFrames.slice(-Math.max(6, Math.min(18, renderer.terminalHeight - 14)));
  if (logRows.length === 0) {
    addText(logBox, renderer, state.zh ? "暂无日志" : "No log yet", { fg: THEME.muted });
  } else {
    for (const frame of logRows) {
      const line = frameLine(frame);
      addText(logBox, renderer, line.text.replace(/\s+/g, " ").slice(0, 240), {
        fg: line.color || (line.dim ? THEME.muted : THEME.text),
        truncate: true,
      });
    }
  }
  panel.add(logBox);

  if (state.agentError) addText(panel, renderer, `! ${state.agentError}`, { fg: THEME.red, truncate: true });
  const prefix = state.agentDetailStatus === "sending" ? "... " : state.agentDetailStatus === "cancelling" ? "x " : "> ";
  addText(panel, renderer, `${prefix}${state.agentDetailInput}_`, {
    fg: state.agentDetailStatus === "idle" ? THEME.text : THEME.yellow,
    truncate: true,
  });

  renderHintBar(renderer, root, [
    ["Enter", state.zh ? "发送" : "send"],
    ["Ctrl-Y/N", state.zh ? "批/拒" : "approve/deny"],
    ["r", state.zh ? "刷新" : "refresh"],
    ["Ctrl-C", state.zh ? "取消" : "cancel"],
    ["Esc/q", state.zh ? "返回" : "back"],
  ]);
  mountRoot(renderer, state, root);
}

function renderAgentNew(renderer: CliRenderer, state: AppState) {
  const { root, panel } = shell(renderer, state, state.zh ? "新建 Agent Session" : "New Agent Session", THEME.blue);
  const rows = [
    { id: "backend", label: `${state.zh ? "后端" : "Backend"}: ${state.agentBackend === "claude" ? "[claude] codex" : "claude [codex]"}` },
    { id: "model", label: `${state.zh ? "模型" : "Model"}: ${state.agentModel || (state.zh ? "默认" : "default")}` },
    { id: "name", label: `${state.zh ? "名称" : "Name"}: ${state.agentName || (state.zh ? "自动" : "auto")}` },
  ] as const;
  renderRows(
    renderer,
    panel,
    rows.map((row) => ({
      primary: row.label + (state.agentField === row.id && row.id !== "backend" ? "_" : ""),
      focused: state.agentField === row.id,
      marker: state.agentField === row.id ? ">" : " ",
      color: THEME.blue,
    })),
  );
  if (state.agentError) addText(panel, renderer, `! ${state.agentError}`, { fg: THEME.red, truncate: true });
  renderHintBar(renderer, root, [["Tab/arrows", state.zh ? "切字段" : "field"], ["Space", state.zh ? "切后端" : "backend"], ["Enter", state.zh ? "创建" : "create"], ["q/Esc", state.zh ? "取消" : "cancel"]]);
  mountRoot(renderer, state, root);
}
