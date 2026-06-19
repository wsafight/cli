# Tako Quota CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `tako quota` for script-friendly JSON access to Tako official provider quota.

**Architecture:** Add a small quota command module that loads Tako credentials, queries existing quota fetchers, retries with a freshly resolved API ID when needed, and formats a stable JSON payload. Wire the command into `src/index.ts` before interactive startup.

**Tech Stack:** Bun, TypeScript, existing `src/quota`, `src/config`, Bun test.

---

### Task 1: Quota Command Module

**Files:**
- Create: `src/quota/command.ts`
- Test: `tests/unit.quota-command.test.ts`

- [x] **Step 1: Write failing tests**

Add tests for success formatting, stale API ID retry, and missing config. Inject command dependencies so no real config file or network call is used.

- [x] **Step 2: Run tests to verify failure**

Run: `bun test tests/unit.quota-command.test.ts`

Expected: fail because `src/quota/command.ts` does not exist.

- [x] **Step 3: Implement minimal command module**

Create `runQuotaCommand(args?: string[]): Promise<number>` and helper formatting functions. Return numeric exit codes so tests can call the command without exiting the test process.

- [x] **Step 4: Run tests to verify pass**

Run: `bun test tests/unit.quota-command.test.ts`

Expected: pass.

### Task 2: CLI Wiring

**Files:**
- Modify: `src/index.ts`
- Test: `tests/unit.quota-command.test.ts`

- [x] **Step 1: Add a failing CLI smoke test if practical**

Validate the command module behavior directly; avoid spawning the full CLI unless build output is needed.

- [x] **Step 2: Wire `tako quota` in `src/index.ts`**

Add an `args[0] === "quota"` branch before analytics, update help command list, and call `process.exit(code)` only when code is non-zero.

- [x] **Step 3: Run targeted tests**

Run: `bun test tests/unit.quota-command.test.ts tests/unit.quota.test.ts`

Expected: pass.

### Task 3: Verification

**Files:**
- Modify only if verification exposes issues.

- [x] **Step 1: Run build**

Run: `bun run build`

Expected: build completes successfully.

- [x] **Step 2: Smoke test local command**

Run: `bun src/index.ts quota`

Expected: JSON object on stdout with `status`.
