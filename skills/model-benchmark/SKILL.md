---
name: model-benchmark
description: "Tako 模型选择指南：一张表看出该用哪个模型——编码能力评分、速度、最适合场景、性价比。触发词: 模型推荐, benchmark, 哪个模型好, 选模型, 用哪个模型, model comparison, 模型对比, 国产模型, 评测结果"
allowed-tools: Read, Bash(bun:*)
---

# Tako 模型选择指南 (benchmark 2026-06-10)

通过 Tako Provider API 评测 16 个模型在 7 个编码任务上的表现。
**下表合并了能力评分与场景推荐，按推荐度排序——直接选第一个符合你场景的模型即可。**

## 选哪个模型（能力 + 推荐合并）

| 模型 | 综合分 | 速度 | 最适合场景 | 备注 |
|------|:------:|------|-----------|------|
| **mimo-v2.5-pro** | 7/7 | 中 | 最强编码 / 复杂任务 / 拿不准时的默认选择 | 唯一全通过 |
| **claude-sonnet-4-6** | 6.5/7 | 中 | 通用最佳 / 复杂推理 / 长上下文(1M) | 综合最稳 |
| **minimax-m2.5** | 6.5/7 | 快(3-10s) | 性价比首选 / 批量任务 | 快且准 |
| **deepseek-v4-flash** | 6/7 | 最快(2-8s) | 快速简单任务 / 高并发初筛 | 简单任务全对 |
| gpt-5.5 / gpt-5.4 | 6/7 | 中 | OpenAI 生态 / Codex 后端 | — |
| claude-opus-4-6 | 6/7 | 慢 | 追求最高质量、不在意成本时 | — |
| claude-opus-4-8 | 5.5/7 | 慢 | 复杂任务 + thinking | 最新 opus |
| deepseek-v4-pro / mimo-v2.5 | 5.5/7 | 中 | 国产替代、成本敏感 | — |
| glm-5 / claude-opus-4-7 | 5/7 | 中 | 备选 | — |

> 评分为 7 个编码任务通过数。其余未列模型（minimax-m3/deepseek-3.2/glm-5.1/qwen3.7-max）
> 因 API 不稳定（502/504）评分不可信，暂不推荐。

## 详细评测分项

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

## 测试任务说明

| ID | 难度 | 任务 |
|----|------|------|
| TP-BENCH-01 | Easy | 写 fibonacci 函数 (Python) |
| TP-BENCH-02 | Easy | 修复 off-by-one bug |
| TP-BENCH-03 | Easy | 解释 debounce 代码 |
| TP-BENCH-04 | Medium | 函数拆分重构 |
| TP-BENCH-05 | Medium | TypeScript 泛型类型补充 |
| TP-BENCH-06 | Hard | 实现 EventEmitter (观察者模式 + 泛型) |
| TP-BENCH-07 | Hard | 多约束代码生成 |

## 重跑 Benchmark

```bash
cd packages/cli && bun run scripts/benchmark-models.ts
```
