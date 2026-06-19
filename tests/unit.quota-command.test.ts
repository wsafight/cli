import { afterEach, describe, expect, it } from "bun:test";
import type { TakoConfig } from "../src/config";
import type { OfficialQuota } from "../src/quota";
import { buildQuotaPayload, runQuotaCommand } from "../src/quota/command";

const ORIGINAL_STDOUT_WRITE = process.stdout.write;

function config(overrides: Partial<TakoConfig> = {}): TakoConfig {
  return {
    apiKey: "",
    apiId: "",
    installedClients: {},
    ...overrides,
  };
}

function okQuota(apiId: string): OfficialQuota {
  return {
    provider: "tako",
    status: "ok",
    primary: {
      costUsed: apiId === "fresh-id" ? 23.617805056000005 : 12,
      costLimit: 36,
      usedPct: apiId === "fresh-id" ? 66 : 33,
      windowMinutes: 300,
    },
    daily: { costUsed: 55.44094080099994, costLimit: 120, usedPct: 46 },
    secondary: { costUsed: 191.37152484559988, costLimit: 400, usedPct: 48 },
    fetchedAt: Date.parse("2026-06-19T05:29:21.839Z"),
  };
}

afterEach(() => {
  process.stdout.write = ORIGINAL_STDOUT_WRITE;
});

describe("tako quota command", () => {
  it("formats five-hour, daily, and weekly Tako quota as JSON", async () => {
    const result = await buildQuotaPayload(config({
      providers: [{
        id: "p-tako",
        name: "Tako 官方",
        type: "tako",
        apiKey: "cr_test",
        apiId: "saved-id",
        createdAt: "2026-06-19T00:00:00.000Z",
      }],
    }), {
      fetchQuotaByApiId: async (apiId) => okQuota(apiId),
      resolveApiIdFromKey: async () => ({ valid: true, apiId: "fresh-id" }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.payload).toEqual({
      provider: "tako",
      status: "ok",
      fiveHour: {
        used: 12,
        limit: 36,
        usedPct: 33,
        remaining: 24,
        remainingPct: 67,
        windowMinutes: 300,
      },
      daily: {
        used: 55.44094080099994,
        limit: 120,
        usedPct: 46,
        remaining: 64.55905919900006,
        remainingPct: 54,
      },
      weekly: {
        used: 191.37152484559988,
        limit: 400,
        usedPct: 48,
        remaining: 208.62847515440012,
        remainingPct: 52,
      },
      fetchedAt: "2026-06-19T05:29:21.839Z",
    });
  });

  it("re-resolves apiId from Tako provider apiKey and retries when saved apiId fails", async () => {
    const calls: string[] = [];
    const result = await buildQuotaPayload(config({
      providers: [{
        id: "p-tako",
        name: "Tako 官方",
        type: "tako",
        apiKey: "cr_test",
        apiId: "stale-id",
        createdAt: "2026-06-19T00:00:00.000Z",
      }],
    }), {
      fetchQuotaByApiId: async (apiId) => {
        calls.push(apiId);
        if (apiId === "stale-id") {
          return {
            provider: "tako",
            status: "error",
            error: "bad_payload",
            hint: "Tako 用量数据格式异常",
            fetchedAt: Date.parse("2026-06-19T05:00:00.000Z"),
          };
        }
        return okQuota(apiId);
      },
      resolveApiIdFromKey: async (apiKey) => {
        expect(apiKey).toBe("cr_test");
        return { valid: true, apiId: "fresh-id" };
      },
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["stale-id", "fresh-id"]);
    expect(result.payload.status).toBe("ok");
    expect(result.payload.fiveHour).toEqual({
      used: 23.617805056000005,
      limit: 36,
      usedPct: 66,
      remaining: 12.382194943999995,
      remainingPct: 34,
      windowMinutes: 300,
    });
  });

  it("does not mix legacy apiId with provider apiKey", async () => {
    const calls: string[] = [];
    const result = await buildQuotaPayload(config({
      apiKey: "cr_legacy",
      apiId: "legacy-id",
      providers: [{
        id: "p-tako",
        name: "Tako 官方",
        type: "tako",
        apiKey: "cr_provider",
        createdAt: "2026-06-19T00:00:00.000Z",
      }],
    }), {
      fetchQuotaByApiId: async (apiId) => {
        calls.push(apiId);
        return okQuota(apiId);
      },
      resolveApiIdFromKey: async (apiKey) => {
        calls.push(`resolve:${apiKey}`);
        return { valid: true, apiId: "provider-id" };
      },
    });

    expect(result.exitCode).toBe(0);
    expect(calls).toEqual(["resolve:cr_provider", "provider-id"]);
    expect(result.payload.status).toBe("ok");
  });

  it("returns JSON error and non-zero exit code when Tako config is missing", async () => {
    const result = await buildQuotaPayload(config(), {
      fetchQuotaByApiId: async () => okQuota("unexpected"),
      resolveApiIdFromKey: async () => ({ valid: true, apiId: "unexpected" }),
    });

    expect(result.exitCode).toBe(1);
    expect(result.payload).toEqual({
      provider: "tako",
      status: "error",
      error: "missing_tako_provider",
      message: "Tako provider is not configured",
    });
  });

  it("runQuotaCommand writes one JSON object to stdout", async () => {
    let output = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    }) as typeof process.stdout.write;

    const code = await runQuotaCommand([], {
      loadConfig: async () => config({
        apiKey: "cr_legacy",
        apiId: "legacy-id",
      }),
      fetchQuotaByApiId: async (apiId) => okQuota(apiId),
      resolveApiIdFromKey: async () => ({ valid: true, apiId: "fresh-id" }),
    });

    expect(code).toBe(0);
    expect(JSON.parse(output)).toMatchObject({
      provider: "tako",
      status: "ok",
      fiveHour: { used: 12, limit: 36 },
    });
    expect(output.endsWith("\n")).toBe(true);
  });
});
