/**
 * 账本对账（reconcile）：从 DSH 会话源（session.jsonl.zstd，私有多帧 zstd）重建账本。
 *
 * 背景：v2.3.x 的 reprice 用「sessions.messages(500/会话) ∪ recent(20000)」重建聚合，
 * 被 maxMessagesPerSession / maxRecent 裁剪的早期消息在重建时永久消失（不可恢复）。
 * 会话源（DSH 持久化层）保留每个 assistant/message 的完整 usage 与 provider/model，
 * 因此可以把「源事件」重放进 BillingLedger 的全新实例，再整体替换现网账本状态——
 * 这是账单的真实数据，不受任何裁剪影响。
 *
 * 本模块被 host（apply 启动/HTTP 端点）与 scripts/reconcile-ledger.mjs 复用。
 */
import fs from "node:fs";
import path from "node:path";
import z from "node:zlib";
import { Worker } from "node:worker_threads";
import { promisify } from "node:util";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";

const zstdDecompressAsync = promisify(z.zstdDecompress);
/** 让出事件循环（setImmediate）：全量重放绝不整段阻塞主线程（P1：reconcile 同步阻塞 21 分钟卡死）。 */
const yieldNow = () => new Promise((resolve) => setImmediate(resolve));
/** 分片节流基准：约 80-100ms 让出一次。 */
const YIELD_EVERY_LINES = 20000;

// ---------- worker_threads 解压/扫描（大文件 20-60MiB 不占主线程） ----------
let workerRef = null;
let workerDisabled = false; // 一次挂起/失败即禁用（本次进程内直接走主线程异步扫描，保证对账必然推进）
let seqCounter = 0;
const pendingBySeq = /* @__PURE__ */ new Map();
function ensureWorker() {
  if (workerDisabled) return null;
  if (workerRef !== null) return workerRef;
  const w = new Worker(new URL("./reconcile-worker.js", import.meta.url));
  if (typeof w.unref === "function") w.unref();
  const failAll = (err) => {
    for (const r of pendingBySeq.values()) r.reject(err);
    pendingBySeq.clear();
    workerRef = null;
  };
  w.on("message", (m) => {
    const r = pendingBySeq.get(m.seq);
    if (r === void 0) return;
    pendingBySeq.delete(m.seq);
    if (m.ok === true) r.resolve(m); else r.reject(new Error(m.error ?? "worker failed"));
  });
  w.on("messageerror", () => failAll(new Error("worker messageerror (structured clone failed)")));
  w.on("error", failAll);
  w.on("exit", (code) => {
    if (code !== 0) failAll(new Error("reconcile worker exited: " + code));
    workerRef = null;
  });
  workerRef = w;
  return w;
}
/** 在 worker 线程里解压+扫描一个会话文件；只读文件，返回 {headers, skipped, events, records}。 */
export function scanSessionFileWorker(file, sessionId, timeoutMs = 60000) {
  const w = ensureWorker();
  if (w === null) return Promise.reject(new Error("worker disabled"));
  const seq = ++seqCounter;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingBySeq.has(seq)) {
        pendingBySeq.delete(seq);
        workerDisabled = true; // 挂起即永久禁用（本次进程内），后续文件直接走主线程异步扫描
        try { w.terminate(); } catch { /* 已退出 */ }
        workerRef = null;
        reject(new Error("reconcile worker timeout (" + timeoutMs + "ms) per file — disabled for this run"));
      }
    }, timeoutMs);
    pendingBySeq.set(seq, {
      resolve: (m) => { clearTimeout(timer); resolve(m); },
      reject: (e) => { clearTimeout(timer); workerDisabled = true; reject(e); }
    });
    try {
      w.postMessage({ file, sessionId, seq });
    } catch (e) {
      clearTimeout(timer);
      pendingBySeq.delete(seq);
      workerDisabled = true;
      reject(e);
    }
  });
}
/** 结束整个 worker（对账之后释放：reconcile 是批量任务，无须常驻）。 */
export async function terminateScanWorker() {
  const w = workerRef;
  workerRef = null;
  if (w === null) return;
  try { await w.terminate(); } catch { /* 已退出 */ }
}

