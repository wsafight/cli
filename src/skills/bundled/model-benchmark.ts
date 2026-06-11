import type { BundledSkill } from '../index';

const fence = '```';

export const modelBenchmark: BundledSkill = {
  name: 'model-benchmark',
  description: 'Tako 模型评测结果与推荐 — 查询各模型编码能力评分',
  filename: 'SKILL.md',
  content: `---
name: model-benchmark
description: "Tako 模型评测结果与推荐：查询各模型编码能力评分、选模型建议、性价比对比。触发词: 模型推荐, benchmark, 哪个模型好, 选模型, model comparison, 模型对比, 国产模型, 评测结果"
allowed-tools: Read, Bash(bun:*)
---

# Tako Model Benchmark 结果 (2026-06-10)

通过 Tako Provider API 评测 16 个模型在 7 个编码任务上的表现。

## 评测结果

| Model | Fib | Bug Fix | Explain | Refactor | Types | Observer | Constraints | Score |
|-------|-----|---------|---------|----------|-------|----------|-------------|-------|
| mimo-v2.5-pro | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | **7/7** |
| claude-sonnet-4-6 | ✓ | ✓ | ◐ | ✓ | ✓ | ✓ | ✓ | **6.5/7** |
| minimax-m2.5 | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | **6.5/7** |
| deepseek-v4-flash | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | 6/7 |
| gpt-5.4 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | 6/7 |
| gpt-5.5 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | 6/7 |
| claude-opus-4-6 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | 6/7 |
| claude-opus-4-8 | ✓ | ✓ | ◐ | ✓ | ✓ | ✗ | ✓ | 5.5/7 |
| deepseek-v4-pro | ✓ | ✓ | ✓ | ✓ | ◐ | ✗ | ✓ | 5.5/7 |
| mimo-v2.5 | ✓ | ✓ | ✓ | ✓ | ◐ | ✗ | ✓ | 5.5/7 |
| glm-5 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ⚠ | 5/7 |
| claude-opus-4-7 | ◐ | ✓ | ◐ | ✓ | ✓ | ✗ | ✓ | 5/7 |
| minimax-m3 | ✓ | ✓ | ✓ | ⚠ | ⚠ | ✗ | ✓ | 4/7* |
| deepseek-3.2 | ⚠ | ✓ | ⚠ | ✓ | ⚠ | ✗ | ✓ | 3/7* |
| glm-5.1 | ✓ | ✓ | ⚠ | ⚠ | ⚠ | ⚠ | ✓ | 3/7* |
| qwen3.7-max | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | ⚠ | 0/7* |

*⚠ = API 不可用（502/504），非模型能力问题

## 推荐

| 场景 | 模型 | 理由 |
|------|------|------|
| 最强编码能力 | mimo-v2.5-pro | 唯一 7/7 全通过 |
| 性价比之选 | minimax-m2.5 | 响应快（3-10s）+ 高通过率 |
| 通用最佳 | claude-sonnet-4-6 | 6.5/7 + 复杂任务表现好 |
| 快速简单任务 | deepseek-v4-flash | 响应最快（2-8s）、简单任务全对 |

## 测试任务说明

| ID | 难度 | 任务 |
|----|------|------|
| TP-AGENT-01 | Easy | 写 fibonacci 函数 (Python) |
| TP-AGENT-02 | Easy | 修复 off-by-one bug |
| TP-AGENT-03 | Easy | 解释 debounce 代码 |
| TP-AGENT-04 | Medium | 函数拆分重构 |
| TP-AGENT-05 | Medium | TypeScript 泛型类型补充 |
| TP-AGENT-06 | Hard | 实现 EventEmitter (观察者模式 + 泛型) |
| TP-AGENT-07 | Hard | 多约束代码生成 |

## 重跑 Benchmark

${fence}bash
cd packages/cli && bun run scripts/benchmark-models.ts
${fence}
`,
};
