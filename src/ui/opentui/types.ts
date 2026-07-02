import type { ClientConfig, LaunchOption } from "../../clients";
import type { Provider, ProviderType } from "../../providers/types";
import type { UsageStats } from "../../stats";
import type { Backend, NormalizedFrame, SessionMeta } from "../../agent/types";
import type { ApprovalRequest } from "../../agent/storage";

export interface ProjectItem {
  label: string;
  hint: string;
  path?: string;
}

export interface ClientData {
  client: ClientConfig;
  projects: ProjectItem[];
  providers: Provider[];
  activeProvider?: Provider;
  launchOptions: LaunchOption[];
  enabled: Set<string>;
}

export type FocusArea = "tabs" | "projects" | "options";
export type Screen =
  | "launcher"
  | "providers"
  | "provider-detail"
  | "provider-add-type"
  | "provider-input"
  | "stats"
  | "config"
  | "language"
  | "option-picker"
  | "agents"
  | "agent-detail"
  | "agent-new";
export type ProviderInputMode = "add-key" | "add-url" | "add-model" | "add-ctx" | "rekey";

export type OptionRow =
  | { kind: "flag"; opt: LaunchOption }
  | { kind: "group"; group: string; title: string }
  | { kind: "provider"; title: string };

export type DetailAction = "default" | "rekey" | "relogin" | "delete" | "back";
export type SubscriptionTool = "claude" | "codex";

export interface AppState {
  screen: Screen;
  clients: ClientData[];
  clientIdx: number;
  focus: FocusArea;
  projectIdx: number;
  optionIdx: number;
  optionPickerGroup?: string;
  optionPickerIdx: number;
  scrollOffset: number;
  scrollScreen: Screen;
  zh: boolean;
  busy: boolean;
  message: string;

  providers: Provider[];
  defaultProviderId?: string;
  clientBindings: Record<string, string | undefined>;
  providerTabIdx: number;
  providerRowIdx: number;
  providerDetailIdx: number;
  providerSelectedId?: string;
  providerInputMode: ProviderInputMode;
  addType: ProviderType;
  addKey: string;
  addUrl: string;
  addModel: string;
  addCtx: string;

  statsLoading: boolean;
  statsData?: UsageStats;
  statsError?: string;

  apiKeyValue: string;
  apiKeyStatus: "idle" | "validating" | "success" | "error";
  apiKeyError?: string;

  languageIdx: number;

  agentSessions?: SessionMeta[];
  agentDefaults: Record<string, string>;
  agentIdx: number;
  agentDetailSid?: string;
  agentDetailMeta?: SessionMeta;
  agentDetailFrames: NormalizedFrame[];
  agentDetailAlive?: boolean;
  agentDetailInput: string;
  agentDetailStatus: "idle" | "sending" | "cancelling";
  agentPendingApprovals: ApprovalRequest[];
  agentBackend: Backend;
  agentModel: string;
  agentName: string;
  agentField: "backend" | "model" | "name";
  agentError?: string;
}

export type LauncherResult =
  | {
      type: "launch";
      clientId: string;
      projectPath?: string;
      args: string[];
      envVars: Record<string, string>;
      selectedOptionIds: string[];
    }
  | { type: "agent" }
  | { type: "stats" }
  | { type: "config" }
  | { type: "language" }
  | { type: "providers" }
  | { type: "provider-login"; tool: SubscriptionTool }
  | { type: "exit" };
