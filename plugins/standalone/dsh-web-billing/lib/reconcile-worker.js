/**
 * reconcile 专用 worker：在独立线程里解压 + 扫描会话日志，主线程只收记录数组。
 * 根治大文件（20-60MiB zstd → 数百 MB 文本）在主线程解压/解析/GC 造成的瞬卡。
 * 协议：主线程 postMessage({file, sessionId, seq}) → worker postMessage({ok, seq, headers, skipped, events, records})。
 */
import { parentPort } from "node:worker_threads";
import { readFileSync } from "node:fs";
import z from "node:zlib";
import { promisify } from "node:util";

const zstdDecompressAsync = promisify(z.zstdDecompress);
const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const yieldNow = () => new Promise((resolve) => setImmediate(resolve));
const YIELD_EVERY_LINES = 20000;

/** 异步解压（帧级让出：worker 线程内也不整块长占）。 */
async function decompressAsync(buf) {
  if (buf.length < 4 || buf[0] !== 0x28 || buf[1] !== 0xb5 || buf[2] !== 0x2f || buf[3] !== 0xfd) return buf;
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
      } catch { /* torn */ }
    }
    if (k % 32 === 31) await yieldNow();
  }
  return Buffer.concat(parts);
}

parentPort.on("message", async (msg) => {
  try {
    const { file, sessionId, seq } = msg;
    const buf = readFileSync(file);
    const text = (await decompressAsync(buf)).toString("utf8");
    const lines = text.split("\n");
    let lastHeader = null;
    let headers = 0;
    let skipped = 0;
    let events = 0;
    const records = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line) {
        // 预筛：绝大多数行（chunk/tool/meta）不含目标类型，不进 JSON.parse。
        if (line.includes('"type":"assistant/message"') || line.includes('"type":"request/header"')) {
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
                records.push({
                  sessionId, messageId: String(data.message?.id ?? `seq-${ev.seq}`), seq: ev.seq, time: ev.time, provider, model, usage
                });
                events++;
              }
            }
          }
        }
      }
      if (i % YIELD_EVERY_LINES === YIELD_EVERY_LINES - 1) await yieldNow();
    }
    parentPort.postMessage({ ok: true, seq, headers, skipped, events, records });
  } catch (error) {
    parentPort.postMessage({ ok: false, seq: msg.seq, error: error instanceof Error ? error.message : String(error) });
  }
});