/** node:zlib 帧魔数。 */
const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** 私有多帧 zstd：逐帧独立解压（帧间不以字典链接，标准解码器整块只解首帧）。 */
export function decompressSessionLog(buf) {
  if (buf.length < 4 || buf[0] !== 0x28 || buf[1] !== 0xb5 || buf[2] !== 0x2f || buf[3] !== 0xfd) {
    return buf; // 纯文本（.jsonl 未压缩）
  }
  const starts = [];
  let from = 0;
  for (;;) {
    const i = buf.indexOf(FRAME_MAGIC, from);
    if (i === -1) break;
    starts.push(i);
    from = i + 4;
  }
  const parts = [];
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k];
    const e = k + 1 < starts.length ? starts[k + 1] : buf.length;
    try {
      parts.push(z.zstdDecompressSync(buf.subarray(s, e)));
    } catch {
      try {
        // 尾部撕裂帧（写入中断）：flush 掉已完整的内容。
        parts.push(z.zstdDecompressSync(buf.subarray(s, e), { finishFlush: z.constants.ZSTD_e_flush }));
      } catch {
        // 无法解码的帧跳过（账单少记，不阻断整场对账）。
      }
    }
  }
  return Buffer.concat(parts);
}

/** 异步版解压：逐帧 await + 周期让出（大文件 63MB→177MB 不阻塞主线程）。 */
export async function decompressSessionLogAsync(buf) {
  if (buf.length < 4 || buf[0] !== 0x28 || buf[1] !== 0xb5 || buf[2] !== 0x2f || buf[3] !== 0xfd) {
    return buf;
  }
  const starts = [];
  let from = 0;
  for (;;) {
    const i = buf.indexOf(FRAME_MAGIC, from);
    if (i === -1) break;
    starts.push(i);
    from = i + 4;
  }
  const parts = [];
  for (let k = 0; k < starts.length; k++) {
    const s = starts[k];
    const e = k + 1 < starts.length ? starts[k + 1] : buf.length;
    try {
      parts.push(await zstdDecompressAsync(buf.subarray(s, e)));
    } catch {
      try {
        parts.push(await zstdDecompressAsync(buf.subarray(s, e), z.constants.ZSTD_e_flush));
      } catch {
        // 无法解码的帧跳过（账单少记，不阻断整场对账）。
      }
    }
    if (k % 32 === 31) await yieldNow();
  }
  return Buffer.concat(parts);
}

/**
 * 枚举会话存储下的全部 session 日志文件。
 * @param {string} root - sessions 或 sessions-archive 根目录。
 * @returns {{sessionId:string, file:string}[]}
 */
export function collectSessionFiles(root) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  for (const rootName of fs.readdirSync(root)) {
    const rootDir = path.join(root, rootName);
    let st;
    try { st = fs.statSync(rootDir); } catch { continue; }
    if (!st.isDirectory()) continue;
    for (const entry of fs.readdirSync(rootDir)) {
      const d = path.join(rootDir, entry);
      try { if (!fs.statSync(d).isDirectory()) continue; } catch { continue; }
      for (const name of ["session.jsonl.zstd", "session.jsonl"]) {
        const file = path.join(d, name);
        if (fs.existsSync(file)) out.push({ sessionId: entry, file });
      }
    }
  }
  return out;
}

/** 会话集共识文件：本宿主记录过的会话 id 持久化（重启后自动对账的 ids 底座）。 */
export function sessionSetPath(persistPath) {
  return `${persistPath.slice(0, persistPath.lastIndexOf("."))}-session-set.json`;
}

/** 默认会话源根：$DSH_HOME/sessions 与 $DSH_HOME/sessions-archive。 */
export function defaultSessionRoots() {
  const home = dshHomePath();
  return [path.join(home, "sessions"), path.join(home, "sessions-archive")];
}

/**
 * 异步扫描一个会话日志（行批让出，大文件不阻塞）：逐条 emit 给 sink。
 * 与同步版同规则：usage 携带 inputTokens/outputTokens 之一；provider/model 取
 * message.source，缺失回退 request/header 的最近一次配置。
 * @returns {{headers:number, skipped:number, events:number}}
 */
