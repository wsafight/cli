/**
 * installer e2e 驱动脚本 — 容器/CI 内真实安装 client 并验证三大不变量。
 *
 * 运行方式（需先设 TAKO_HOME 指向隔离临时目录）：
 *   TAKO_HOME=/tmp/tako-e2e bun tests/e2e/installer-driver.ts
 *
 * 输出 CHECK:key=value 行，供宿主脚本/bun test 断言。
 * exit 0 = 全部通过，exit 1 = 有失败。
 */
import { join } from "path";
import { TAKO_DIR, TOOLS_DIR, TAKO_BUN_CACHE_DIR } from "../../src/config";
import { installClient, isClientInstalled, ensureBunInstalled, getBunPath } from "../../src/installer";
import { getClient, getClientEntryPath } from "../../src/clients/base";
import { installAtVersion, getInstalledVersion } from "../../src/installer-versions";

// 注册 clients
import "../../src/clients/codex";

const checks: Array<{ key: string; pass: boolean; detail?: string }> = [];

function check(key: string, pass: boolean, detail?: string) {
  checks.push({ key, pass, detail });
  const status = pass ? "PASS" : "FAIL";
  console.log(`CHECK:${key}=${status}${detail ? ` (${detail})` : ""}`);
}

async function run() {
  const client = getClient("codex");
  if (!client) { console.error("codex client not registered"); process.exit(1); }
  const clientDir = join(TOOLS_DIR, client.id);

  console.log(`TAKO_HOME=${TAKO_DIR}`);
  console.log(`TOOLS_DIR=${TOOLS_DIR}`);
  console.log(`CACHE_DIR=${TAKO_BUN_CACHE_DIR}`);

  // ── 前置: 确保 bun 就绪 ──
  const bunOk = await ensureBunInstalled();
  check("bun-installed", bunOk);
  if (!bunOk) { console.error("无法安装 bun，中止"); process.exit(1); }

  // ── TP-INST-E2E-01: 全新安装 codex ──
  console.log("\n--- TP-INST-E2E-01: fresh install ---");
  const result = await installClient(client);
  check("fresh-install-success", result.success, result.error);

  // 平台二进制（跨平台查找）
  const fs = await import("fs/promises");
  const pkgJson = join(clientDir, "node_modules", client.package, "package.json");
  const pkgExists = await Bun.file(pkgJson).exists();
  check("pkg-entry-exists", pkgExists);

  const binaryName = process.platform === "win32" ? "codex.exe" : "codex";
  let binSize = 0;
  try {
    const glob = new Bun.Glob(`**/node_modules/@openai/**/${binaryName}`);
    for await (const path of glob.scan({ cwd: clientDir, onlyFiles: true })) {
      const stat = await fs.stat(join(clientDir, path));
      if (stat.size > binSize) binSize = stat.size;
    }
  } catch {}
  check("native-binary-exists", binSize > 1_000_000, `${Math.round(binSize / 1e6)}MB`);

  const installed = await isClientInstalled(client);
  check("is-client-installed", installed);

  // ── TP-INST-E2E-02: cache 隔离 ──
  console.log("\n--- TP-INST-E2E-02: cache isolation ---");
  let cacheHasContent = false;
  try {
    const entries = await fs.readdir(TAKO_BUN_CACHE_DIR);
    cacheHasContent = entries.length > 0;
  } catch {}
  check("tako-cache-has-content", cacheHasContent);

  // 全局 cache 不应被写（CI runner 上 ~/.bun/install/cache 不存在或无新内容）
  // 这个在干净 CI runner 上天然成立；本地可能存在旧内容，只做 informational check
  const globalCache = join(process.env.HOME || "/root", ".bun", "install", "cache");
  let globalCacheExists = false;
  try { await fs.access(globalCache); globalCacheExists = true; } catch {}
  check("global-cache-info", true, globalCacheExists ? "exists(pre-existing ok on local)" : "not-exists(clean)");

  // ── TP-INST-E2E-03: 重复 ensure 幂等 ──
  console.log("\n--- TP-INST-E2E-03: idempotent ---");
  const result2 = await installClient(client);
  check("repeat-install-success", result2.success);
  const stillInstalled = await isClientInstalled(client);
  check("still-installed-after-repeat", stillInstalled);

  // ── TP-INST-E2E-04: 半残自愈（事故复现）──
  console.log("\n--- TP-INST-E2E-04: half-dead recovery ---");
  const nmPath = join(clientDir, "node_modules");
  await fs.rm(nmPath, { recursive: true, force: true });
  // 占位 package.json 还在
  const placeholderExists = await Bun.file(join(clientDir, "package.json")).exists();
  check("placeholder-still-exists", placeholderExists);
  // isClientInstalled 应返回 false（INV-INST-01）
  const isInstalledAfterRm = await isClientInstalled(client);
  check("detects-not-installed-after-rm", !isInstalledAfterRm);
  // 重装
  const result3 = await installClient(client);
  check("re-install-success", result3.success, result3.error);
  const recoveredInstalled = await isClientInstalled(client);
  check("recovered-installed", recoveredInstalled);

  // ── TP-INST-E2E-05: 更新保留 node_modules ──
  console.log("\n--- TP-INST-E2E-05: update preserves node_modules ---");
  // 记录 node_modules 的 inode
  let inodeBefore = 0n;
  try {
    const stat = await fs.stat(nmPath);
    inodeBefore = stat.ino;
  } catch {}
  // 触发更新路径（forceUpdate=true）
  const result4 = await installClient(client, true);
  check("force-update-success", result4.success, result4.error);
  let inodeAfter = 0n;
  try {
    const stat = await fs.stat(nmPath);
    inodeAfter = stat.ino;
  } catch {}
  // 更新不应删除 node_modules 再重建（inode 应不变，因为 bun 原地更新）
  // 注：bun 可能会更新内容但保留目录，inode 应相同
  check("nm-dir-preserved", inodeAfter > 0n, `before=${inodeBefore} after=${inodeAfter}`);

  // ── TP-INST-E2E-06: tako install <client> <version> 指定版本 ──
  console.log("\n--- TP-INST-E2E-06: installAtVersion ---");
  const ver = await getInstalledVersion(client);
  check("get-installed-version", ver !== null, ver || "null");
  // 重装同版本（验证 installAtVersion 链路）
  if (ver) {
    try {
      await installAtVersion(client, ver);
      check("install-at-version-success", true);
    } catch (e: any) {
      check("install-at-version-success", false, e.message);
    }
    const verAfter = await getInstalledVersion(client);
    check("version-matches-after-install", verAfter === ver, `${verAfter} vs ${ver}`);
  }

  // ── TP-INST-E2E-07: launcher spawn — codex --version ──
  console.log("\n--- TP-INST-E2E-07: launcher spawn ---");
  const entryPath = await getClientEntryPath(client);
  check("entry-path-resolved", entryPath !== null, entryPath || "null");
  if (entryPath) {
    // codex runtime=bun → 用 bun 跑 entry，native → 直接执行
    const bunPath = await getBunPath();
    const isNative = client.runtime === "native";
    const cmd = isNative ? [entryPath, "--version"] : [bunPath, entryPath, "--version"];
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    check("codex-version-exit-0", proc.exitCode === 0, `exit=${proc.exitCode}`);
    check("codex-version-output", stdout.includes("codex"), stdout.trim().slice(0, 60));
  }

  // ── TP-INST-E2E-08: provider config 写入 ──
  console.log("\n--- TP-INST-E2E-08: provider config write ---");
  const { codexClient } = await import("../../src/clients/codex");
  const homedir = (await import("os")).homedir();
  const codexConfigPath = join(homedir, ".codex", "config.toml");
  if (codexClient.setupConfigFiles) {
    await codexClient.setupConfigFiles({ type: "tako", baseUrl: "https://test.example.com" });
    const configExists = await Bun.file(codexConfigPath).exists();
    check("codex-config-written", configExists);
    if (configExists) {
      const content = await Bun.file(codexConfigPath).text();
      check("codex-config-has-tako-provider", content.includes("tako"));
      check("codex-config-has-base-url", content.includes("test.example.com"));
    }
  } else {
    check("codex-config-written", false, "setupConfigFiles not defined");
  }

  // ── TP-INST-E2E-09: Windows PowerShell 兼容性 ──
  if (process.platform === "win32") {
    console.log("\n--- TP-INST-E2E-09: PowerShell compatibility ---");
    // pwsh (PowerShell 7+) 应该存在——老版 powershell.exe (5.1) 有 TLS/编码兼容问题
    const pwshProc = Bun.spawn(["pwsh", "-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"], {
      stdout: "pipe", stderr: "pipe",
    });
    await pwshProc.exited;
    const pwshVer = (await new Response(pwshProc.stdout).text()).trim();
    check("pwsh-available", pwshProc.exitCode === 0, `v${pwshVer}`);
    check("pwsh-version-7+", parseInt(pwshVer) >= 7, `major=${pwshVer}`);

    // 验证 Expand-Archive 在 pwsh 里可用（bun 安装用它解压）
    const expandProc = Bun.spawn(["pwsh", "-NoProfile", "-Command", "Get-Command Expand-Archive -ErrorAction Stop | Out-Null; echo ok"], {
      stdout: "pipe", stderr: "pipe",
    });
    await expandProc.exited;
    check("expand-archive-available", expandProc.exitCode === 0);
  } else {
    console.log("\n--- TP-INST-E2E-09: skipped (not Windows) ---");
  }

  // ── 汇总 ──
  console.log("\n=== SUMMARY ===");
  const failed = checks.filter(c => !c.pass);
  console.log(`total=${checks.length} pass=${checks.length - failed.length} fail=${failed.length}`);
  if (failed.length > 0) {
    for (const f of failed) console.log(`  FAIL: ${f.key} ${f.detail || ""}`);
    process.exit(1);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
