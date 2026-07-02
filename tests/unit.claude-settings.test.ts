import { describe, it, expect } from "bun:test";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  prepareTakoClaudeSettingsForLaunch,
  sanitizeClaudeSettingsForTako,
} from "../src/clients/claude-code";

describe("Claude Code settings isolation", () => {
  it("removes conflicting env keys without mutating the original settings object", () => {
    const original = {
      env: {
        ANTHROPIC_AUTH_TOKEN: "old-token",
        ANTHROPIC_BASE_URL: "https://old.example.com",
        API_TIMEOUT_MS: "1000",
        KEEP_ME: "yes",
      },
      statusLine: { type: "command", command: "tako statusline" },
    };

    const result = sanitizeClaudeSettingsForTako(original);

    expect(result.cleanedFields).toEqual([
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
      "API_TIMEOUT_MS",
    ]);
    expect(result.settings).toEqual({
      env: { KEEP_ME: "yes" },
      statusLine: { type: "command", command: "tako statusline" },
    });
    expect(original.env.ANTHROPIC_AUTH_TOKEN).toBe("old-token");
  });

  it("writes a Tako-managed clean settings file and returns Claude launch args", async () => {
    const dir = join(tmpdir(), `tako-claude-settings-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const sourcePath = join(dir, "source-settings.json");
    const targetPath = join(dir, "tako", "settings.json");

    await mkdir(dir, { recursive: true });
    try {
      await writeFile(
        sourcePath,
        JSON.stringify({
          env: {
            ANTHROPIC_AUTH_TOKEN: "old-token",
            NORMAL_ENV: "keep",
          },
          permissions: { allow: ["Bash(git *)"] },
        }),
      );

      const result = await prepareTakoClaudeSettingsForLaunch({
        sourcePath,
        targetPath,
        logConflicts: false,
      });

      expect(result).toBeDefined();
      expect(result!.args).toEqual([
        "--setting-sources",
        "project,local",
        "--settings",
        targetPath,
      ]);
      expect(result!.cleanedFields).toEqual(["ANTHROPIC_AUTH_TOKEN"]);

      const source = JSON.parse(await readFile(sourcePath, "utf-8"));
      const target = JSON.parse(await readFile(targetPath, "utf-8"));
      expect(source.env.ANTHROPIC_AUTH_TOKEN).toBe("old-token");
      expect(target).toEqual({
        env: { NORMAL_ENV: "keep" },
        permissions: { allow: ["Bash(git *)"] },
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns null when settings has no conflicting env keys", async () => {
    const dir = join(tmpdir(), `tako-claude-settings-clean-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const sourcePath = join(dir, "source-settings.json");
    const targetPath = join(dir, "tako", "settings.json");

    await mkdir(dir, { recursive: true });
    try {
      await writeFile(sourcePath, JSON.stringify({ env: { KEEP_ME: "yes" } }));
      const result = await prepareTakoClaudeSettingsForLaunch({
        sourcePath,
        targetPath,
        logConflicts: false,
      });
      expect(result).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
