import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getClientLaunchOptions } from "../src/clients/base";
import { claudeCodeClient } from "../src/clients/claude-code";
import { codexClient } from "../src/clients/codex";
import type { Provider } from "../src/providers/types";
import { _resetTakoCatalog, _setCachePathForTest } from "../src/models/tako";

const BASE_URL = "https://models.example.test";

function provider(clientId: string): Provider {
  return {
    id: `p-${clientId}`,
    name: "P",
    type: "tako",
    baseUrl: BASE_URL,
    apiKey: "sk-test",
    supportedClients: [clientId],
    createdAt: "2026-07-04T00:00:00.000Z",
  };
}

function entry(id: string) {
  return {
    id,
    displayName: id,
    description: id,
    contextWindow: 200000,
    sortOrder: 0,
  };
}

describe("dynamic model launch options", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "tako-dynamic-models-"));
    const cachePath = join(tmpDir, "tako-models-cache.json");
    _setCachePathForTest(cachePath);
    _resetTakoCatalog();
    writeFileSync(
      cachePath,
      JSON.stringify({
        version: 1,
        buckets: {
          [`${BASE_URL}#openai`]: {
            fetchedAt: Date.now(),
            entries: [
              entry("gpt-5.5"),
              entry("claude-opus-4-8"),
              entry("full-claude-opus-4-8"),
              entry("anthropic/claude-sonnet-4-6"),
            ],
          },
          [`${BASE_URL}#claude`]: {
            fetchedAt: Date.now(),
            entries: [
              entry("claude-opus-4-8"),
              entry("full-claude-opus-4-8"),
              entry("gpt-5.5"),
              entry("openai/gpt-5.4"),
            ],
          },
        },
      }),
    );
  });

  afterEach(() => {
    _setCachePathForTest(null);
    _resetTakoCatalog();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("Codex model picker includes every model returned by the server cache", () => {
    const opts = getClientLaunchOptions(codexClient, provider("codex"));
    const ids = opts.filter((o) => o.group === "model").map((o) => o.id);

    expect(ids).toEqual([
      "model-gpt-5.5",
      "model-claude-opus-4-8",
      "model-full-claude-opus-4-8",
      "model-anthropic/claude-sonnet-4-6",
    ]);
  });

  it("Claude Code model picker includes every model returned by the server cache", () => {
    const opts = getClientLaunchOptions(claudeCodeClient, provider("claude-code"));
    const ids = opts.filter((o) => o.group === "model").map((o) => o.id);

    expect(ids).toEqual([
      "model-claude-opus-4-8",
      "model-full-claude-opus-4-8",
      "model-gpt-5.5",
      "model-openai/gpt-5.4",
    ]);
  });
});
