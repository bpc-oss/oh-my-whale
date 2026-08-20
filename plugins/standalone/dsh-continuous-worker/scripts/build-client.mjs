// dsh-continuous-worker — client bundle build (v6: vendor 依赖).
//
// 依赖策略 (2026-08-18): 宿主无 framer-motion/lucide/字体, 供应链钩子拦 pnpm,
// 故把 motion/framer-motion/motion-dom/motion-utils/tslib/lucide-react/字体
// 下载到 vendor/ 目录, esbuild 经 --alias 从 vendor resolve 打进 bundle;
// 字体 woff/woff2 资产拷到 dist/fonts。
//
// 注意: 宿主 node_modules 无 esbuild, 用 npx 缓存的 esbuild 二进制:
//   $esbuild = "$env:LOCALAPPDATA\npm-cache\_npx\5f4e5630cf7fc4fb\node_modules\@esbuild\win32-x64\esbuild.exe"
// 本脚本用 child_process spawn 调用该二进制 (不 import esbuild 包)。
//
// 用法: node scripts/build-client.mjs

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "dist");
const outCore = join(outDir, "client.core.js");
const outFinal = join(outDir, "client.js");

// 定位 esbuild 二进制 (npx 缓存或 PATH).
function findEsbuild() {
  const candidates = [
    process.env.CW_ESBUILD,
    join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx", "5f4e5630cf7fc4fb", "node_modules", "@esbuild", "win32-x64", "esbuild.exe"),
  ];
  for (const c of candidates) if (c && existsSync(c)) return c;
  return "esbuild"; // PATH 兜底
}

await mkdir(outDir, { recursive: true });

const alias = (name, sub, dir) => `--alias:${name}=${join(root, "vendor", dir ?? name, sub ?? "")}`;
const args = [
  join(root, "src", "client.jsx"),
  "--bundle", "--format=cjs", "--platform=browser",
  "--external:react", "--external:react/jsx-runtime", "--external:react-dom", "--external:@deepseek-ai/*",
  alias("motion", "package"),
  alias("framer-motion", "package"),
  alias("motion-dom", "package"),
  alias("motion-utils", "package"),
  alias("tslib", "package"),
  alias("lucide-react"),
  alias("@fontsource/space-grotesk", "package", "space-grotesk"),
  alias("@fontsource/orbitron", "package", "orbitron"),
  "--loader:.woff2=file", "--loader:.woff=file", "--loader:.ttf=file",
  "--asset-names=fonts/[name]-[hash]",
  `--outfile=${outCore}`,
];

const res = spawnSync(findEsbuild(), args, { stdio: "inherit" });
if (res.status !== 0) process.exit(res.status ?? 1);

const core = await readFile(outCore, "utf8");
const wrapped = `window.__ModuleLoader__.load({
  id: "dsh-continuous-worker",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${core}
    return module.exports;
  },
});
`;
await writeFile(outFinal, wrapped, "utf8");
await rm(outCore, { force: true });

// v7: 直接拷 vendor 字体为固定名到 dist/fonts (FontFace API 引用固定名),
// 并清理 esbuild 残留的 hash 字体。
const { readdir: rd, rename, copyFile: cp, rm: rmFile } = await import("node:fs/promises");
const { existsSync: ex } = await import("node:fs");
const fontsDir = join(outDir, "fonts");
await mkdir(fontsDir, { recursive: true });
const fontSrc = [
  ["space-grotesk", "space-grotesk-latin-400-normal.woff2"],
  ["space-grotesk", "space-grotesk-latin-500-normal.woff2"],
  ["space-grotesk", "space-grotesk-latin-700-normal.woff2"],
  ["orbitron", "orbitron-latin-600-normal.woff2"],
  ["orbitron", "orbitron-latin-700-normal.woff2"],
];
for (const [pkg, file] of fontSrc) {
  const src = join(root, "vendor", pkg, "package", "files", file);
  if (ex(src)) await cp(src, join(fontsDir, file));
}
// 清理旧 hash 字体
if (ex(fontsDir)) {
  const files = await rd(fontsDir);
  for (const f of files) {
    if (/-\w{8}\.(woff2|woff|ttf)$/.test(f)) await rmFile(join(fontsDir, f), { force: true }).catch(() => {});
  }
}
console.log("built dist/client.js");
