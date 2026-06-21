import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { TakoConfig } from "../src/config";
import type { TakoApiType, TakoModelEntry } from "../src/models/tako";
import type { ModelsCommandDeps } from "../src/models/command";
import { runModelsCommand } from "../src/models/command";

const ORIGINAL_STDOUT_WRITE = process.stdout.write;
const ORIGINAL_STDERR_WRITE = process.stderr.write;

interface Captured {
  stdout: string;
  stderr: string;
}

function captureOutput(): Captured {
  const captured: Captured = { stdout: "", stderr: "" };
  process.stdout.write = ((chunk: any) => {
    captured.stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: any) => {
    captured.stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  return captured;
}

function config(overrides: Partial<TakoConfig> = {}): TakoConfig {
  return {
    apiKey: "",
    apiId: "",
    installedClients: {},
    ...overrides,
  };
}

function entry(id: string, opts: Partial<TakoModelEntry> = {}): TakoModelEntry {
  return {
    id,
    displayName: opts.displayName ?? id,
    description: opts.description ?? "",
    contextWindow: opts.contextWindow ?? 200000,
    sortOrder: opts.sortOrder ?? 0,
  };
}

function takoProvider(id: string, baseUrl: string) {
  return {
    id,
    name: id,
    type: "tako" as const,
    baseUrl,
    apiKey: `key-${id}`,
    createdAt: "2026-06-19T00:00:00.000Z",
  };
}

function makeDeps(over: Partial<ModelsCommandDeps>): ModelsCommandDeps {
  return {
    now: () => Date.parse("2026-06-21T00:00:00.000Z"),
    columns: () => 80,
    refresh: async () => {},
    read: () => null,
    loadConfig: async () => config(),
    ...over,
  };
}

afterEach(() => {
  process.stdout.write = ORIGINAL_STDOUT_WRITE;
  process.stderr.write = ORIGINAL_STDERR_WRITE;
});

describe("tako models command", () => {
  it("text mode: 没有 tako provider 时退出 0 并打印提示", async () => {
    const cap = captureOutput();
    const code = await runModelsCommand(
      [],
      makeDeps({ loadConfig: async () => config() }),
    );
    expect(code).toBe(0);
    expect(cap.stdout).toContain("未配置 Tako 渠道");
    expect(cap.stderr).toBe("");
  });

  it("json mode: 没有 tako provider 时输出空 providers 数组", async () => {
    const cap = captureOutput();
    const code = await runModelsCommand(["--json"], makeDeps({}));
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.stdout);
    expect(parsed.providers).toEqual([]);
    expect(parsed.command).toBe("list");
    expect(parsed.refreshed).toBe(false);
  });

  it("text mode: 缓存为空提示，但不影响其他 provider 渲染", async () => {
    const cap = captureOutput();
    const code = await runModelsCommand(
      [],
      makeDeps({
        loadConfig: async () =>
          config({
            providers: [
              takoProvider("a-empty", "https://a.example"),
              takoProvider("b-has", "https://b.example"),
            ],
          }),
        read: (baseUrl, apiType) => {
          if (baseUrl === "https://b.example" && apiType === "openai") {
            return [entry("zzz-model"), entry("aaa-model")];
          }
          return null;
        },
      }),
    );
    expect(code).toBe(0);
    expect(cap.stdout).toContain("Provider: a-empty");
    expect(cap.stdout).toContain("缓存为空");
    expect(cap.stdout).toContain("Provider: b-has");
    expect(cap.stdout).toContain("2 models");
    // 排序：aaa 出现在 zzz 之前
    const aIdx = cap.stdout.indexOf("aaa-model");
    const zIdx = cap.stdout.indexOf("zzz-model");
    expect(aIdx).toBeGreaterThan(0);
    expect(zIdx).toBeGreaterThan(aIdx);
  });

  it("json mode: 模型按 (id, displayName) 升序输出", async () => {
    const cap = captureOutput();
    const code = await runModelsCommand(
      ["--json"],
      makeDeps({
        loadConfig: async () =>
          config({
            providers: [takoProvider("p", "https://p.example")],
          }),
        read: (_b, apiType) => {
          if (apiType === "openai") {
            return [
              entry("gpt-5.5"),
              entry("claude-opus-4-7"),
              entry("aaa"),
            ];
          }
          return [entry("claude-sonnet-4-6")];
        },
      }),
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.stdout);
    expect(parsed.providers).toHaveLength(1);
    const ids = parsed.providers[0].models.map(
      (m: { id: string }) => m.id,
    );
    // openai 桶内排序后，再接 claude 桶
    expect(ids).toEqual([
      "aaa",
      "claude-opus-4-7",
      "gpt-5.5",
      "claude-sonnet-4-6",
    ]);
    expect(parsed.providers[0].hasCache).toBe(true);
  });

  it("--refresh: 调用 refresh 后再读缓存", async () => {
    const cap = captureOutput();
    const calls: Array<[string, TakoApiType]> = [];
    let refreshed = false;
    const code = await runModelsCommand(
      ["--refresh", "--json"],
      makeDeps({
        loadConfig: async () =>
          config({
            providers: [takoProvider("p", "https://p.example")],
          }),
        refresh: async (baseUrl, _apiKey, apiType) => {
          calls.push([baseUrl, apiType]);
          refreshed = true;
        },
        read: () => (refreshed ? [entry("fresh-model")] : null),
      }),
    );
    expect(code).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c[1]).sort()).toEqual(["claude", "openai"]);
    const parsed = JSON.parse(cap.stdout);
    expect(parsed.refreshed).toBe(true);
    const ids = parsed.providers[0].models.map(
      (m: { id: string }) => m.id,
    );
    // openai + claude 两个桶都拿到了 fresh-model
    expect(ids.filter((i: string) => i === "fresh-model").length).toBe(2);
  });

  it("--refresh: 单个 (provider, apiType) 失败时不抛出，其他继续渲染", async () => {
    const cap = captureOutput();
    const code = await runModelsCommand(
      ["--refresh", "--json"],
      makeDeps({
        loadConfig: async () =>
          config({
            providers: [takoProvider("p", "https://p.example")],
          }),
        refresh: async (_url, _key, apiType) => {
          if (apiType === "openai") throw new Error("network down");
        },
        read: (_url, apiType) =>
          apiType === "claude" ? [entry("only-claude")] : null,
      }),
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.stdout);
    expect(parsed.providers[0].hasCache).toBe(true);
    const ids = parsed.providers[0].models.map(
      (m: { id: string }) => m.id,
    );
    expect(ids).toEqual(["only-claude"]);
  });

  it("非法参数：写 stderr 并返回 1", async () => {
    const cap = captureOutput();
    const code = await runModelsCommand(["--unknown"], makeDeps({}));
    expect(code).toBe(1);
    expect(cap.stderr).toContain("Unknown argument: --unknown");
    expect(cap.stdout).toBe("");
  });

  it("text mode: openai+claude 去重，按前 3 字母分组换行，每行最多 5 个", async () => {
    const cap = captureOutput();
    const code = await runModelsCommand(
      [],
      makeDeps({
        columns: () => 200,
        loadConfig: async () =>
          config({
            providers: [takoProvider("p", "https://p.example")],
          }),
        read: () => [
          entry("claude-haiku"),
          entry("claude-opus"),
          entry("claude-sonnet"),
          entry("gpt-4o"),
          entry("gpt-5"),
          entry("gpt-image"),
          entry("gpt-mini"),
          entry("gpt-pro"),
          entry("gpt-turbo"),
          entry("mimo-v1"),
        ],
      }),
    );
    expect(code).toBe(0);
    const lines = cap.stdout.split("\n");
    // 找包含 claude- 模型的那一行
    const claudeLine = lines.find((l) => l.includes("claude-haiku"));
    expect(claudeLine).toBeDefined();
    // claude 那行应包含 3 个 claude，但不混入 gpt
    expect(claudeLine).toContain("claude-haiku");
    expect(claudeLine).toContain("claude-opus");
    expect(claudeLine).toContain("claude-sonnet");
    expect(claudeLine!.includes("gpt-")).toBe(false);
    // gpt 有 6 个，应该分成两行（≤5/行）
    const gptLines = lines.filter((l) => l.includes("gpt-"));
    expect(gptLines.length).toBeGreaterThanOrEqual(2);
    // 第一行 gpt 行不能含 mimo
    expect(gptLines[0].includes("mimo-")).toBe(false);
    // mimo 单独一行
    const mimoLine = lines.find((l) => l.includes("mimo-v1"));
    expect(mimoLine).toBeDefined();
    expect(mimoLine!.includes("gpt-")).toBe(false);
    // 总数行存在
    expect(cap.stdout).toContain("10 models");
    // openai+claude 去重后没有重复 id（计数等于唯一数）
    const haikuOccurrences = cap.stdout.split("claude-haiku").length - 1;
    expect(haikuOccurrences).toBe(1);
  });

  it("text mode: openai 和 claude 同 id 去重", async () => {
    const cap = captureOutput();
    const code = await runModelsCommand(
      [],
      makeDeps({
        columns: () => 80,
        loadConfig: async () =>
          config({
            providers: [takoProvider("p", "https://p.example")],
          }),
        read: () => [entry("dup-model")],
      }),
    );
    expect(code).toBe(0);
    const occurrences = cap.stdout.split("dup-model").length - 1;
    expect(occurrences).toBe(1);
    expect(cap.stdout).toContain("1 models");
  });

  it("Provider 之间按 id 升序排列", async () => {
    const cap = captureOutput();
    const code = await runModelsCommand(
      ["--json"],
      makeDeps({
        loadConfig: async () =>
          config({
            providers: [
              takoProvider("zeta", "https://z.example"),
              takoProvider("alpha", "https://a.example"),
            ],
          }),
        read: () => [entry("m")],
      }),
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.stdout);
    expect(parsed.providers.map((p: { id: string }) => p.id)).toEqual([
      "alpha",
      "zeta",
    ]);
  });

  it("非 tako 类型的 provider 被过滤", async () => {
    const cap = captureOutput();
    const code = await runModelsCommand(
      ["--json"],
      makeDeps({
        loadConfig: async () =>
          config({
            providers: [
              {
                id: "depseek-1",
                name: "DeepSeek",
                type: "deepseek",
                baseUrl: "https://api.depseek.com",
                apiKey: "k",
                createdAt: "2026-06-19T00:00:00.000Z",
              },
              takoProvider("tako-1", "https://t.example"),
            ],
          }),
        read: () => [entry("m")],
      }),
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(cap.stdout);
    expect(parsed.providers).toHaveLength(1);
    expect(parsed.providers[0].id).toBe("tako-1");
  });
});
