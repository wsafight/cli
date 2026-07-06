#!/usr/bin/env bun
/**
 * 构建脚本 - 打包为 JS bundle
 */
import { mkdirSync, writeFileSync } from "fs";

const pkg = await Bun.file("package.json").json();
const version = pkg.version;

console.log(`Building Tako CLI v${version}...`);

// Stub react-devtools-core（ink 的 optional devDependency，15MB，只在 dev 模式用）
// 创建空 stub 让 bundler resolve + inline，运行时 ink 的 try/catch 会静默跳过
const stubDir = "node_modules/react-devtools-core";
mkdirSync(stubDir, { recursive: true });
writeFileSync(`${stubDir}/index.js`, "export default {initialize(){},connectToDevTools(){}};");
writeFileSync(`${stubDir}/package.json`, '{"name":"react-devtools-core","version":"0.0.0","main":"index.js"}');

const commonBuildOptions = {
  outdir: "dist",
  minify: true,
  target: "bun" as const,
  define: {
    "process.env.VERSION": JSON.stringify(version),
  },
};

const builds = [
  {
    label: "Ink",
    entrypoints: ["src/index-ink.ts"],
    naming: "index-ink.js",
  },
  {
    label: "OpenTUI",
    entrypoints: ["src/index-opentui.ts"],
    naming: "index-opentui.js",
    external: ["@opentui/core"],
  },
];

mkdirSync("dist", { recursive: true });

for (const build of builds) {
  const result = await Bun.build({
    ...commonBuildOptions,
    ...build,
  });

  if (!result.success) {
    console.error(`${build.label} build failed:`);
    result.logs.forEach((log) => console.error(log));
    process.exit(1);
  }

  const file = result.outputs[0];
  const size = (file.size / 1024).toFixed(2);
  console.log(`  ✓ dist/${build.naming} (${size} KB)`);
}

await Bun.write(
  "dist/index.js",
  `#!/usr/bin/env bun
const isOpentuiMissing = (error) => {
  const code = error?.code;
  const message = error instanceof Error ? error.message : String(error);
  return code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND" || /@opentui\\/core/.test(message);
};
const inkUrl = new URL("./index-ink.js", import.meta.url).href;
// Windows: OpenTUI 后端存在问题，直接使用 Ink 渲染后端
if (process.platform === "win32") {
  await import(inkUrl);
} else {
  try {
    await import(new URL("./index-opentui.js", import.meta.url).href);
  } catch (error) {
    if (!isOpentuiMissing(error)) throw error;
    await import(inkUrl);
  }
}
`,
);
console.log("  ✓ dist/index.js (platform dispatcher)");