export async function scanSessionUsageRecordsAsync({ file, sessionId, emit }) {
  const buf = fs.readFileSync(file);
  const text = (await decompressSessionLogAsync(buf)).toString("utf8");
  const lines = text.split("\n");
  let lastHeader = null;
  let headers = 0;
  let skipped = 0;
  let events = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line) {
      // 预筛：绝大多数行是 chunk/tool-call/meta，不含目标类型 → 跳过 JSON.parse（大文件省 90%+ 解析成本）。
      if (!line.includes("\"type\":\"assistant/message\"") && !line.includes("\"type\":\"request/header\"")) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { skipped++; }
      if (ev && typeof ev === "object") {
        if (ev.type === "request/header" && ev.data?.header?.config) {
          const h = ev.data.header.config;
          if (typeof h.provider === "string" && typeof h.model === "string") {
            lastHeader = { provider: h.provider, model: h.model };
            headers++;
          }
        } else if (ev.type === "assistant/message") {
          const data = ev.data;
          const usage = data?.usage;
          if (usage == null) { skipped++; }
          else if (typeof usage.outputTokens !== "number" && typeof usage.inputTokens !== "number") { skipped++; }
          else {
            const source = data.message?.source;
            const provider = typeof source?.provider === "string" ? source.provider : (lastHeader?.provider ?? "");
            const model = typeof source?.model === "string" ? source.model : (lastHeader?.model ?? "unknown");
            emit({ sessionId, messageId: String(data.message?.id ?? `seq-${ev.seq}`), seq: ev.seq, time: ev.time, provider, model, usage });
            events++;
          }
        }
      }
    }
    if (i % YIELD_EVERY_LINES === YIELD_EVERY_LINES - 1) await yieldNow();
  }
  return { headers, skipped, events };
}

/**
 * 扫描一个会话日志，重放出可入账的 assistant/message 事件（与 host 实时钩子同规则：
 * usage 携带 inputTokens/outputTokens 之一；provider/model 取 message.source，缺失回退
 * request/header 的最近一次配置）。
 * @returns {{records:Array<{sessionId,messageId,seq,time,provider,model,usage}>, headers:number, skipped:number}}
 */
export function scanSessionUsageRecords({ file, sessionId }) {
  const text = decompressSessionLog(fs.readFileSync(file)).toString("utf8");
  let lastHeader = null;
  const records = [];
  let headers = 0;
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (!line) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { skipped++; continue; }
    if (!ev || typeof ev !== "object") continue;
    if (ev.type === "request/header" && ev.data?.header?.config) {
      const h = ev.data.header.config;
      if (typeof h.provider === "string" && typeof h.model === "string") {
        lastHeader = { provider: h.provider, model: h.model };
        headers++;
      }
      continue;
    }
    if (ev.type !== "assistant/message") continue;
    const data = ev.data;
    const usage = data?.usage;
    if (usage == null) { skipped++; continue; }
    if (typeof usage.outputTokens !== "number" && typeof usage.inputTokens !== "number") { skipped++; continue; }
    const source = data.message?.source;
    const provider = typeof source?.provider === "string" ? source.provider : (lastHeader?.provider ?? "");
    const model = typeof source?.model === "string" ? source.model : (lastHeader?.model ?? "unknown");
    records.push({
      sessionId,
      messageId: String(data.message?.id ?? `seq-${ev.seq}`),
      seq: ev.seq,
      time: ev.time,
      provider,
      model,
      usage
    });
  }
  return { records, headers, skipped };
}

/**
 * 用源事件重建一个全新账本（与 live 相同的 record/price/frozen 语义）。
 * 时序按 (time, seq) 升序重放，使冻结/截止语义与实时记录一致。
 * @param {object} opts
 * @param {Set<string>|Iterable<string>} [opts.ids] - 只重建这些会话（默认取 liveLedger.bySession 键）。
 * @param {object} opts.liveLedger - 现网账本（提供会话集与 price 语义所需字段）。
 * @param {object} opts.config - 插件配置（maxRecent/maxMessagesPerSession/detailWriteIntervalMs/freezeWindowDays/persistPath）。
 * @param {object} opts.pricing - 现网计价对象（与 liveLedger.price 共用）。
 * @param {string[]} [opts.roots] - 会话源根目录。
 * @param {string} [opts.rebuildPath] - 重建账本的临时写盘路径；默认 persistPath 旁
 *   `.rebuild-tmp`（重建期间 record 的防抖写只落临时文件，绝不污染现网账本）。
 * @returns {{ledger:object, stats:object}}
 */

/**
 * 解析重放会话集：显式 ids > 内存 bySession ∪ 磁盘 detail ∪ 会话集共识文件。
 * （空账本/首次迁移时磁盘 detail 与共识文件是唯一可靠底座——防止重启后空转。）
 */
