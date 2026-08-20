// dsh-continuous-worker — employee agent runner (M2a: 员工运行载体).
//
// 方案 v5 (docs/worker-preset-design.md) 落地:
//   - 员工 = 类型 preset (agent.cordis.yml 插件组合) + 灵魂 (compilePrompt) + 记忆 (变量通道)
//   - agents.create 程序化不自动 mount preset → setup 显式 agentPresets.mount(agentCtx, id)
//   - meta.agentPreset = employee-<type> (官方字段, host agent/created 按此排除 WorkerRuntime)
//   - model 走 agentOptions; 灵魂走 section; 记忆走变量通道 (employee_memory, 免二次扫描)
//
// 本模块封装"员工 agent 创建/复用 + 派发任务"的纯逻辑 (sessionId 生命周期由调用方管理)。

/** 员工 preset id 前缀 (host agent/created 排除依据). */
export const EMPLOYEE_PRESET_PREFIX = "employee-";

/** 员工 sessionId 命名约定 (备选排除通道). */
export function employeeSessionId(workerId) {
  return `emp-${workerId}`;
}

/**
 * 构建员工 agent 的创建选项 (agents.create 参数).
 * @param {object} opts - { ctx, workerId, workerName, presetId, model, cwd, soulSystemPrompt, memoryBundleText, prompt, workerDir }
 *   prompt: 员工完整 prompt (含 limits, 用于 scoped pre-execute 守卫)
 *   workerDir: 员工目录 (workers/<id>, budget ledger 落点)
 * @returns create options 对象
 */
export function buildCreateOptions({ ctx, workerId, workerName, presetId, model, cwd, soulSystemPrompt, memoryBundleText, prompt = null, workerDir = null }) {
  const sessionId = employeeSessionId(workerId);
  const options = {
    sessionId,
    meta: {
      cwd, // 员工工作区
      agentPreset: presetId ?? `${EMPLOYEE_PRESET_PREFIX}ops`, // 官方字段; 默认 ops 类型
      origin: "subagent",
    },
    agentOptions: model ? { ...(model.provider ? { provider: model.provider } : {}), model: model.id ?? model } : undefined,
    setup(agentCtx) {
      // P0-1: 显式 mount 员工类型 preset (程序化 create 不自动 mount)
      // P0-C: mount 失败必须 throw (平台"拒绝即回滚创建"契约) — 外层 startEmployeeAgent 捕获为 nonFatal
      // 修复: setup 的 agentCtx 不继承 host inject — 用 host ctx 的 agentPresets 服务
      // (buildCreateOptions 收到 host ctx, 已 inject agentPresets), mount 第一参仍是 agentCtx.
      const presets = ctx?.agentPresets;
      if (typeof presets?.mount === "function") {
        const presetId2 = presetId ?? `${EMPLOYEE_PRESET_PREFIX}ops`;
        // await 由 agents.create 的 setup 契约承担 (setup 可为 async; 这里返回 promise 让其 await)
        return (async () => {
          await presets.mount(agentCtx, presetId2);
          // 灵魂 section (静态, 可追加 — 员工 preset 内无 complete:true)
          if (soulSystemPrompt && typeof agentCtx.systemPrompt?.section === "function") {
            agentCtx.systemPrompt.section({ name: "employee-soul", order: 10, text: soulSystemPrompt });
          }
          // 记忆变量通道 (变量值免二次扫描, 含 {{literal}} 不崩)
          if (memoryBundleText && typeof agentCtx.systemPrompt?.variable === "function") {
            agentCtx.systemPrompt.variable("employee_memory", () => memoryBundleText);
            agentCtx.systemPrompt.section({ name: "employee-memory-ref", order: 20, text: "\n\n## 记忆上下文\n{{employee_memory}}" });
          }
          // M2 P0-D: per-employee scoped pre-execute — 工具白名单/dangerTools ask/redLines + budget 记账
          if (prompt && workerDir && typeof agentCtx.on === "function") {
            const { employeeToolGuard, recordUsage, isOverBudget, readLedger } = await import("./budget.js");
            const { appendThinking, toolThinkingRecord } = await import("./thinking.js");
            agentCtx.on("tools/pre-execute", async (exec, next) => {
              // 员工自己的工具调用: 守卫
              const decision = employeeToolGuard(exec, prompt);
              if (decision.kind === "deny") {
                // M5: 拒绝也留痕 (可追溯)
                try { await appendThinking(workerDir, "session", { kind: "tool", content: `${exec?.name} (denied)`, meta: { name: exec?.name, denied: true, reason: decision.reason } }); } catch {}
                return { kind: "deny", reason: `cw employee: ${decision.reason}` };
              }
              if (decision.kind === "ask") {
                // 危险工具: 无审批 seam 则拒绝 (运行时强制不依赖文本) — M5 留痕
                try { await appendThinking(workerDir, "session", { kind: "tool", content: `${exec?.name} (ask-denied)`, meta: { name: exec?.name, denied: true, reason: decision.reason } }); } catch {}
                return { kind: "deny", reason: `cw employee: ${decision.reason} (approval seam unavailable)` };
              }
              let l;
              try {
                l = await readLedger(workerDir, prompt.limits);
                if (isOverBudget(l)) {
                  // M5: budget 拒绝留痕
                  try { await appendThinking(workerDir, "session", { kind: "tool", content: `${exec?.name} (budget-denied)`, meta: { name: exec?.name, denied: true, reason: "budget exhausted" } }); } catch {}
                  return { kind: "deny", reason: "cw employee: budget exhausted" };
                }
                await recordUsage(workerDir, { tokens: 0, run: true }, prompt.limits);
              } catch { /* ledger 读失败不杀死工具调用 (审计失败不阻塞执行) */ }
              // M5: 允许的工具调用自动留痕 (推理骨架; await 防 unhandled rejection, 失败不阻塞)
              try { await appendThinking(workerDir, "session", toolThinkingRecord(exec)); } catch {}
              return next();
            });
          }
          // M5: cw_think 工具 — 模型主动写 plan/decision/reflect (员工 agent 专属)
          // P0-1 fix: 平台 API 是 tools.register(defineTool({...}))，execute 而非 handler; 无 tool 单数服务
          if (workerDir && typeof agentCtx.tools?.register === "function") {
            const { appendThinking } = await import("./thinking.js");
            const { defineTool } = await import("@deepseek-ai/dsh-tools");
            agentCtx.tools.register(defineTool({
              name: "cw_think",
              description: "记录你的思维过程（规划/决策/反思），供雇主查看你'为什么这么做'。kind: plan|decision|reflect|step。",
              parameters: {
                kind: { type: "string", required: true, enum: ["plan", "decision", "reflect", "step"], description: "思维类型" },
                content: { type: "string", required: true, description: "思维内容" },
              },
              output: { schema: { type: "object", additionalProperties: true }, render: (v) => JSON.stringify(v) },
              async execute({ kind, content }) {
                try { await appendThinking(workerDir, "session", { kind, content }); } catch {}
                return { ok: true };
              },
            }));
          }
        })();
      }
      // 无 agentPresets 服务: 平台异常, 抛错让创建失败 (不静默)
      throw new Error("agentPresets service unavailable — cannot mount employee preset");
    },
  };
  return options;
}

/** 模型档位 → agentOptions 映射. */
export function resolveModelOptions(modelHint) {
  // meta.modelHint: "fast" | "strong" | "balanced" — 由调用方配置实际 provider/model
  return { modelHint };
}

export const internals = { buildCreateOptions, employeeSessionId, resolveModelOptions };
