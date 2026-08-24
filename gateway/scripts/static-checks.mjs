// static-checks.mjs — gateway 静态检查（检查项 #1-#8）
// 权威项：#1 bundle 声明 / #2 入口完整性 / #4 无裸 Windows 路径
// 启发式：#3 配置超前 / #5 schema object 根 / #7 loader 内部访问 / #8 写放大
// 零依赖：仅 node 内置（fs/path/repl/url）
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const GATEWAY_ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";

// ---------- helpers ----------

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function walkFiles(dir, out = [], depth = 0) {
  if (depth > 8) return out;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const full = join(dir, e);
    try {
      const st = statSync(full);
      if (st.isDirectory()) walkFiles(full, out, depth + 1);
      // 只收可执行源码：跳过 .d.ts（纯类型声明，其 import 是 TS 类型引用，运行时不存在）
      else if (st.isFile() && /\.(js|mjs|cjs|ts)$/.test(e) && !e.endsWith(".d.ts")) out.push(full);
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** 从 js 源码中提取本地相对 import/require 目标（含裸副作用 import './x.js'） */
function extractLocalImports(src, filePath) {
  // 先剔除模板字符串与块注释，防止其中的 import './x' 文本被误判（终审发现）
  const stripped = src
    .replace(/`(?:\\.|[^`\\])*`/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    // line comments may carry import/require doc text; strip them too
    .replace(/"[^"\n]*"|'[^'\n]*'/g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  const out = [];
  // 覆盖四种形态：from './x' / 动态 import('./x') / require('./x') / 裸副作用 import './x'
  // 裸 import 前缀含 ^ 或换行/分号/右花括号（覆盖注释与 ASI 前导）
  const re = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|(?:^|[\n;}]\s*)import\s+)["'](\.[^"']+)["']/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    out.push({ spec: m[1], at: m.index });
  }
  return out;
}

/** 解析相对 spec → 磁盘路径（处理目录/index 语义、资源扩展与 query） */
function resolveLocalSpec(filePath, spec) {
  const base = dirname(filePath);
  // webpack/vite 资源 import 可能带 query/hash：./x.css?inline
  const clean = String(spec).split(/[?#]/)[0];
  let p = join(base, clean);
  const candidates = [];
  if (existsSync(p)) {
    const st = statSync(p);
    candidates.push(p);
    if (st.isDirectory()) {
      candidates.push(join(p, "index.js"), join(p, "index.mjs"), join(p, "index.cjs"));
    }
  } else {
    const hasExt = /\.[A-Za-z0-9]+$/.test(clean);
    if (hasExt) {
      // 非 JS/TS 资源（.css/.json/.svg/.module.css …）：文件存在即解析；
      // 若不存在则保持 missing（真实缺失仍应 FAIL）
      if (existsSync(p)) candidates.push(p);
    } else {
      // 无扩展名 → 试补可执行扩展
      for (const ext of [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"]) {
        if (existsSync(p + ext)) candidates.push(p + ext);
      }
    }
  }
  return candidates.filter((c) => existsSync(c));
}

/** 简易 YAML 结构检查：非空 + 至少含顶层 id/name/insert 之一 */
function weakYamlCheck(p) {
  let txt;
  try {
    txt = readFileSync(p, "utf8");
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (!txt.trim()) return { ok: false, reason: "empty" };
  if (/\b(id|name|insert|config)\s*:/.test(txt)) return { ok: true };
  return { ok: false, reason: "no recognizable YAML keys (id/name/insert/config)" };
}

// ---------- 检查项实现 ----------

/** #1 bundle 声明（权威） */
function checkBundleDeclaration(dir) {
  const pkg = readJson(join(dir, "package.json"));
  if (!pkg) return fail("package.json missing or invalid");
  const bundle = pkg.dsh?.bundle;
  if (!bundle) return fail("dsh.bundle missing");
  const patchPath = typeof bundle.patch === "string" ? bundle.patch : null;
  if (!patchPath) return fail("dsh.bundle.patch missing");
  const abs = join(dir, patchPath);
  if (!existsSync(abs)) return fail(`dsh.bundle.patch file not found: ${patchPath}`);
  const y = weakYamlCheck(abs);
  if (!y.ok) return fail(`dsh.bundle.patch not valid YAML: ${y.reason}`);
  return pass(`dsh.bundle.patch=${patchPath} exists, YAML keys ok`);
}

/** 完整文件遍历（含 .d.ts 与任意扩展名；排除 node_modules 与隐藏项）。
 * files 完整性检查需要全部文件（.d.ts 是发布产物的一部分），
 * 而 walkFiles 仅为 import 图检查收集可执行源码（跳过 .d.ts）。 */
function walkAllFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const full = join(dir, e);
    try {
      const st = statSync(full);
      if (st.isDirectory()) walkAllFiles(full, out);
      else if (st.isFile()) out.push(full);
    } catch {
      /* ignore */
    }
  }
  return out;
}

/**
 * 手写 glob 匹配（零依赖）用于 package.json files 声明：
 * - 双星（star-star）匹配零或多个目录段，例如 lib 下任意深度的 .js
 *   也匹配 lib/index.js（npm glob 语义）
 * - 单星（star）匹配单个段内的任意字符（不含 /）
 * 返回 true 当 relPath 匹配 pattern。
 */
function globMatch(pattern, relPath) {
  const p = pattern.replace(/\\/g, "/");
  const r = relPath.replace(/\\/g, "/");
  const parts = p.split("/");
  const segs = parts.map((seg, i) => {
    if (seg === "**") return "(?:[^/]+/)*";
    // escape literal parts first, then glob * -> [^/]*; the trailing / lives
    // INSIDE each non-last segment so ** (zero-or-more dirs) joins without an
    // extra separator that would force at least one directory level.
    const esc = (s) => s.replace(/\./g, "\\.");
    const body = seg.split("*").map(esc).join("[^/]*");
    return i < parts.length - 1 ? body + "/" : body;
  });
  const re = new RegExp("^" + segs.join("") + "$");
  return re.test(r);
}

/** #2 入口完整性（权威） */
function checkEntryCompleteness(dir) {
  const pkg = readJson(join(dir, "package.json"));
  if (!pkg) return fail("package.json missing");
  const files = Array.isArray(pkg.files) ? pkg.files : null;
  const declared = [];
  // 包内全部文件（相对路径），用于 glob 匹配
  const allFiles = walkAllFiles(dir);
  const allRel = allFiles.map((f) => relative(dir, f).replace(/\\/g, "/"));
  if (files) {
    for (const f of files) {
      const hasGlob = /[*?]/.test(f);
      if (!hasGlob) {
        const abs = join(dir, f);
        if (!existsSync(abs)) return fail(`files entry missing: ${f}`);
        const st = statSync(abs);
        if (st.isFile() && st.size === 0) return fail(`files entry empty: ${f}`);
        if (st.isFile()) declared.push(abs);
      } else {
        // glob 声明：匹配零个或多个文件；零匹配视为缺失（但容错：排除 node_modules/.git）
        const matched = allRel.filter((r) => globMatch(f, r) && !r.includes("node_modules") && !r.startsWith("."));
        if (matched.length === 0) return fail(`files entry glob matches nothing: ${f}`);
        for (const m of matched) declared.push(join(dir, m));
      }
    }
  }
  // import 图检查：扫所有 js/mjs/cjs/ts 源码
  const sources = walkFiles(join(dir, "lib")).concat(walkFiles(join(dir, "src"))).filter((s) => !s.includes(join("types", "")));
  if (sources.length === 0 && declared.length === 0) {
    return fail("no lib/ or src/ source files and no files[] declaration");
  }
  const missing = [];
  for (const src of sources) {
    let code;
    try {
      code = readFileSync(src, "utf8");
    } catch {
      continue;
    }
    for (const { spec } of extractLocalImports(code, src)) {
      const resolved = resolveLocalSpec(src, spec);
      if (resolved.length === 0) missing.push(`${relative(dir, src)} -> ${spec}`);
    }
  }
  if (missing.length > 0) {
    return fail(`unresolvable local imports (${missing.length}): ${missing.slice(0, 5).join("; ")}`);
  }
  return pass(`${sources.length} source files, imports resolvable`);
}

/** #3 配置不超前于实现（启发式）：patch config 值必须 ∈ 已实现的 z.enum 集合 */
function checkConfigNotAhead(dir) {
  const pkg = readJson(join(dir, "package.json"));
  if (!pkg) return fail("package.json missing");
  // 扫描 lib 里所有 z.enum([...])，合并为「已实现合法值」集合
  const sources = walkFiles(join(dir, "lib"));
  const implemented = new Set();
  for (const src of sources) {
    let code;
    try {
      code = readFileSync(src, "utf8");
    } catch {
      continue;
    }
    const re = /z\.enum\(\s*\[([^\]]*)\]\s*\)/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      for (const x of m[1].matchAll(/["']([^"']+)["']/g)) implemented.add(x[1]);
    }
  }
  // 找插件自带 cordis.patch.yml 的 config 段，提取其中的配置值（引号字符串 + YAML 裸值）
  const bundle = pkg.dsh?.bundle;
  const patchPath = typeof bundle?.patch === "string" ? join(dir, bundle.patch) : null;
  if (!patchPath || !existsSync(patchPath)) {
    return warn("no patch file to cross-check; enum extraction heuristic only");
  }
  // MINOR-C：插件源码无任何 z.enum 时无法做值级判定，直接返回通用启发式（避免全标噪声）
  if (implemented.size === 0) {
    return warn("no z.enum found in plugin source; value-level check skipped — heuristic only");
  }
  const patchText = readFileSync(patchPath, "utf8");
  // MINOR-B：config 块提取——只以顶层 - id / - insert / 文件尾终止（注释行不截断块）
  const configBlocks = [...patchText.matchAll(/config:\s*([\s\S]*?)(?=\n- (?:id|insert)|\n\s*$|$)/g)].map((m) => m[1]);
  const configVals = new Set();
  for (const block of configBlocks) {
    // 引号字符串字面量
    for (const x of block.matchAll(/["']([^"']{1,80})["']/g)) configVals.add(x[1]);
    // YAML 裸值（key: value 无引号形态，真实事故 mode: canary 即此形态）
    for (const line of block.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || t.startsWith("-")) continue;
      const kv = t.match(/^[A-Za-z_][\w-]*:\s*([^\s#][^#]*?)\s*$/);
      if (kv) {
        const v = kv[1].trim();
        // 跳过成对引号包裹的值（引号形态已由上方提取，避免 "observer" 重复标记）
        if (/^["'].*["']$/.test(v)) continue;
        if (v && v.length <= 80) configVals.add(v);
      }
    }
  }
  // 反向比对：patch 配置值若不在任何已实现枚举 → 疑似超前配置
  const suspicious = [];
  for (const v of configVals) {
    // 只对「短且像枚举值」的字符串做判定（跳过路径/URL/句子/数字）
    if (v.length > 32 || /[\\/:. ]/.test(v) || /^[\d.]+$/.test(v)) continue;
    if (!implemented.has(v)) suspicious.push(v);
  }
  if (suspicious.length > 0) {
    return warn(`patch config values not in any z.enum: ${suspicious.join(", ")} — possible ahead-of-implementation config; smoke 9a is authoritative`);
  }
  return warn("no suspicious config values vs z.enum; heuristic only");
}

/** #4 无裸 Windows 路径（权威） */
function checkNoBareWindowsPath(dir) {
  const pkg = readJson(join(dir, "package.json"));
  if (!pkg) return fail("package.json missing");
  const bundle = pkg.dsh?.bundle;
  const patchPath = typeof bundle?.patch === "string" ? join(dir, bundle.patch) : null;
  if (!patchPath || !existsSync(patchPath)) return pass("no patch file — nothing to scan");
  const txt = readFileSync(patchPath, "utf8");
  const hits = [];
  const re = /name:\s*["']?([A-Za-z]:[\\/][^"'\s]+|file:[^"'\s]+)/gi;
  let m;
  while ((m = re.exec(txt)) !== null) {
    const v = m[1];
    if (/^[A-Za-z]:[\\/]/i.test(v)) hits.push(v);
    else if (/^file:/i.test(v) && !/^file:\/\/\//i.test(v)) hits.push(v);
  }
  if (hits.length > 0) return fail(`bare Windows/non-file:// path in name: ${hits.join(", ")}`);
  return pass("no bare Windows paths in patch name fields");
}

/** #5 工具 schema object 根（启发式） */
function checkSchemaObjectRoot(dir) {
  const sources = walkFiles(join(dir, "lib"));
  if (sources.length === 0) return warn("no lib sources to scan");
  const risks = [];
  for (const src of sources) {
    let code;
    try {
      code = readFileSync(src, "utf8");
    } catch {
      continue;
    }
    // 裸 tools.register({...}) 且不含 defineTool 包装 → 风险
    if (/tools\.register\s*\(/.test(code) && !/defineTool\s*\(/.test(code)) {
      risks.push(relative(dir, src));
    }
  }
  if (risks.length > 0) {
    return warn(`raw tools.register without defineTool in: ${risks.join(", ")} — runtime schemas() check (9b) is authoritative`);
  }
  return pass("no raw tools.register without defineTool found");
}

/** #7 loader 内部访问（WARNING 纪律层） */
function checkLoaderInternalAccess(dir) {
  const rulesPath = join(GATEWAY_ROOT, "rules", "forbidden-patterns.txt");
  const rules = readFileSync(rulesPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [pat, desc] = l.split("|");
      return { re: new RegExp(pat), desc: (desc || "").trim() };
    });
  const sources = walkFiles(dir, [], 0).filter((p) => !p.includes(`${sep}node_modules${sep}`));
  const hits = [];
  for (const src of sources) {
    let code;
    try {
      code = readFileSync(src, "utf8");
    } catch {
      continue;
    }
    for (const { re, desc } of rules) {
      const m = re.exec(code);
      if (m) hits.push(`${relative(dir, src)}: ${desc} (${m[0].slice(0, 40)})`);
    }
  }
  if (hits.length > 0) {
    return warn(`loader-internal access patterns (${hits.length}): ${hits.slice(0, 5).join("; ")} — discipline layer, anti-cycle patch is the guard`);
  }
  return pass("no loader-internal access patterns");
}

/** #8 写放大上限（启发式 + 值级策略） */
function checkWriteAmplification(dir) {
  const pkg = readJson(join(dir, "package.json"));
  if (!pkg) return fail("package.json missing");
  const sources = walkFiles(join(dir, "lib"));
  const LIMITS = { maxRecent: 50000, maxMessagesPerSession: 2000 };
  const findings = [];
  for (const src of sources) {
    let code;
    try {
      code = readFileSync(src, "utf8");
    } catch {
      continue;
    }
    for (const [key, limit] of Object.entries(LIMITS)) {
      const re = new RegExp(`${key}\\s*:\\s*z\\.number\\(\\)\\.default\\((\\d+)\\)`);
      const m = re.exec(code);
      if (m) {
        const v = Number(m[1]);
        if (v > limit) findings.push(`${key}=${v} (default, limit ${limit}) in ${relative(dir, src)}`);
      }
    }
  }
  if (findings.length > 0) {
    return fail(`write-amplification defaults above limit: ${findings.join("; ")}`);
  }
  return warn("heuristic only — smoke must measure actual detail file size");
}

// ---------- runner ----------

function pass(evidence) {
  return { result: "PASS", evidence };
}
function fail(evidence) {
  return { result: "FAIL", evidence };
}
function warn(evidence) {
  return { result: "WARNING", evidence };
}

function checkNoSessionWrites(dir) {
  const hits = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const full = join(d, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!/\.(js|mjs|ts)$/.test(entry.name)) continue
      const text = readFileSync(full, 'utf8')
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i]
        if (/session\.append\(|Session\.append\(|session\.events\.(push|splice|unshift|write)\(/.test(line)) {
          hits.push(`${full}:${i + 1}: ${line.trim().slice(0, 120)}`)
        }
      }
    }
  }
  walk(dir)
  if (hits.length) return fail(hits.join(' | '))
  return pass('no session.append / session.events mutation patterns found')
}

export const CHECKS = [
  { id: 1, name: "bundle-declaration", run: checkBundleDeclaration, tier: "authoritative" },
  { id: 2, name: "entry-completeness", run: checkEntryCompleteness, tier: "authoritative" },
  { id: 3, name: "config-not-ahead", run: checkConfigNotAhead, tier: "heuristic" },
  { id: 4, name: "no-bare-windows-path", run: checkNoBareWindowsPath, tier: "authoritative" },
  { id: 5, name: "schema-object-root", run: checkSchemaObjectRoot, tier: "heuristic" },
  { id: 7, name: "loader-internal-access", run: checkLoaderInternalAccess, tier: "warning" },
  { id: 8, name: "write-amplification", run: checkWriteAmplification, tier: "heuristic" },
  { id: 9, name: "no-session-writes", run: checkNoSessionWrites, tier: "authoritative" },
];

export function runStaticChecks(dir) {
  const results = [];
  for (const c of CHECKS) {
    try {
      const r = c.run(dir);
      results.push({ id: c.id, name: c.name, tier: c.tier, ...r });
    } catch (e) {
      results.push({ id: c.id, name: c.name, tier: c.tier, result: "ERROR", evidence: String(e?.message || e) });
    }
  }
  return results;
}
