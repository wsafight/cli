import type { TakoConfig } from "../config";
import { loadConfig, PROXY_BASE_URL } from "../config";
import { fetchTakoQuotaByApiId } from "./tako";
import type { OfficialQuota, QuotaSlot } from "./types";

type ApiIdResult = { valid: boolean; apiId?: string; error?: string };

async function resolveApiIdFromKey(apiKey: string): Promise<ApiIdResult> {
  try {
    const response = await fetch(`${PROXY_BASE_URL}/apiStats/api/get-key-id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
      signal: AbortSignal.timeout(5000),
    });
    const data: { success?: boolean; data?: { id?: string }; error?: string } = await response.json();
    if (data.success && data.data?.id) return { valid: true, apiId: data.data.id };
    return { valid: false, error: data.error || "Tako key validation failed" };
  } catch (e) {
    return { valid: false, error: String((e as Error).message ?? e) };
  }
}

export interface QuotaCommandDeps {
  loadConfig?: () => Promise<TakoConfig>;
  fetchQuotaByApiId?: (apiId: string) => Promise<OfficialQuota>;
  resolveApiIdFromKey?: (apiKey: string) => Promise<ApiIdResult>;
}

interface QuotaJsonSlot {
  used?: number;
  limit?: number;
  usedPct: number;
  remaining?: number;
  remainingPct?: number;
  windowMinutes?: number;
  resetsAt?: string;
}

type QuotaJsonPayload =
  | {
      provider: "tako";
      status: "ok";
      fiveHour?: QuotaJsonSlot;
      daily?: QuotaJsonSlot;
      weekly?: QuotaJsonSlot;
      fetchedAt: string;
    }
  | {
      provider: "tako";
      status: "error";
      error: string;
      message: string;
      hint?: string;
    };

export interface QuotaCommandResult {
  exitCode: number;
  payload: QuotaJsonPayload;
}

interface TakoCredentials {
  apiId: string;
  apiKey: string;
}

function getTakoCredentials(config: TakoConfig): TakoCredentials | null {
  const provider = (config.providers ?? []).find((p) => p.type === "tako");
  const apiId = provider ? provider.apiId || "" : config.apiId || "";
  const apiKey = provider ? provider.apiKey || "" : config.apiKey || "";
  if (!apiId && !apiKey) return null;
  return { apiId, apiKey };
}

function toJsonSlot(slot: QuotaSlot | undefined): QuotaJsonSlot | undefined {
  if (!slot) return undefined;

  const out: QuotaJsonSlot = {
    usedPct: slot.usedPct,
    ...(slot.windowMinutes ? { windowMinutes: slot.windowMinutes } : {}),
    ...(slot.resetsAt ? { resetsAt: slot.resetsAt } : {}),
  };

  if (typeof slot.costUsed === "number") out.used = slot.costUsed;
  if (typeof slot.costLimit === "number") {
    out.limit = slot.costLimit;
    const used = slot.costUsed ?? 0;
    out.remaining = Math.max(0, slot.costLimit - used);
    out.remainingPct = Math.max(0, Math.min(100, 100 - Math.round(slot.usedPct)));
  }

  return out;
}

function errorPayload(error: string, message: string, hint?: string): QuotaCommandResult {
  return {
    exitCode: 1,
    payload: {
      provider: "tako",
      status: "error",
      error,
      message,
      ...(hint ? { hint } : {}),
    },
  };
}

function successPayload(quota: OfficialQuota): QuotaCommandResult {
  return {
    exitCode: 0,
    payload: {
      provider: "tako",
      status: "ok",
      fiveHour: toJsonSlot(quota.primary),
      daily: toJsonSlot(quota.daily),
      weekly: toJsonSlot(quota.secondary),
      fetchedAt: new Date(quota.fetchedAt).toISOString(),
    },
  };
}

function quotaErrorResult(quota: OfficialQuota): QuotaCommandResult {
  return errorPayload(
    quota.error || "quota_unavailable",
    quota.hint || "Tako quota is unavailable",
    quota.hint,
  );
}

export async function buildQuotaPayload(
  config: TakoConfig,
  deps: QuotaCommandDeps = {},
): Promise<QuotaCommandResult> {
  const fetchQuota = deps.fetchQuotaByApiId ?? fetchTakoQuotaByApiId;
  const resolveApiId = deps.resolveApiIdFromKey ?? resolveApiIdFromKey;
  const credentials = getTakoCredentials(config);

  if (!credentials) {
    return errorPayload("missing_tako_provider", "Tako provider is not configured");
  }

  let quota: OfficialQuota | null = null;
  if (credentials.apiId) {
    quota = await fetchQuota(credentials.apiId);
    if (quota.status === "ok") return successPayload(quota);
  }

  if (credentials.apiKey) {
    const resolved = await resolveApiId(credentials.apiKey);
    if (resolved.valid && resolved.apiId && resolved.apiId !== credentials.apiId) {
      quota = await fetchQuota(resolved.apiId);
      if (quota.status === "ok") return successPayload(quota);
    } else if (!credentials.apiId) {
      return errorPayload(
        "api_id_refresh_failed",
        resolved.error || "Unable to resolve Tako API ID from API key",
      );
    }
  }

  if (quota) return quotaErrorResult(quota);
  return errorPayload("missing_api_id", "Tako API ID is not configured");
}

export async function runQuotaCommand(
  args: string[] = [],
  deps: QuotaCommandDeps = {},
): Promise<number> {
  if (args.length > 0) {
    const result = errorPayload("invalid_args", "Usage: tako quota");
    process.stdout.write(`${JSON.stringify(result.payload)}\n`);
    return result.exitCode;
  }

  const readConfig = deps.loadConfig ?? loadConfig;
  const result = await buildQuotaPayload(await readConfig(), deps);
  process.stdout.write(`${JSON.stringify(result.payload)}\n`);
  return result.exitCode;
}