export function resolveReconcileIds({ ids, liveLedger, config, fsMod = fs }) {
  const out = new Set(ids ?? []);
  if (out.size === 0) {
    for (const id of liveLedger?.bySession?.keys ? liveLedger.bySession.keys() : []) out.add(id);
    try {
      const dp = `${config.persistPath.slice(0, config.persistPath.lastIndexOf("."))}-detail.json`;
      const detail = JSON.parse(fsMod.readFileSync(dp, "utf8"));
      for (const id of Object.keys(detail.sessions ?? {})) out.add(id);
    } catch { /* 磁盘 detail 不可读 */ }
    try {
      const sp = sessionSetPath(config.persistPath);
      if (fsMod.existsSync(sp)) {
        const set = JSON.parse(fsMod.readFileSync(sp, "utf8"));
        for (const id of set.sessions ?? []) out.add(id);
      }
    } catch { /* 共识文件不可读 */ }
  }
  return out;
}

export async function buildReconciledLedger({ ids, liveLedger, config, pricing, roots, rebuildPath, onProgress }) {
  const { BillingLedger } = await import("./index.js"); // 延迟加载，避免模块初始化循环
  const idsSet = ids instanceof Set ? ids : new Set(ids ?? []);
  const files = [];
  for (const root of (roots ?? defaultSessionRoots())) files.push(...collectSessionFiles(root));
  const sel = files.filter((f) => idsSet.has(f.sessionId));

  let headers = 0;
  let usageEvents = 0;
  let skipped = 0;

  // 批量重放：feed 期间禁冻结，最后一次性冻结截止日前天（避免 freezeDay 在单条后触发
  // 导致「迟到记录」把 totals 重新加回去的漂移）。
  const rebuilt = new BillingLedger(
    rebuildPath ?? `${config.persistPath}.rebuild-tmp`,
    config.maxRecent,
    config.maxMessagesPerSession,
    config.detailWriteIntervalMs,
    0
  );
  // 流式重放 + 异步让出：逐文件 async 扫描（内部行批让出），文件间也让出——
  // 绝不同步占用主线程数分钟（P1：21 分钟阻塞卡死）。
  // feed 期间禁用冻结（rebuilt ctor freeze=0），时序不影响冻结结果（feed 后一次性冻结）。
  let deduped = 0;
  const seen = /* @__PURE__ */ new Set();
  let processedFiles = 0;
  let skippedBigFiles = 0;
  let skippedBigBytes = 0;
  const started = Date.now();
  // 大文件阈值：超限的会话源整体跳过（reconcile 是记账辅助来源，不影响主账本；
  // 63MB 压缩 → 177MB 文本的单文件同步解析可占 40s+ 且收益低）。0 = 不限制。
  const maxBytes = (config.reconcileMaxFileMB ?? 30) * 1024 * 1024;
  for (const f of sel) {
    if (maxBytes > 0) {
      let size = 0;
      try { size = fs.statSync(f.file).size; } catch { /* 文件消失：按 0 处理 */ }
      if (size > maxBytes) { skippedBigFiles++; skippedBigBytes += size; continue; }
    }
    const consumeOne = (rec) => {
      usageEvents++;
      const idKey = `${rec.sessionId}\n${rec.messageId}`;
      if (seen.has(idKey)) { deduped++; return; }
      seen.add(idKey);
      rebuilt.record({ ...rec, ...rebuilt.price(rec.model, rec.provider, rec.time, rec.usage, pricing) });
    };
    let r;
    try {
      // 主路径：worker 线程解压+解析（大文件 20-60MiB 不占主线程，无 GC 冲击）。
      const wr = await scanSessionFileWorker(f.file, f.sessionId);
      headers += wr.headers;
      skipped += wr.skipped;
      for (const rec of wr.records) consumeOne(rec);
    } catch {
      // 回退：主线程异步分片扫描（同样有预筛与行批让出，仅慢/略卡于大文件）。
      const awr = await scanSessionUsageRecordsAsync({ file: f.file, sessionId: f.sessionId, emit: consumeOne });
      headers += awr.headers;
      skipped += awr.skipped;
    }
    if (seen === null) continue;
    processedFiles++;
    await yieldNow();
    if (onProgress !== void 0 && (processedFiles % 10 === 0 || processedFiles === sel.length)) {
      onProgress({
        phase: "replay",
        filesDone: processedFiles,
        filesTotal: sel.length,
        skippedBigFiles,
        events: usageEvents,
        calls: rebuilt.totals.calls,
        elapsedMs: Date.now() - started
      });
      await yieldNow();
    }
  }
  if (config.freezeWindowDays > 0) {
    rebuilt.freezeWindowDays = config.freezeWindowDays;
    rebuilt.freezeOlderDays();
  }
  void terminateScanWorker(); // 批量任务结束即释放 worker（常驻会 idle 占用）
  return {
    ledger: rebuilt,
    stats: {
      filesScanned: files.length,
      sessionsScanned: sel.length,
      sessionsOnFile: files.length,
      usageEvents: usageEvents,
      deduped,
      headersSeen: headers,
      skippedEvents: skipped,
      skippedBigFiles,
      skippedBigBytes,
      calls: rebuilt.totals.calls,
      cost: rebuilt.totals.cost,
      savings: rebuilt.totals.savings
    }
  };
}

