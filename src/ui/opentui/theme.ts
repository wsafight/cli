import type { ProviderType } from "../../providers/types";
import type { Locale } from "../../i18n";

export const VERSION = process.env.VERSION || "dev";

// Below this many terminal rows we keep rendering a 22-row layout inside a
// scrollable viewport instead of showing a blocking "too short" screen.
export const MIN_HEIGHT = 22;

// Warm dark palette inspired by MiMo-Code: terracotta-orange accent on a warm
// near-black base, with warm grays instead of the cool navy scheme.
export const THEME = {
  bg: "#17130f",
  panel: "#211b16",
  panelMuted: "#2b231c",
  text: "#ece3d8",
  muted: "#94897c",
  border: "#3a3129",
  orange: "#fb8147",
  orangeDim: "#c96a3a",
  cyan: "#8fb8a8",
  green: "#8fbf7a",
  yellow: "#e6b45c",
  red: "#e58f7b",
  magenta: "#c99bd6",
  blue: "#88a8d8",
  gray: "#94897c",
};

export const CLIENT_STYLE: Record<string, { icon: string; color: string }> = {
  "claude-code": { icon: "*", color: THEME.orange },
  codex: { icon: "C", color: THEME.blue },
  gemini: { icon: "G", color: THEME.green },
};
export const DEFAULT_STYLE = { icon: "-", color: THEME.text };

// Block-character wordmark for the launcher header (full-block glyph style).
export const TAKO_LOGO = [
  "█████  █████  ██  ██  ██████",
  "  █    ██ ██  ██ ██   ██  ██",
  "  █    █████  ████    ██  ██",
  "  █    ██ ██  ██ ██   ██  ██",
  "  █    ██ ██  ██  ██  ██████",
].join("\n");

// Compact 2-row wordmark (half-block glyphs) for shorter terminals.
export const TAKO_LOGO_COMPACT = [
  "▀█▀ ▄▀█ █▄▀ █▀█",
  " █  █▀█ █ █ █▄█",
].join("\n");

export const ADD_TYPES: ProviderType[] = [
  "tako",
  "claude-subscription",
  "codex-subscription",
  "anthropic",
  "deepseek",
  "xiaomi",
  "custom",
];
export const LANGUAGES: Array<{ value: Locale; label: string }> = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
];
