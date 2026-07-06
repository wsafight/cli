import type { Provider, ProviderType } from "../../providers/types";
import type { UsageStats } from "../../stats";
import type { OfficialQuota } from "../../quota";
import type { VersionInfo } from "../../installer-versions";
import type { Backend, NormalizedFrame, SessionMeta } from "../../agent/types";
import type { ApprovalRequest } from "../../agent/storage";
import type {
  LauncherClientData,
  LauncherResult as SharedLauncherResult,
  OptionRow as SharedOptionRow,
} from "../shared/types";
import type { ModelPickerMode } from "../shared/model-picker";

export interface ClientData extends LauncherClientData {
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
  | "agent-new"
  | "key-guide"
  | "client-versions";
export type ProviderInputMode = "add-key" | "add-url" | "add-model" | "add-ctx" | "rekey";

export type OptionRow = SharedOptionRow;

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
  modelPickerMode: ModelPickerMode;
  scrollOffset: number;
  scrollScreen: Screen;
  zh: boolean;
  pickCounts: Record<string, number>;
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

  quota?: OfficialQuota;
  quotaKey?: string;

  keyGuideIdx: number;

  clientVersions: VersionInfo[];
  clientVersionsClientIdx: number;
  clientVersionsIdx: number;
  clientVersionsLoading: boolean;
  clientVersionsError?: string;
}

export type LauncherResult = SharedLauncherResult;
