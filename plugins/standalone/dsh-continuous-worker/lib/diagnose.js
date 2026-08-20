// dsh-continuous-worker — diagnose: quality-drift self-check (docs/02 §13.8).
//
// P0 (v0.5 设计项, coverage-audit P0): 自我诊断 —— "发现状态不对"。
//   检测项 (M-C 返修, 各带数据来源):
//     1. 输出质量漂移: 每轮质量签名 (长度/引用计数/结构标记) 滚动基线比较;
//     2. 重复失败率: 派发失败计数 + work_order 失败状态聚合;
//     3. 上下文健康: tokenMeter 可观测投影 (只读参考);
//     4. 成本异常: 插件自记账跨轮比较。
//   触发与执行主体 (M-B 返修): 宿主侧 watcher 定时触发 (runMaintenance),
//   不依赖 worker 自觉; 检出漂移由插件执行降级 (§9.4 Normal→Low);
//   cw_diagnose 模型面仅只读查询健康快照。

export const DIAGNOSE_STATE = Object.freeze({
  HEALTHY: "healthy",
  DRIFTED: "drifted",
  RECOVERING: "recovering",
});

/** One quality signature per assistant round (度量层, 与情景记忆语义层互补). */
export function buildQualitySignature({ length, evidenceRefs, structured }) {
  return Object.freeze({
    length: Number.isFinite(length) ? length : 0,
    evidenceRefs: Number.isFinite(evidenceRefs) ? evidenceRefs : 0,
    structured: structured === true,
    at: new Date().toISOString(),
  });
}

/**
 * Rolling-baseline drift detection over quality signatures.
 * Pure logic; the host feeds per-round signatures.
 * @param {Array} signatures - quality signatures (newest last).
 * @param {object} options - { window, driftThreshold }
 * @returns {{ drifted: boolean, detail: string, baseline: object|null }}
 */
export function detectDrift(signatures, options = {}) {
  const window = options.window ?? 20;
  const threshold = options.driftThreshold ?? 0.3;
  if (!Array.isArray(signatures) || signatures.length < 10) {
    return { drifted: false, detail: "insufficient samples", baseline: null };
  }
  const recent = signatures.slice(-window);
  const baselineSet = signatures.slice(0, Math.max(4, signatures.length - window));
  if (baselineSet.length === 0) return { drifted: false, detail: "no baseline", baseline: null };

  const avg = (arr, key) => arr.reduce((s, x) => s + (x[key] ?? 0), 0) / arr.length;
  const baseLen = avg(baselineSet, "length");
  const recentLen = avg(recent, "length");
  const baseRefs = avg(baselineSet, "evidenceRefs");
  const recentRefs = avg(recent, "evidenceRefs");
  const baseStruct = avg(baselineSet, "structured") || 0;
  const recentStruct = avg(recent, "structured") || 0;

  const lenRatio = baseLen > 0 ? Math.abs(recentLen - baseLen) / baseLen : 0;
  const refsDrop = baseRefs > 0 ? Math.max(0, baseRefs - recentRefs) / baseRefs : 0;
  const structDrop = Math.max(0, baseStruct - recentStruct);
  const drift = Math.max(lenRatio, refsDrop, structDrop);

  if (drift > threshold) {
    return {
      drifted: true,
      detail: `quality drift ${(drift * 100).toFixed(1)}% (len ${lenRatio.toFixed(2)}, refs ${refsDrop.toFixed(2)}, struct ${structDrop.toFixed(2)})`,
      baseline: { baseLen, baseRefs, baseStruct },
    };
  }
  return { drifted: false, detail: `within baseline (drift ${(drift * 100).toFixed(1)}%)`, baseline: { baseLen, baseRefs, baseStruct } };
}

/**
 * Compose one diagnose run: evaluate the four dimensions with host-provided
 * observations, produce a health snapshot + downgrade decision.
 * @param {object} input - { signatures, dispatchFailures, contextPressure, contextWindow, runTokenSpent, stepTokenBudget, options }
 * @returns {{ state, drifted: string[], detail: string, downgrade: boolean }}
 */
export function runDiagnose(input) {
  const drifted = [];
  const detail = [];
  const options = input.options ?? {};

  const q = detectDrift(input.signatures ?? [], options);
  if (q.drifted) { drifted.push("quality"); detail.push(q.detail); }

  // 2. repeated failure rate (派发失败, 质量视角).
  const failures = input.dispatchFailures ?? 0;
  if (failures >= (options.fatalAfterConsecutiveFailures ?? 5)) {
    drifted.push("failures");
    detail.push(`consecutive failures ${failures}`);
  }

  // 3. context health (tokenMeter 可观测投影, 只读参考).
  const pressure = input.contextPressure ?? 0;
  const windowSize = input.contextWindow ?? 0;
  if (windowSize > 0 && pressure / windowSize > 0.9) {
    drifted.push("context");
    detail.push(`context pressure ${Math.round((pressure / windowSize) * 100)}%`);
  }

  // 4. cost anomaly (插件自记账跨轮).
  const step = input.runTokenSpent ?? 0;
  const stepCap = input.stepTokenBudget ?? 50_000;
  if (step > stepCap) {
    drifted.push("cost");
    detail.push(`step cost ${step} > cap ${stepCap}`);
  }

  const state = drifted.length > 0 ? DIAGNOSE_STATE.DRIFTED : DIAGNOSE_STATE.HEALTHY;
  return Object.freeze({
    state,
    drifted,
    detail: detail.length > 0 ? detail.join("; ") : "all dimensions within baseline",
    downgrade: drifted.length > 0, // plugin executes downgrade (§9.4)
  });
}

export const internals = { DIAGNOSE_STATE, detectDrift };
