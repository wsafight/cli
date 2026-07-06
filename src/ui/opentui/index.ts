import { CliRenderEvents, createCliRenderer, type CliRenderer, type KeyEvent } from "@opentui/core";
import { setLocale } from "../../i18n";
import { validateAndSaveKey } from "../../auth";
import { identify, reset as resetAnalytics } from "../../analytics";
import { THEME, LANGUAGES, MIN_HEIGHT } from "./theme";
import { createInitialState, clampIndexes, reloadLauncherData } from "./state";
import { isPlain, keyChar, restoreTerminalModes, appendInput, inputBackspace, settleTerminalForChild } from "./helpers";
import { redraw } from "./render";
import { backToLauncher, openProviders, openStats } from "./actions";
import {
  handleAgentDetailKey,
  handleAgentNewKey,
  handleAgentsKey,
  handleClientVersionsKey,
  handleKeyGuideKey,
  handleLauncherKey,
  handleOptionPickerKey,
  handleProviderAddTypeKey,
  handleProviderDetailKey,
  handleProviderInputKey,
  handleProvidersKey,
} from "./keys";
import { refreshAgentDetail, refreshQuota } from "./actions";
import type { LauncherResult } from "./types";

interface OpenTuiInitial {
  screen?: "launcher" | "providers";
  message?: string;
}

