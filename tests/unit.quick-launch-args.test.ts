/**
 * tako --claude / --codex / --gemini 参数透传
 *
 * 设计：buildPassthroughArgs 是 quickLaunch 用的纯函数，
 * 负责剥掉 shortcut 标志本身，并对 claude-code 的 --model 自动补 [1m]
 * （与交互菜单选模型行为一致；底层用 appendOneMTagIfNeeded 决定是否补）。
 */
import { describe, it, expect } from "bun:test";
import { buildPassthroughArgs } from "../src/quick-launch-args";

import "../src/clients";

describe("buildPassthroughArgs", () => {
  it("无额外参数 → 返回空数组", () => {
    expect(buildPassthroughArgs("claude-code", ["--claude"], "--claude")).toEqual([]);
  });

  it("claude-code: --model <id> → 自动补 [1m]（catalog 1M 模型）", () => {
    expect(
      buildPassthroughArgs(
        "claude-code",
        ["--claude", "--model", "claude-opus-4-7"],
        "--claude",
      ),
    ).toEqual(["--model", "claude-opus-4-7[1m]"]);
  });

  it("claude-code: --model=<id> 形式同样自动补 [1m]", () => {
    expect(
      buildPassthroughArgs(
        "claude-code",
        ["--claude", "--model=claude-opus-4-7"],
        "--claude",
      ),
    ).toEqual(["--model=claude-opus-4-7[1m]"]);
  });

  it("claude-code: 200k 模型不补后缀", () => {
    expect(
      buildPassthroughArgs(
        "claude-code",
        ["--claude", "--model", "claude-sonnet-4-5"],
        "--claude",
      ),
    ).toEqual(["--model", "claude-sonnet-4-5"]);
  });

  it("claude-code: 已带 [1m] 不重复加", () => {
    expect(
      buildPassthroughArgs(
        "claude-code",
        ["--claude", "--model", "claude-opus-4-7[1m]"],
        "--claude",
      ),
    ).toEqual(["--model", "claude-opus-4-7[1m]"]);
  });

  it("claude-code: 非 --model 参数原样透传", () => {
    expect(
      buildPassthroughArgs(
        "claude-code",
        ["--claude", "--resume", "abc", "--continue"],
        "--claude",
      ),
    ).toEqual(["--resume", "abc", "--continue"]);
  });

  it("claude-code: shortcut 标志可在中间，仍能正确剥除", () => {
    expect(
      buildPassthroughArgs(
        "claude-code",
        ["--model", "claude-opus-4-7", "--claude"],
        "--claude",
      ),
    ).toEqual(["--model", "claude-opus-4-7[1m]"]);
  });

  it("claude-code: --model 末尾孤立（缺值）→ 原样透传，交给 claude 自己报错", () => {
    expect(
      buildPassthroughArgs("claude-code", ["--claude", "--model"], "--claude"),
    ).toEqual(["--model"]);
  });

  it("codex: --model 不补 [1m]（无 1M 概念）", () => {
    expect(
      buildPassthroughArgs(
        "codex",
        ["--codex", "--model", "claude-opus-4-7"],
        "--codex",
      ),
    ).toEqual(["--model", "claude-opus-4-7"]);
  });

  it("gemini: --model 不补 [1m]", () => {
    expect(
      buildPassthroughArgs(
        "gemini",
        ["--gemini", "--model", "claude-opus-4-7"],
        "--gemini",
      ),
    ).toEqual(["--model", "claude-opus-4-7"]);
  });

  it("claude-code: 多个 --model 全部处理（最后一个生效由 claude 决定）", () => {
    expect(
      buildPassthroughArgs(
        "claude-code",
        [
          "--claude",
          "--model",
          "claude-opus-4-7",
          "--resume",
          "x",
          "--model=claude-sonnet-4-6",
        ],
        "--claude",
      ),
    ).toEqual([
      "--model",
      "claude-opus-4-7[1m]",
      "--resume",
      "x",
      "--model=claude-sonnet-4-6[1m]",
    ]);
  });
});