/**
 * 把重建账本状态整体换入现网账本实例（引用级复制：totals/各聚合/会话明细/recent/冻结区）。
 * 换入后由现网账本的写盘路径负责持久化（flush），之后实时记录继续累加。
 */
export function swapLedgerState(target, source) {
  target.totals = source.totals;
  target.byModel = source.byModel;
  target.byProvider = source.byProvider;
  target.byProviderModel = source.byProviderModel;
  target.byDay = source.byDay;
  target.byDayProvider = source.byDayProvider;
  target.bySessionModel = source.bySessionModel;
  target.bySession = source.bySession;
  target.recent = source.recent;
  target.frozenDays = source.frozenDays;
  target.pricingHash = source.pricingHash;
}

/**
 * 就地执行一次对账：重建 → 换入 → 落盘 → 记录结果（ledger.reconcileResult）。
 * @returns {Promise<object>} 对账结果（含前后 calls 对比与耗时）。
 */
export async function reconcileInPlace(liveLedger, config, pricing, { ids, roots } = {}, onProgress) {
  const startedAt = Date.now();
  const beforeCalls = liveLedger.totals?.calls ?? 0;
  const beforeCost = liveLedger.totals?.cost ?? 0;
  // ids：显式 ids > 内存 bySession ∪ 磁盘 detail ∪ 会话集共识文件（重启后自动对账的底座）。
  const resolvedIds = resolveReconcileIds({ ids, liveLedger, config });
  const rebuildPath = `${config.persistPath.slice(0, config.persistPath.lastIndexOf("."))}.rebuild-tmp.json`;
  const { ledger: rebuilt, stats } = await buildReconciledLedger({ ids: resolvedIds, liveLedger, config, pricing, roots, rebuildPath, onProgress });
  // 防呆：重建结果显著小于现网（会话集丢失/源损坏/裁剪）→ 拒绝换入，
  // 绝不允许空账本覆盖真账本（v2.4.0 起曾因空会话集把清空结果换入）。
  const rebuiltCalls = rebuilt.totals.calls ?? 0;
  if (beforeCalls > 10 && rebuiltCalls < beforeCalls * 0.5) {
    await rebuilt.dispose().catch(() => {});
    throw new Error(`reconcile aborted: rebuilt ${rebuiltCalls} calls while live has ${beforeCalls} (session set lost?) — no swap`);
  }
  swapLedgerState(liveLedger, rebuilt);
  await liveLedger.flush();
  // 清理重建实例：先 dispose（取消其防抖写定时器），再删除临时文件。
  // 重建期间 record 的防抖写只落在 rebuildPath，从不会污染现网账本。
  void (async () => {
    try { await rebuilt.dispose(); } catch { /* 临时实例写盘失败无碍 */ }
    try { await import("node:fs/promises").then((fsp) => Promise.all([
      fsp.rm(rebuildPath, { force: true }),
      fsp.rm(`${rebuildPath.slice(0, rebuildPath.lastIndexOf("."))}-detail.json`, { force: true })
    ])); } catch { /* 清理失败残留无害 */ }
  })();
  const result = {
    at: Date.now(),
    durationMs: Date.now() - startedAt,
    beforeCalls,
    beforeCost,
    afterCalls: liveLedger.totals.calls,
    afterCost: liveLedger.totals.cost,
    ...stats
  };
  liveLedger.reconcileResult = result;
  // 共识会话集落盘：重放成功且非空后才写；与既有共识取并集（空/萎缩结果绝不覆盖已有序集）。
  if ((liveLedger.totals.calls ?? 0) > 0) {
    try {
      const sp = sessionSetPath(config.persistPath);
      let prev = [];
      try { prev = JSON.parse(fs.readFileSync(sp, "utf8")).sessions ?? []; } catch { /* 无既有共识 */ }
      const union = [...new Set([...prev, ...liveLedger.bySession.keys()])];
      fs.writeFileSync(sp, JSON.stringify({ sessions: union }));
    } catch { /* 写失败仅影响下次自动对账的 ids 来源（仍有 detail 兜底） */ }
  }
  return result;
}