export async function startOpenTuiApp(initial: OpenTuiInitial = {}): Promise<LauncherResult | null> {
  const state = await createInitialState();
  if (initial.screen === "providers") await openProviders(state);
  if (initial.message) state.message = initial.message;
  if (state.screen === "launcher") {
    try {
      const { shouldShowKeyGuide } = await import("./actions");
      if (await shouldShowKeyGuide()) state.screen = "key-guide";
    } catch {
      // ignore
    }
  }
  restoreTerminalModes();

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    clearOnShutdown: true,
    // 开启鼠标捕获：让 ScrollBox 原生处理滚轮（滚动视口，不动选项）。
    // 关闭时终端会把滚轮翻译成 ↑/↓ 键，误触发选项切换且无法区分。
    // 代价：终端原生框选复制需按住 Shift/Option。
    useMouse: true,
    enableMouseMovement: false,
    backgroundColor: THEME.bg,
  });

  return new Promise((resolve) => {
    let done = false;
    let detailRefreshing = false;
    let detailRefreshTimer: ReturnType<typeof setInterval> | undefined;

    const destroyRenderer = async () => {
      await new Promise<void>((resolveDestroy) => {
        const timer = setTimeout(resolveDestroy, 100);
        timer.unref?.();
        renderer.once(CliRenderEvents.DESTROY, () => {
          clearTimeout(timer);
          resolveDestroy();
        });
        renderer.stop();
        renderer.destroy();
      });
    };

    const finish = (result: LauncherResult | null) => {
      if (done) return;
      done = true;
      if (detailRefreshTimer) clearInterval(detailRefreshTimer);
      renderer.keyInput.off("keypress", onKey);
      void (async () => {
        await destroyRenderer();
        await settleTerminalForChild();
        resolve(result);
      })();
    };

    const runAsync = (fn: () => Promise<void>) => {
      if (state.busy) return;
      state.busy = true;
      redraw(renderer, state);
      void fn()
        .catch((error) => {
          state.message = `! ${error instanceof Error ? error.message : String(error)}`;
        })
        .finally(() => {
          state.busy = false;
          redraw(renderer, state);
        });
    };

    const scrollPage = (direction: 1 | -1) => {
      if (renderer.terminalHeight >= MIN_HEIGHT) return false;
      const step = Math.max(1, renderer.terminalHeight - 2);
      state.scrollOffset = Math.max(0, state.scrollOffset + direction * step);
      redraw(renderer, state);
      return true;
    };

    const onKey = (key: KeyEvent) => {
      if (key.eventType === "release" || state.busy) return;
      const name = key.name;
      const char = keyChar(key);
      const plain = isPlain(key);

      if (name === "pagedown" && scrollPage(1)) return;
      if (name === "pageup" && scrollPage(-1)) return;

      if (state.screen === "agent-detail") {
        handleAgentDetailKey(key, state, renderer, runAsync);
        return;
      }

      if (key.ctrl && name === "c") {
        finish({ type: "exit" });
        return;
      }

      if (state.screen === "client-versions") {
        if (name === "escape" || (plain && name === "q")) {
          runAsync(() => openProviders(state));
          return;
        }
        handleClientVersionsKey(key, state, renderer, runAsync);
        return;
      }

      if (state.screen === "key-guide") {
        handleKeyGuideKey(key, state, renderer, runAsync);
        return;
      }

      if (state.screen === "launcher") {
        handleLauncherKey(key, state, renderer, finish, runAsync);
        return;
      }

      if (state.screen === "option-picker") {
        handleOptionPickerKey(key, state, renderer);
        return;
      }

      if (name === "escape" || (plain && name === "q")) {
        if (state.screen === "provider-detail" || state.screen === "provider-add-type" || state.screen === "provider-input") {
          state.screen = "providers";
        } else if (state.screen === "agent-new") {
          state.screen = "agents";
        } else {
          backToLauncher(state);
        }
        redraw(renderer, state);
        return;
      }

      if (state.screen === "providers") {
        handleProvidersKey(key, state, renderer, runAsync);
        return;
      }
      if (state.screen === "provider-detail") {
        handleProviderDetailKey(key, state, renderer, finish, runAsync);
        return;
      }
      if (state.screen === "provider-add-type") {
        handleProviderAddTypeKey(key, state, renderer, finish);
        return;
      }
      if (state.screen === "provider-input") {
        handleProviderInputKey(key, state, renderer, runAsync);
        return;
      }
      if (state.screen === "stats") {
        if (plain && name === "r") runAsync(() => openStats(state));
        return;
      }
      if (state.screen === "config") {
        if (name === "backspace" || name === "delete") inputBackspace(state);
        else if (name === "return") {
          runAsync(async () => {
            if (!state.apiKeyValue) return;
            state.apiKeyStatus = "validating";
            redraw(renderer, state);
            const result = await validateAndSaveKey(state.apiKeyValue);
            if (result.success) {
              resetAnalytics();
              identify();
              state.apiKeyStatus = "success";
              await reloadLauncherData(state);
            } else {
              state.apiKeyStatus = "error";
              state.apiKeyError = result.error || "Validation failed";
            }
          });
        } else appendInput(state, char);
        redraw(renderer, state);
        return;
      }
      if (state.screen === "language") {
        if (name === "up") state.languageIdx = state.languageIdx > 0 ? state.languageIdx - 1 : LANGUAGES.length - 1;
        if (name === "down") state.languageIdx = state.languageIdx < LANGUAGES.length - 1 ? state.languageIdx + 1 : 0;
        if (name === "return") {
          const selected = LANGUAGES[state.languageIdx];
          setLocale(selected.value);
          state.zh = selected.value === "zh";
          state.message = state.zh ? "语言已切换" : "Language changed";
          runAsync(() => reloadLauncherData(state).then(() => backToLauncher(state)));
          return;
        }
        redraw(renderer, state);
        return;
      }
      if (state.screen === "agents") {
        handleAgentsKey(key, state, renderer, runAsync);
        return;
      }
      if (state.screen === "agent-new") {
        handleAgentNewKey(key, state, renderer, runAsync);
      }
    };

    renderer.keyInput.on("keypress", onKey);
    renderer.on("resize", () => redraw(renderer, state));

    let quotaFetching = false;
    const maybeFetchQuota = () => {
      if (done || quotaFetching || state.screen !== "launcher") return;
      const provider = state.clients[state.clientIdx]?.activeProvider;
      const key = provider ? `${provider.id}:${provider.type}` : undefined;
      if (key === state.quotaKey) return;
      quotaFetching = true;
      void refreshQuota(state)
        .catch(() => {})
        .finally(() => {
          quotaFetching = false;
          if (!done && state.screen === "launcher") redraw(renderer, state);
        });
    };

    detailRefreshTimer = setInterval(() => {
      maybeFetchQuota();
      if (done || detailRefreshing || state.busy || state.screen !== "agent-detail" || !state.agentDetailSid) return;
      detailRefreshing = true;
      void refreshAgentDetail(state)
        .catch((error) => {
          state.agentError = error instanceof Error ? error.message : String(error);
        })
        .finally(() => {
          detailRefreshing = false;
          if (!done && state.screen === "agent-detail") redraw(renderer, state);
        });
    }, 1000);
    detailRefreshTimer.unref?.();
    clampIndexes(state);
    redraw(renderer, state);
    renderer.start();
  });
}
