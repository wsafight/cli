export type Backend = "claude" | "codex";

export type SessionStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "closed"
  | "dead";

export type ApprovalMode = "yolo" | "external";

export interface SessionMeta {
  sid: string;
  backend: Backend;
  name: string;
  model?: string;
  workdir: string;
  status: SessionStatus;
  approvalMode?: ApprovalMode;
  turnCount: number;
  createdAt: number;
  lastActiveAt: number;
  providerId?: string;
  codexThreadId?: string;
  codexPid?: number;
  codexSocket?: string;
}

export type NormalizedFrame =
  | { ts: number; kind: "session_started"; sid: string; backend: Backend; model?: string }
  | { ts: number; kind: "turn_started"; turnId: string }
  | { ts: number; kind: "text_delta"; text: string; itemId?: string }
  | { ts: number; kind: "tool_use"; name: string; input: unknown; itemId?: string }
  | { ts: number; kind: "tool_result"; itemId?: string; output: unknown }
  | { ts: number; kind: "reasoning_delta"; text: string }
  | { ts: number; kind: "approval_required"; approvalId: string | number; approvalType: "exec" | "patch" | "permission" | "tool" | "other"; params: unknown }
  | { ts: number; kind: "turn_completed"; turnId?: string; stopReason?: string; usage?: unknown }
  | { ts: number; kind: "error"; message: string; raw?: unknown }
  | { ts: number; kind: "session_closed" };

export interface Driver {
  readonly backend: Backend;
  start(opts: StartOpts): Promise<SessionMeta>;
  send(meta: SessionMeta, prompt: string, hooks?: SendHooks): Promise<SessionMeta>;
  cancel(meta: SessionMeta): Promise<void>;
  close(meta: SessionMeta): Promise<void>;
  isAlive(meta: SessionMeta): Promise<boolean>;
}

export interface StartOpts {
  sid: string;
  name: string;
  model?: string;
  workdir: string;
  approvalMode?: ApprovalMode;
  env: Record<string, string>;
  providerHint?: { type: string; apiKey?: string; baseUrl?: string };
  providerId?: string;
}

export interface SendHooks {
  onFrame?: (frame: NormalizedFrame) => void;
}
