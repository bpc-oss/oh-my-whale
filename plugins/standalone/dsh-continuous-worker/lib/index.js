// dsh-continuous-worker — resident autonomous worker (host plugin).
//
// M1: host skeleton + unified pacemaker + durable registry + wake pipeline +
// three counters/FATAL + cw_status + credential policy.
// M2: management tools (cw_schedule_*/cw_heartbeat_*/cw_pause/cw_resume/
// cw_run_once/cw_stop) + checkpoint intent ledger + verify-before-retry +
// budget-downgrade linkage + supply-chain interception + supervision matrix.
//
// Composition model (mirrors dsh-schedule):
//   - listens for `agent/created`, installs a per-root-agent runtime;
//   - runtime = Watcher + Pacemaker + CheckpointStore + cw_* tools;
//   - all durable state lives in the session event log (registry.js fold)
//     plus the checkpoint intent store on the host filesystem.

import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { KNOWN_SESSION_EVENT_TYPES } from "@deepseek-ai/dsh-session";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { foldWorkerEvents } from "./registry.js";
import { Watcher } from "./watcher.js";
import { Pacemaker } from "./pacemaker.js";
import { CheckpointStore } from "./checkpoint.js";
import { SkillLibrary } from "./skill.js";

// 注册本插件写入的事件类型：宿主的 KNOWN_SESSION_EVENT_TYPES 不含
// 'continuous-worker/change'，不注册则任何含该事件的会话在加载时都会被
// assertEventsSupported 拒绝（SessionFormatUnsupportedError）。
// 注意：此处 import 可能解析到本插件的 node_modules 副本而非宿主持久化层实例，
// 因此宿主侧 dsh-session 的 KNOWN 集合也需同步加行（双保险）。
KNOWN_SESSION_EVENT_TYPES.add("continuous-worker/change");
import { MemoryStore } from "./memory.js";
import { ReportBudget } from "./report.js";
import { LoopStore } from "./loop.js";
import { ProbeStore } from "./probe.js";
import { PersonaStore } from "./persona.js";
import { WorkOrderStore } from "./workorder.js";
import { WorkerStore, createWorker } from "./workers.js";
import { registerTools } from "./tools.js";
import { classifySupplyCall } from "./guardrails.js";
import { deliver } from "./waker.js";
import { buildWorkOrder } from "./workorder.js";

/**
 * Agent OS MCP backend adapter (剩余项 3): wraps the platform's agentos-memory
 * tools (memory_recall / memory_retain / memory_forget) as the { recall,
 * retain, forget } seam MemoryStore consumes. The MCP connection stays host-
 * side; the worker only reaches it through cw_memory_* (无旁路声明).
 * @param {object} ctx - global context.
 * @returns {{ recall: Function, retain: Function, forget: Function }|null}
 */
function createAgentOsMemoryBackend(ctx) {
  const call = async (toolName, args) => {
    try {
      // Prefer a tool-execution seam if the platform exposes one; otherwise
      // return undefined so MemoryStore fails soft (local store remains).
      if (typeof ctx.tools?.call === "function") {
        return await ctx.tools.call(toolName, args);
      }
      return undefined;
    } catch {
      return undefined; // fail-soft: local store is authoritative fallback
    }
  };
  return {
    recall: (args) => call("memory_recall", args),
    retain: (args) => call("memory_retain", args),
    forget: (args) => call("memory_forget", args),
  };
}

/** Stable Cordis plugin name. */
export const name = "continuous-worker";

/** Services required before the plugin can register. */
// M1 H4 / M4 H2 fix: sessionPersistence is required for resume + flush.
// webServer 为可选服务 (headless profile 无 webServer) — 用 ctx.get 动态检测,
// 不硬注入 (否则 headless 等待 webServer 激活失败)。
// M2a fix: agentPresets 必需 (员工 agent setup 显式 mount 类型 preset) —
// 缺失则 agentCtx.agentPresets 不可用 → 员工 agent 无法启动 (拒绝即回滚创建).
export const inject = ["agents", "sessions", "tools", "systemPrompt", "credentials", "sessionPersistence", "agentPresets", "llm"];

/**
 * 发送 JSON 响应。dsh-web-billing 同款辅助。
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

/**
 * H3 返修 (v5 审查 CSRF): 镜像平台 "Cross-site write fence" (dsh-host-apiproxy
 * handler.js L202-211) — POST 必须 content-type: application/json (否则 415,
 * 强制浏览器走本机服务器不应答的 CORS 预检), 且 Origin/Host 必须来自 DSH UI
 * (localhost/127.0.0.1, 防恶意网页盲注驱动 worker)。
 * @returns {boolean} true = 通过; false = 已拒绝并写响应.
 */
function csrfFence(req, res) {
  const ct = String(req.headers["content-type"] ?? "").toLowerCase();
  if (!ct.startsWith("application/json")) {
    sendJson(res, 415, { ok: false, error: "content-type must be application/json" });
    return false;
  }
  const origin = String(req.headers.origin ?? "").toLowerCase();
  const host = String(req.headers.host ?? "").toLowerCase();
  const isLocalHost = (h) => h === "localhost" || h.startsWith("localhost:") || h === "127.0.0.1" || h.startsWith("127.0.0.1:") || h.startsWith("127.0.0.1.");
  if (origin.length > 0 && !isLocalHost(origin.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))) {
    sendJson(res, 403, { ok: false, error: "cross-origin write rejected" });
    return false;
  }
  if (host.length > 0 && !isLocalHost(host)) {
    sendJson(res, 403, { ok: false, error: "untrusted host rejected" });
    return false;
  }
  return true;
}

/**
 * 浏览器端面板经 HTTP 消费 worker 状态/控制。client 与 host 的 Cordis Context
 * 相互独立（client 的 ctx.get 看不到 host 的 ctx.provide），因此不能走服务注入，
 * 只能走 webServer 路由（dsh-web-billing 模式，见 docs/02 §13.13 L2 桥）。
 * 无 runtime 时返回 409 并带原因，面板显示 "no worker yet" 而非崩溃。
 */
function registerWorkerHttpRoutes(ctx, getRuntime, listWorkers) {
  // v8: webServer 可选 — headless 无 webServer 时跳过路由注册 (插件仍激活).
  const webServer = ctx.get?.("webServer");
  if (webServer === undefined || webServer === null) {
    return () => {};
  }
  return ctx.effect(() =>
    webServer.register({
      kind: "prefix",
      path: "/continuous-worker",
      handler: async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const pathname = url.pathname.replace(/\/+$/, "");
        const workerId = url.searchParams.get("worker");
        const runtime = getRuntime(workerId);
        try {
          // H3 返修: CSRF fence — POST 必须 application/json + 本机 Origin/Host.
          if (req.method === "POST" && !csrfFence(req, res)) return;
          if (req.method === "GET" && (pathname === "/continuous-worker" || pathname === "/continuous-worker/status")) {
            if (runtime === null) return sendJson(res, 200, { status: null });
            sendJson(res, 200, { status: await runtime.getStatus() });
            return;
          }
          if (req.method === "GET" && pathname === "/continuous-worker/workers") {
            // 多员工: 列出所有 worker 会话 (agent -> runtime 摘要)。
            if (typeof listWorkers !== "function") return sendJson(res, 200, { workers: [] });
            sendJson(res, 200, { workers: await listWorkers() });
            return;
          }
          if (req.method === "POST" && pathname === "/continuous-worker/control") {
            let body = "";
            for await (const chunk of req) body += chunk;
            const parsed = JSON.parse(body || "{}");
            const action = typeof parsed.action === "string" ? parsed.action : "";
            const id = typeof parsed.id === "string" ? parsed.id : "";
            const extra = parsed.extra ?? parsed; // 透传 prompt/intervalSeconds/project/task 等
            if (runtime === null) return sendJson(res, 409, { ok: false, reason: "no worker runtime (no root agent yet)" });
            const result = await runtime.control(action, id, extra);
            await runtime.flush(); // 持久化屏障 (审查 Medium: flush 此前从未被调用)
            sendJson(res, 200, result);
            return;
          }
          if (req.method === "POST" && pathname === "/continuous-worker/instruct") {
            // UI v4: 工作台指令 → 投递给 agent (用户↔AGI 交流)。
            let body = "";
            for await (const chunk of req) body += chunk;
            const parsed = JSON.parse(body || "{}");
            const text = typeof parsed.text === "string" ? parsed.text : "";
            if (runtime === null) return sendJson(res, 409, { ok: false, reason: "no worker runtime (no root agent yet)" });
            const result = await runtime.instruct(text);
            await runtime.flush(); // 持久化屏障
            sendJson(res, 200, result);
            return;
          }
          if (req.method === "GET" && pathname === "/continuous-worker/models") {
            // UI v5: 模型选择器数据源 (可用列表 + 当前模型)。
            if (runtime === null) return sendJson(res, 200, { models: null });
            sendJson(res, 200, { models: await runtime.getModels() });
            return;
          }
          if (req.method === "POST" && pathname === "/continuous-worker/model") {
            // UI v5: 切换 worker 会话模型。
            let body = "";
            for await (const chunk of req) body += chunk;
            const parsed = JSON.parse(body || "{}");
            const provider = typeof parsed.provider === "string" ? parsed.provider : "";
            const model = typeof parsed.model === "string" ? parsed.model : "";
            if (runtime === null) return sendJson(res, 409, { ok: false, reason: "no worker runtime (no root agent yet)" });
            sendJson(res, 200, await runtime.setModel(provider, model));
            return;
          }
          // ---- v8 多员工端点 ----
          if (req.method === "GET" && pathname === "/continuous-worker/employees") {
            if (runtime === null) return sendJson(res, 200, { employees: [] });
            sendJson(res, 200, { employees: await runtime.listEmployees() });
            return;
          }
          if (req.method === "POST" && pathname === "/continuous-worker/employees") {
            let body = "";
            for await (const chunk of req) body += chunk;
            const parsed = JSON.parse(body || "{}");
            if (runtime === null) return sendJson(res, 409, { ok: false, reason: "no worker runtime" });
            sendJson(res, 200, await runtime.createEmployee(parsed.name, parsed.cwd ?? null, parsed.prompt ?? null));
            return;
          }
          if (req.method === "POST" && pathname === "/continuous-worker/employees/instruct") {
            let body = "";
            for await (const chunk of req) body += chunk;
            const parsed = JSON.parse(body || "{}");
            if (runtime === null) return sendJson(res, 409, { ok: false, reason: "no worker runtime" });
            sendJson(res, 200, await runtime.instructEmployee(parsed.id, parsed.text));
            return;
          }
          if (req.method === "GET" && pathname.startsWith("/continuous-worker/employees/") && pathname.endsWith("/chat")) {
            const id = pathname.split("/").filter(Boolean)[2];
            if (runtime === null) return sendJson(res, 409, { ok: false, reason: "no worker runtime" });
            sendJson(res, 200, await runtime.employeeChat(id));
            return;
          }
          if (req.method === "POST" && pathname.startsWith("/continuous-worker/employees/") && pathname.endsWith("/workspace")) {
            const id = pathname.split("/").filter(Boolean)[2];
            let body = "";
            for await (const chunk of req) body += chunk;
            const parsed = JSON.parse(body || "{}");
            if (runtime === null) return sendJson(res, 409, { ok: false, reason: "no worker runtime" });
            sendJson(res, 200, await runtime.setEmployeeWorkspace(id, parsed.cwd));
            return;
          }
          // M4: 用户反馈 → 习惯记忆 (upsertHabit)
          if (req.method === "POST" && pathname.startsWith("/continuous-worker/employees/") && pathname.endsWith("/feedback")) {
            const id = pathname.split("/").filter(Boolean)[2];
            let body = "";
            for await (const chunk of req) body += chunk;
            const parsed = JSON.parse(body || "{}");
            if (runtime === null) return sendJson(res, 409, { ok: false, reason: "no worker runtime" });
            sendJson(res, 200, await runtime.employeeFeedback(id, parsed.name, parsed.value));
            return;
          }
          // M4: 成长轨迹 (供 UI 成长页)
          if (req.method === "GET" && pathname.startsWith("/continuous-worker/employees/") && pathname.endsWith("/growth")) {
            const id = pathname.split("/").filter(Boolean)[2];
            if (runtime === null) return sendJson(res, 409, { ok: false, reason: "no worker runtime" });
            sendJson(res, 200, await runtime.employeeGrowth(id));
            return;
          }
          // M5: 思维留痕 (供 UI 思维 tab)
          if (req.method === "GET" && pathname.startsWith("/continuous-worker/employees/") && pathname.endsWith("/thinking")) {
            const id = pathname.split("/").filter(Boolean)[2];
            const taskId = new URL(req.url, "http://localhost").searchParams.get("taskId") ?? null;
            if (runtime === null) return sendJson(res, 409, { ok: false, reason: "no worker runtime" });
            sendJson(res, 200, await runtime.employeeThinking(id, taskId));
            return;
          }
          // 员工自身状态 (隔离于 root: 实体+成长+思维+队列+ledger) — 员工仪表盘数据源
          if (req.method === "GET" && pathname.startsWith("/continuous-worker/employees/") && pathname.endsWith("/status")) {
            const id = pathname.split("/").filter(Boolean)[2];
            if (runtime === null) return sendJson(res, 409, { ok: false, reason: "no worker runtime" });
            sendJson(res, 200, await runtime.employeeStatus(id));
            return;
          }
          // skill/memory accept 通道 (人工批准, 治理死锁修复)
          if (req.method === "POST" && pathname === "/continuous-worker/review") {
            let body = "";
            for await (const chunk of req) body += chunk;
            const parsed = JSON.parse(body || "{}");
            if (runtime === null) return sendJson(res, 409, { ok: false, reason: "no worker runtime" });
            if (parsed.type === "skill") sendJson(res, 200, await runtime.reviewSkillAccept(parsed.name ?? parsed.id, "panel"));
            else if (parsed.type === "memory") sendJson(res, 200, await runtime.reviewMemoryAccept(parsed.id, "panel"));
            else sendJson(res, 400, { ok: false, reason: "type must be skill|memory" });
            return;
          }
          // DSH 已有工作区列表 (创建员工时下拉选择工作区)
          if (req.method === "GET" && pathname === "/continuous-worker/workspaces") {
            if (runtime === null) return sendJson(res, 200, { workspaces: [] });
            sendJson(res, 200, await runtime.listWorkspaces());
            return;
          }
          // 真 AI 生成员工灵魂 (任务 → LLM 产出完整灵魂)
          if (req.method === "POST" && pathname === "/continuous-worker/employees/generate-soul") {
            let body = "";
            for await (const chunk of req) body += chunk;
            const parsed = JSON.parse(body || "{}");
            if (runtime === null) return sendJson(res, 409, { ok: false, reason: "no worker runtime" });
            sendJson(res, 200, await runtime.generateSoul(parsed.task ?? ""));
            return;
          }
          if (req.method === "GET" && pathname === "/continuous-worker/pick-directory") {
            // v9: 工作区目录选择 — 弹系统目录框 (复用平台 directoryPicker).
            const dp = ctx.get?.("directoryPicker");
            if (dp === undefined) return sendJson(res, 409, { ok: false, reason: "directoryPicker unavailable in this profile" });
            try {
              const capability = dp.capability?.();
              if (!capability || capability.kind !== "native") {
                return sendJson(res, 409, { ok: false, reason: `directory picker capability: ${capability?.kind ?? "none"}` });
              }
              const path = await capability.pick(new AbortController().signal);
              sendJson(res, 200, { ok: true, path });
            } catch (error) {
              if (error?.name === "AbortError" || /abort|cancel/i.test(String(error?.message ?? error))) {
                sendJson(res, 200, { ok: false, cancelled: true });
              } else {
                sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
              }
            }
            return;
          }
          if (req.method === "GET" && pathname === "/continuous-worker/directory-picker-status") {
            // 探针: 返回 capability kind, 不弹框 (验证可用性不打扰用户).
            const dp = ctx.get?.("directoryPicker");
            sendJson(res, 200, { available: dp !== undefined, kind: dp?.capability?.()?.kind ?? null });
            return;
          }
          sendJson(res, 404, { ok: false, error: `unknown /continuous-worker route: ${req.method} ${pathname}` });
        } catch (error) {
          sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
        }
      },
    }), "dsh-continuous-worker: /continuous-worker routes");
}

/** Runtime configuration schema (docs/02 §8 + v0.6 安全三角). */
export const Config = z.object({
  baseIntervalMs: z.number().default(5000),
  fatalAfterConsecutiveFailures: z.number().default(5),
  idleRoundsBeforeSleep: z.number().default(3),
  loopRoundsBeforeCorrect: z.number().default(3),
  maxTokenPerRun: z.number().default(200_000),
  stepTokenBudget: z.number().default(50_000),
  dailyTokenBudget: z.number().default(2_000_000),
  checkpointRoot: z.string().default(""),
  workerSessionId: z.string().default(""), // resume 装配: 持久 worker 会话 id (可选)
  credentials: z
    .object({
      requireDeclaredRefs: z.boolean().default(true),
      denyDirectAccess: z.boolean().default(true),
    })
    .default(),
  supplyChain: z
    .object({
      verifyOnInstall: z.boolean().default(true),
      enforceOnShellTools: z.boolean().default(true),
    })
    .default(),
  supervision: z
    .object({
      forbidSelfDowngrade: z.boolean().default(true),
    })
    .default(),
  skill: z
    .object({
      requireSkillReview: z.boolean().default(true),
      requireSkillReviewConfirm: z.boolean().default(true),
      autoLearnBelowConfidence: z.number().default(0.7),
    })
    .default(),
  memory: z
    .object({
      requireRetainReview: z.boolean().default(true),
      useAgentOSMemory: z.boolean().default(false), // 补齐: 默认本地存储, true 时对接 Agent OS MCP
      mcpClient: z.string().default("dsh"),
      mcpProject: z.string().default(""),
    })
    .default(),
  report: z
    .object({
      maxReportsPerDay: z.number().default(10),
    })
    .default(),
  maxDiskBytes: z.number().default(500 * 1024 * 1024), // P2: 磁盘闸门 (500MB)
  heartbeat: z
    .object({
      maxConsecutiveWakes: z.number().default(3), // P2: 唤醒节流 (dsh-tool-jobs 先例)
      delivery: z.union([z.const("wakeup"), z.const("quiet")]).default("wakeup"),
    })
    .default(),
  probe: z
    .object({
      enabled: z.boolean().default(true),
      baseIntervalMs: z.number().default(3_600_000), // 小时级巡检节拍
      maxRunsPerDay: z.number().default(96),
      dailyBudgetTokens: z.number().default(50_000),
      anomalyCooldownMs: z.number().default(1_800_000),
      defaultDisposition: z.array(z.string()).default(["record", "escalate"]),
    })
    .default(),
  diagnose: z
    .object({
      enabled: z.boolean().default(true),
      everyRuns: z.number().default(50), // 每 N 轮
      driftThreshold: z.number().default(0.3),
      autoDowngrade: z.boolean().default(true),
    })
    .default(),
  persona: z
    .object({
      name: z.string().default(""),
      tone: z.string().default("professional"),
      outputFormat: z.string().default(""),
      constraints: z.array(z.string()).default([]),
    })
    .default(),
  guardrails: z
    .object({
      enforcePersona: z.boolean().default(false), // M5 双轨: 默认提示性自约束
      requirePersonaConfirm: z.boolean().default(true),
    })
    .default(),
  workorder: z
    .object({
      autoRecordTools: z.array(z.string()).default([]), // post-execute 白名单外部副作用工具
    })
    .default(),
});

/** One installed per-root-agent runtime. */
class WorkerRuntime {
  /**
   * @param {object} ctx - global context.
   * @param {object} agent - live root agent.
   * @param {object} config - validated plugin config.
   * @param {Map} [sharedEmployeeAgents] - apply 作用域共享的员工 agent map (dispose 时清理).
   */
  constructor(ctx, agent, config, sharedEmployeeAgents = null) {
    this.ctx = ctx;
    this.agent = agent;
    this.config = config;
    this.employeeAgents = sharedEmployeeAgents ?? new Map(); // M2a: workerId -> 员工 agent handle
    this.watcher = new Watcher({
      fatalAfterConsecutiveFailures: config.fatalAfterConsecutiveFailures,
      idleRoundsBeforeSleep: config.idleRoundsBeforeSleep,
      loopRoundsBeforeCorrect: config.loopRoundsBeforeCorrect,
      maxTokenPerRun: config.maxTokenPerRun,
      stepTokenBudget: config.stepTokenBudget,
      dailyTokenBudget: config.dailyTokenBudget,
    });
    // 日预算持久化 (重启不清零): state.json 存 root 下; start() 加载, 派发时落盘.
    this.stateFile = null;
    // Checkpoint store lives outside the model-visible workspace:
    //   default: <home>/.dsh/profiles/<profile>/continuous-worker/checkpoints
    const root =
      config.checkpointRoot && config.checkpointRoot.length > 0
        ? config.checkpointRoot
        : join(homedir(), ".dsh", "profiles", process.env.DSH_PROFILE ?? "default", "continuous-worker", "checkpoints");
    this.root = root; // checkpoint/workers 存储根 (M2 员工队列/ledger 用)
    this.checkpoint = new CheckpointStore(root);
    this.skills = new SkillLibrary(root, {
      requireSkillReview: config.skill.requireSkillReview,
      requireSkillReviewConfirm: config.skill.requireSkillReviewConfirm,
      autoLearnBelowConfidence: config.skill.autoLearnBelowConfidence,
    });
    this.memory = new MemoryStore(root, {
      requireRetainReview: config.memory.requireRetainReview,
      // Agent OS MCP 对接（剩余项 3）: useAgentOSMemory=true 时经宿主侧
      // mcpBackend 把已验证记忆同步到共享 Agent OS（MCP 连接仅宿主持有,
      // worker 只经 cw_memory_* 访问 —— 设计 §13.2 无旁路声明）。
      mcpBackend: config.memory.useAgentOSMemory ? createAgentOsMemoryBackend(ctx) : null,
      mcpClient: config.memory.mcpClient ?? "dsh",
      mcpProject: config.memory.mcpProject ?? this.agent.session.header.cwd,
    });
    this.loops = new LoopStore(root);
    this.reportBudget = new ReportBudget({ maxReportsPerDay: config.report.maxReportsPerDay });
    this.probes = new ProbeStore(root);
    this.persona = new PersonaStore(root);
    this.workOrders = new WorkOrderStore(root);
    this.workers = new WorkerStore(root); // v8: 员工实体 (独立于 DSH 会话)
    this.pacemaker = new Pacemaker(ctx, agent, this.watcher, { baseIntervalMs: config.baseIntervalMs, loops: this.loops });
    this.stopping = false;

    // 手动切换模型 (用户 v5 需求): 运行中改 selection.current 即切换 worker
    // 下一次请求使用的模型 (dsh-agent installModelSelection 机制)。安装放 start()。
    this.modelSelection = { current: undefined };
    this.disposeModelSelection = null;
  }

  /**
   * 列出可用模型 + 当前模型 (工作台模型选择器数据源)。
   * H2 返修 (v5 审查): 当前模型从 session.requestHeader()?.config 读 (平台
   * 同款, dsh-host-apiproxy L1762); 可用列表经 llm.listProviders 枚举所有
   * 已注册 provider, 聚合各 provider 的 listModels — 不再硬编码 provider。
   */
  async getModels() {
    const llm = this.ctx.get?.("llm");
    let currentProvider = null;
    let currentModel = null;
    try {
      const header = this.agent.session?.requestHeader?.();
      currentProvider = header?.config?.provider ?? null;
      currentModel = header?.config?.model ?? null;
    } catch {
      // requestHeader 不可用: 当前模型未知, 列表仍可枚举。
    }
    let available = [];
    if (llm?.listProviders !== undefined) {
      try {
        const providers = llm.listProviders();
        const providerIds = providers?.map((p) => p.id ?? p.name ?? p).filter(Boolean) ?? [];
        // 当前 provider 优先, 再补其余已注册 provider。
        const ordered = currentProvider ? [currentProvider, ...providerIds.filter((p) => p !== currentProvider)] : providerIds;
        const seen = new Set();
        for (const provider of ordered.slice(0, 8)) {
          try {
            const models = await llm.listModels(provider);
            for (const m of models ?? []) {
              const id = m.id ?? m.model ?? String(m);
              if (seen.has(id)) continue;
              seen.add(id);
              available.push({
                id,
                label: m.label ?? m.name ?? id,
                provider,
              });
            }
          } catch {
            // 单个 provider 失败不影响其余。
          }
        }
      } catch {
        available = [];
      }
    }
    return {
      current: { provider: currentProvider, model: currentModel },
      available,
      switched: this.modelSelection.current ?? null,
    };
  }

  /** 切换 worker 会话模型 (下一次请求生效). H2 返修: 校验模型存在 + 记录. */
  async setModel(provider, model) {
    if (typeof model !== "string" || model.length === 0) return { ok: false, reason: "model required" };
    // 校验: 模型必须在当前可用列表内 (防假模型 → 派发失败 → FATAL 自伤).
    const models = await this.getModels();
    const known = models.available.find((m) => m.id === model || m.label === model);
    if (known === undefined) {
      return { ok: false, reason: `model "${model}" not in available list` };
    }
    const resolvedProvider = provider && provider.length > 0 ? provider : (known.provider ?? models.current?.provider ?? "deepseek-official");
    this.modelSelection.current = { provider: resolvedProvider, model: known.id };
    return { ok: true, current: this.modelSelection.current };
  }

  start() {
    this.pacemaker.start();
    // 手动切换模型: 安装 dsh-agent 的 model selection 钩子 (运行中可切换).
    void (async () => {
      try {
        const { installModelSelection } = await import("@deepseek-ai/dsh-agent");
        this.disposeModelSelection = installModelSelection(this.agent.ctx, this.modelSelection);
      } catch {
        this.disposeModelSelection = null; // 不可用则降级
      }
    })();
    // P1 (DEV): 重启后重建员工 agent + 排空遗留队列 (防队列楔死/排队任务丢失)
    void (async () => {
      try {
        await this.workers.load();
        const all = this.workers.list();
        for (const w of all) {
          const started = await this.startEmployeeAgent(w.id).catch(() => null);
          if (started?.ok) {
            const workerDir = join(this.root, "workers", w.id);
            const { queueStatus } = await import("./employee/queue.js");
            const qs = await queueStatus(workerDir);
            if (!qs.idle) {
              const { dequeue, complete } = await import("./employee/queue.js");
              if (qs.running) await complete(workerDir, qs.running);
              const handle = this.employeeAgents.get(w.id);
              if (handle) await this.pumpEmployeeQueue(w.id, workerDir, handle.agent).catch(() => {});
            }
          }
        }
      } catch { /* 员工恢复失败不阻塞启动 */ }
    })();
    void Promise.all([
      this.checkpoint.load(),
      this.skills.load(),
      this.memory.load(),
      this.loops.load(),
      this.probes.load(),
      this.persona.load(),
      this.workOrders.load(),
      this.workers.load(),
    ]).then(async () => {
      // 日预算持久化: 加载 state.json (重启不清零)
      try {
        this.stateFile = join(this.root, "state.json");
        const { readFile } = await import("node:fs/promises");
        const saved = JSON.parse(await readFile(this.stateFile, "utf8"));
        this.watcher.restoreState(saved);
      } catch { /* 无历史 state 或损坏 — 从零 */ }
      // 定期落盘 (每 60s)
      setInterval(() => {
        if (!this.stateFile || this.stopping) return;
        import("node:fs/promises").then(async ({ writeFile }) => {
          try { await writeFile(this.stateFile, JSON.stringify(this.watcher.persistState(), null, 2), "utf8"); } catch {}
        }).catch(() => {});
      }, 60_000).unref?.();
    }).catch((error) => {
      this.ctx.logger?.warn?.(`cw: worker stores load failed: ${String(error)}`);
    });
    // resume 装配: detect persistent identity, attempt session resume or
    // fall back to store recovery. Non-blocking.
    // Empty workerSessionId = not configured: skip session resume entirely.
    const sessionId = this.config.workerSessionId && this.config.workerSessionId.length > 0 ? this.config.workerSessionId : null;
    void this.resumeIdentity(sessionId)
      .then((r) => { this.resumeInfo = r; })
      .catch((error) => {
        this.resumeInfo = { resumed: false, mode: "store-recovery", reason: String(error?.message ?? error) };
      });
  }

  async dispose() {
    this.stopping = true;
    this.disposeModelSelection?.();
    await this.pacemaker.dispose();
  }

  /**
   * resume 装配（剩余项 2）: detect a persistent worker identity and attempt
   * session resume via ctx.agents.resume when the platform provides it.
   * Falls back gracefully: the plugin's file stores (checkpoint/skills/memory/
   * loops/probes) already restore durable state across sessions — session
   * history resume is the only thing agent-loop.resume adds, and it is only
   * meaningful on a long-lived host (headless one-shot has no persisted
   * session identity to resume).
   * @param {string|null} workerSessionId - configured resume target (null = auto).
   * @returns {{ resumed: boolean, mode: string, reason?: string }}
   */
  async resumeIdentity(workerSessionId = null) {
    // 1) Durable worker identity: any persisted ledger/store proves the worker
    //    existed before this session.
    await Promise.all([this.checkpoint.load(), this.skills.load(), this.memory.load(), this.loops.load()]);
    const hasDurableState =
      this.checkpoint.snapshot().total > 0 ||
      this.skills.snapshot().total > 0 ||
      this.memory.snapshot().total > 0 ||
      this.loops.snapshot().total > 0;
    if (!hasDurableState) {
      return { resumed: false, mode: "fresh", reason: "no durable worker state" };
    }

    // 2) Attempt session-level resume when the platform exposes agents.resume
    //    AND a target session id is configured. Fail-soft on any error.
    if (workerSessionId !== null && this.ctx.agents?.resume !== undefined) {
      try {
        const handle = await this.ctx.agents.resume(this.ctx, { resumeSessionId: workerSessionId });
        if (handle !== undefined) {
          return { resumed: true, mode: "session-resume", sessionId: workerSessionId };
        }
      } catch (error) {
        return { resumed: false, mode: "store-recovery", reason: `resume failed: ${String(error?.message ?? error)}` };
      }
    }

    // 3) Default: store-level recovery (durable ledger + file stores).
    return { resumed: false, mode: "store-recovery", reason: "durable stores restored; session history resume not configured" };
  }

  /**
   * P1b: aggregated status snapshot for the Web panel client (read-only).
   * Combines watcher health, budget, registry, loops, probes, work orders.
   */
  async getStatus() {
    const now = Date.now();
    const { foldWorkerEvents: fold, recordView } = await import("./registry.js");
    let registry = { records: [] };
    try {
      const folded = fold(this.agent.session.events, this.agent.session.header.seedLength ?? 0);
      registry = {
        records: folded.active.map((r) => {
          const v = recordView(r, now);
          const nextRunAt =
            v.kind === "heartbeat" && v.intervalSeconds !== undefined
              ? new Date(now + v.intervalSeconds * 1000).toISOString()
              : v.rule?.everySeconds !== undefined
                ? new Date(now + v.rule.everySeconds * 1000).toISOString()
                : null;
          return {
            id: v.id, kind: v.kind, state: v.state, runCount: v.runCount,
            maxRuns: v.maxRuns, due: v.due, expired: v.expired,
            project: v.project ?? null, task: v.task ?? null,
            prompt: (v.prompt ?? "").slice(0, 120),
            scheduledAt: v.scheduledAt, nextRunAt,
            lastRunAt: v.lastRunAt ?? null,
          };
        }),
      };
    } catch {
      registry = { records: [], corrupt: true };
    }
    await Promise.all([this.loops.load(), this.probes.load(), this.workOrders.load(), this.persona.load(), this.checkpoint.load(), this.workers.load()]);
    const orders = this.workOrders.list();
    const recentRuns = this.checkpoint.snapshot().recent ?? [];
    // H1 返修 (v5 复审): 对话回显 — 纯函数 extractRecentMessages 处理平台
    // SessionEvent 真实形状 { type, seq, time, data } (见函数定义, 可单测)。
    const recentMessages = extractRecentMessages(this.agent.session?.events ?? []);
    return {
      watcher: this.watcher.snapshot(),
      persona: this.persona.snapshot(),
      registry,
      loops: this.loops.list().map((l) => ({ id: l.id, state: l.state, iteration: l.iteration, maxIterations: l.maxIterations, lastResult: l.lastResult })),
      probes: this.probes.list().map((p) => ({ id: p.id, kind: p.kind, anomalyCount: p.anomalyCount, enabled: p.enabled, check: p.check })),
      workOrders: { ...this.workOrders.snapshot(), pending: orders.filter((o) => o.reviewStatus === "pending") },
      checkpoint: this.checkpoint.snapshot(),
      recentRuns,
      recentMessages, // H1: 对话回显数据源
      budget: this.watcher.snapshot().budget,
      resume: this.resumeInfo ?? null, // resume 装配状态
    };
  }

  /**
   * 仪表盘控制操作 (侧边栏 Dashboard 经服务调用): pause/resume/stop/run_once
   * (registry 记录) 与 loop_stop (loop 记录)。等价于对应 cw_* 工具但走宿主
   * 服务面, 供 Web 面板按钮使用。
   */
  async control(action, id, extra = {}) {
    const { foldWorkerEvents: fold, changeUpdate, changeDelete, changeDispatch, changeCreate, pauseRecord, resumeRecord, buildScheduleRecord, buildHeartbeatRecord } = await import("./registry.js");
    const { deliver } = await import("./waker.js");

    // ---- UI v4: 无 id 的动作 (创建类 / 全局类) ----
    if (action === "create_schedule") {
      const now = Date.now();
      const interval = Number.isSafeInteger(extra.intervalSeconds) && extra.intervalSeconds >= 30 ? extra.intervalSeconds : 3600;
      const record = buildScheduleRecord({
        id: `cw-${Math.floor(now / 1000).toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        rule: { everySeconds: interval },
        prompt: String(extra.prompt ?? "scheduled task"),
        maxRuns: Number.isSafeInteger(extra.maxRuns) && extra.maxRuns > 0 ? extra.maxRuns : 10,
        expiresIn: String(extra.expiresIn ?? "24h"),
        scheduledAt: new Date(now + interval * 1000).toISOString(),
        project: typeof extra.project === "string" ? extra.project : null,
        task: typeof extra.task === "string" ? extra.task : null,
      });
      this.agent.session.append("continuous-worker/change", changeCreate(record));
      return { id: record.id, ok: true, created: true };
    }
    if (action === "create_heartbeat") {
      const now = Date.now();
      const interval = Number.isSafeInteger(extra.intervalSeconds) && extra.intervalSeconds >= 30 ? extra.intervalSeconds : 3600;
      const record = buildHeartbeatRecord({
        id: `cw-${Math.floor(now / 1000).toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        intervalSeconds: interval,
        prompt: String(extra.prompt ?? "heartbeat task"),
        maxRuns: Number.isSafeInteger(extra.maxRuns) && extra.maxRuns > 0 ? extra.maxRuns : 10,
        expiresIn: String(extra.expiresIn ?? "24h"),
        stepTokenBudget: 50_000,
        scheduledAt: new Date(now + interval * 1000).toISOString(),
        project: typeof extra.project === "string" ? extra.project : null,
        task: typeof extra.task === "string" ? extra.task : null,
      });
      this.agent.session.append("continuous-worker/change", changeCreate(record));
      return { id: record.id, ok: true, created: true };
    }
    if (action === "pause_all" || action === "resume_all") {
      const folded = fold(this.agent.session.events, this.agent.session.header.seedLength ?? 0);
      // P1 (DEV REVIEWER): resume_all 只处理 paused (resumeRecord 对非 paused 抛错);
      // pause_all 处理 active|paused.
      const targets = action === "resume_all"
        ? folded.active.filter((r) => r.state === "paused")
        : folded.active.filter((r) => r.state === "active" || r.state === "paused");
      for (const r of targets) {
        const next = action === "pause_all" ? pauseRecord(r) : resumeRecord(r);
        this.agent.session.append("continuous-worker/change", changeUpdate(next));
      }
      return { ok: true, affected: targets.length, action };
    }
    if (action === "work_order_approve" || action === "work_order_reject") {
      await this.workOrders.load();
      const result = await this.workOrders.review(id, action === "work_order_approve" ? "approved" : "rejected", "panel");
      return { id, ok: !result.notFound, ...result };
    }

    const folded = fold(this.agent.session.events, this.agent.session.header.seedLength ?? 0);
    if (action === "loop_stop") {
      await this.loops.load();
      const loop = this.loops.get(id);
      if (loop === undefined) return { id, ok: false, code: "not_found" };
      const { stopLoop } = await import("./loop.js");
      await this.loops.save(stopLoop(loop));
      return { id, ok: true, action };
    }

    const record = folded.active.find((r) => r.id === id);
    if (record === undefined) return { id, ok: false, code: "not_found" };

    switch (action) {
      case "pause": {
        const paused = pauseRecord(record);
        this.agent.session.append("continuous-worker/change", changeUpdate(paused));
        return { id, ok: true, state: paused.state };
      }
      case "resume": {
        const resumed = resumeRecord(record);
        this.agent.session.append("continuous-worker/change", changeUpdate(resumed));
        return { id, ok: true, state: resumed.state };
      }
      case "stop": {
        this.agent.session.append("continuous-worker/change", changeDelete(id));
        return { id, ok: true, stopped: true };
      }
      case "run_once": {
        // P0-3 (DEV REVIEWER): 面板 run_once 必须复用工具面的完整路径
        // (预算闸 + checkpoint + supervision), 不能绕过 limits 引擎强制.
        if (record.state === "paused") return { id, ok: false, reason: "paused" };
        // P1 (DEV REVIEWER): 对齐工具面 — done/expired 不能再派发 (有界性)
        if (record.state === "done") return { id, ok: false, reason: "done (maxRuns reached)" };
        const now2 = Date.now();
        const { isExpired } = await import("./registry.js");
        if (isExpired(record, now2)) return { id, ok: false, reason: "expired" };
        const tokens = Math.max(1, Math.ceil((record.prompt?.length ?? 0) / 4) + 8);
        this.watcher.resetRun();
        const gate = this.watcher.chargeRunTokens(tokens, now2);
        if (!gate.ok) return { id, ok: false, reason: gate.reason };
        try {
          const at = new Date().toISOString();
          await this.checkpoint.begin({ recordId: id, at, action: "run_once" });
          const key = `${id}@${at}`;
          if (record.kind === "heartbeat") {
            const { advanceHeartbeat } = await import("./registry.js");
            this.agent.session.append("continuous-worker/change", changeUpdate(advanceHeartbeat(record, Date.now())));
          } else {
            this.agent.session.append("continuous-worker/change", changeDispatch(id, at));
          }
          const { deliver } = await import("./waker.js");
          deliver(this.agent, record.prompt);
          await this.checkpoint.complete(key);
          this.watcher.onDispatchSuccess();
          return { id, ok: true, delivered: true };
        } catch (error) {
          return { id, ok: false, error: error.message };
        }
      }
      default:
        return { id, ok: false, reason: `unknown action ${action}` };
    }
  }

  /**
   * 用户↔AGI 交流 (UI v4): 工作台发出的指令直接投递给 agent。
   * 复用 waker.deliver — idle 时 followup 新回合, busy 时 inject 排队。
   * @param {string} text - 用户指令 (工作台输入框内容).
   * @returns {Promise<{ok: boolean, mode: "delivered"|"queued", reason?: string}>}
   */
  async instruct(text) {
    if (typeof text !== "string" || text.trim().length === 0) {
      return { ok: false, reason: "empty instruction" };
    }
    const { deliver } = await import("./waker.js");
    if (this.watcher.state.fatal) {
      return { ok: false, reason: "worker is FATAL — resume required" };
    }
    const mode = deliver(this.agent, `[工作台指令] ${text.trim()}`);
    return { ok: true, mode };
  }

  /* ---- v8 多员工: 员工 CRUD + 工作区 + 独立对话 ---- */

  /** 创建员工 (一个员工 = 一个面板 + 一个工作区 + 灵魂 prompt + 运行 agent). */
  async createEmployee(name, cwd = null, prompt = null) {
    await this.workers.load();
    try {
      const w = createWorker({ name, cwd, prompt });
      await this.workers.create(w);
      // M2a: 启动员工 agent (preset mount + 灵魂注入)
      // P0-D fix: agent 启动失败 → 回滚员工实体 (拒绝即回滚创建)
      const started = await this.startEmployeeAgent(w.id);
      if (!started.ok) {
        await this.workers.remove(w.id).catch(() => {});
        return { ok: false, reason: `employee agent failed to start: ${started.reason ?? "unknown"}` };
      }
      return { ok: true, worker: this.workers.get(w.id) };
    } catch (error) {
      return { ok: false, reason: String(error?.message ?? error) };
    }
  }

  /**
   * M2a: 启动员工独立后台 agent — agents.create + setup 显式 mount 类型 preset +
   * 灵魂 section + 记忆变量通道. 员工 agent 经 session.header.agentPreset (employee-) 被
   * agent/created 处理器排除出 WorkerRuntime (控制面不重复).
   */
  async startEmployeeAgent(id) {
    await this.workers.load();
    const w = this.workers.get(id);
    if (!w) return { ok: false, reason: "worker not found" };
    if (typeof this.ctx?.agents?.create !== "function") return { ok: false, reason: "no agents seam" };
    try {
      const { buildCreateOptions } = await import("./employee/agent-runner.js");
      const { compilePrompt } = await import("./employee/prompt-compiler.js");
      const { assemble, renderBundle } = await import("./employee/memory-broker.js");
      // 读取员工灵魂 (已落盘)
      const ps = this.workers.getPromptStore(id);
      const prompt = ps ? await ps.getCurrent() : null;
      const soulText = prompt ? compilePrompt(prompt, {}) : "";
      // M3: MemoryBroker 组装真实记忆 → employee_memory 变量通道
      const workerDir = join(this.root, "workers", w.id);
      let memoryBundleText = "";
      try {
        const bundle = await assemble(workerDir, { query: (prompt?.soul?.description ?? "").slice(0, 40) });
        memoryBundleText = renderBundle(bundle);
      } catch { /* 记忆组装失败不阻塞启动 */ }
      const opts = buildCreateOptions({
        ctx: this.ctx,
        workerId: w.id,
        workerName: w.name,
        presetId: `employee-${(w.role && w.role.trim()) ? w.role.trim() : "ops"}`,
        model: w.model ?? null,
        cwd: w.cwd ?? join(this.root, "workers", w.id), // 无工作区时兜底员工数据目录 (必为绝对路径, 防平台继承会话名)
        soulSystemPrompt: soulText,
        memoryBundleText,   // M3: 真实记忆注入
        prompt,             // M2 P0-D: limits 守卫
        workerDir,          // budget ledger 落点
      });
      const handle = await this.ctx.agents.create(opts);
      this.employeeAgents.set(id, handle);
      // P1 (DEV): 启动后排空重启遗留队列 (防 running 楔死/pending 永不派发)
      try {
        const workerDir2 = join(this.root, "workers", w.id);
        const { queueStatus } = await import("./employee/queue.js");
        const qs = await queueStatus(workerDir2);
        if (!qs.idle) {
          // stale running 视为已完成 (重启后 agent 不在, 任务实际丢失), 清锁后排空
          const { dequeue, complete } = await import("./employee/queue.js");
          if (qs.running) await complete(workerDir2, qs.running);
          await this.pumpEmployeeQueue(id, workerDir2, handle.agent);
        }
      } catch { /* 队列恢复失败不阻塞 */ }
      return { ok: true, agentId: handle.agent.id };
    } catch (error) {
      // 员工 agent 启动失败不阻塞员工实体创建 (可后续重试)
      return { ok: false, reason: String(error?.message ?? error), nonFatal: true };
    }
  }

  /** 列所有员工 (含任务数/对话条数). */
  async listEmployees() {
    await this.workers.load();
    return this.workers.list().map((w) => ({
      id: w.id, name: w.name, cwd: w.cwd, model: w.model,
      taskCount: (w.tasks ?? []).length, chatCount: this.workers.getChat(w.id).length,
      status: w.status, createdAt: w.createdAt,
    }));
  }

  /** 设员工工作区 (cwd 项目目录). */
  async setEmployeeWorkspace(id, cwd) {
    await this.workers.load();
    if (typeof cwd !== "string" || cwd.length === 0) return { ok: false, reason: "cwd required" };
    const w = await this.workers.setWorkspace(id, cwd);
    if (w.notFound) return { ok: false, reason: "worker not found" };
    return { ok: true, worker: w };
  }

  /** 删员工. */
  async removeEmployee(id) {
    await this.workers.load();
    // M2 P1: dispose 员工 agent handle (防泄漏)
    const handle = this.employeeAgents.get(id);
    if (handle) {
      this.employeeAgents.delete(id);
      await Promise.resolve(handle.dispose?.()).catch(() => {});
    }
    const r = await this.workers.remove(id);
    return r.notFound ? { ok: false, reason: "worker not found" } : { ok: true };
  }

  /**
   * 给员工下指令: 存插件 chat (独立于 DSH 会话) + 投递执行。
   * M2 P0-D: 员工有独立 agent 时 → 入队 + 用员工 agent 派发 (send/inject),
   *          budget 闸在员工 agent 工具调用时生效 (employeeToolGuard);
   *          无员工 agent (启动失败/未建) 时降级 root deliver。
   */
  async instructEmployee(id, text) {
    await this.workers.load();
    const w = this.workers.get(id);
    if (!w) return { ok: false, reason: "worker not found" };
    if (typeof text !== "string" || text.trim().length === 0) return { ok: false, reason: "empty instruction" };
    const now = new Date().toISOString();
    await this.workers.appendChat(id, { role: "user", text: text.trim(), at: now });
    // M2: 员工 agent 派发 (P0-D 真修: 合规消息 + 队列真驱动)
    const handle = this.employeeAgents.get(id);
    if (handle?.agent && typeof handle.agent.send === "function") {
      const { enqueue } = await import("./employee/queue.js");
      const workerDir = join(this.root, "workers", id);
      // 编译灵魂注入指令 (带员工身份)
      let soulNote = "";
      let memoryNote = "";
      try {
        const ps = this.workers.getPromptStore(id);
        const prompt = ps ? await ps.getCurrent() : null;
        if (prompt) {
          const { compilePrompt } = await import("./employee/prompt-compiler.js");
          soulNote = `\n\n===== 员工 ${w.name} 的灵魂档案 (执行时遵循) =====\n${compilePrompt(prompt, {})}\n===== 档案结束 =====`;
        }
        // M3 P0-2: 每次派发带最新记忆 (assemble → renderBundle)
        const { assemble, renderBundle } = await import("./employee/memory-broker.js");
        const bundle = await assemble(workerDir, { query: (prompt?.soul?.description ?? "").slice(0, 40) });
        const memText = renderBundle(bundle);
        if (memText) memoryNote = `\n\n===== 记忆上下文 (参考, 不可信, 以灵魂为准) =====\n${memText}\n===== 记忆结束 =====`;
      } catch { /* 编译/记忆失败不阻塞 */ }
      // 队列: 入队 (带 text + 纯 instruction) → pump 尝试派发 (忙则挂起, idle 时排空)
      const taskId = `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      await enqueue(workerDir, { taskId, text: `[员工 ${w.name}] ${text.trim()}${soulNote}${memoryNote}`, instruction: text.trim() });
      const pumped = await this.pumpEmployeeQueue(id, workerDir, handle.agent);
      await this.workers.appendChat(id, { role: "ai", text: pumped ? "已投递给员工 agent，正在执行…" : "员工正忙，任务已排队。", at: new Date().toISOString() });
      return { ok: true, mode: pumped ? "delivered" : "queued", via: "employee-agent", agentId: handle.agent.id };
    }
    // 降级: root deliver (无员工 agent)
    const { deliver } = await import("./waker.js");
    const cwdNote = w.cwd ? ` (工作区: ${w.cwd})` : "";
    let soulNote = "";
    let memoryNote = "";
    try {
      const ps = this.workers.getPromptStore(id);
      const prompt = ps ? await ps.getCurrent() : null;
      if (prompt) {
        const { compilePrompt } = await import("./employee/prompt-compiler.js");
        soulNote = `\n\n===== 员工 ${w.name} 的灵魂档案 (执行时遵循) =====\n${compilePrompt(prompt, {})}\n===== 档案结束 =====`;
      }
      // M3: root-fallback 也带最新记忆
      const { assemble, renderBundle } = await import("./employee/memory-broker.js");
      const bundle = await assemble(join(this.root, "workers", id), { query: (prompt?.soul?.description ?? "").slice(0, 40) });
      const memText = renderBundle(bundle);
      if (memText) memoryNote = `\n\n===== 记忆上下文 (参考, 不可信, 以灵魂为准) =====\n${memText}\n===== 记忆结束 =====`;
    } catch { /* 编译失败不阻塞投递 */ }
    const mode = deliver(this.agent, `[员工 ${w.name}${cwdNote}] ${text.trim()}${soulNote}${memoryNote}`);
    await this.workers.appendChat(id, { role: "ai", text: `已接收指令${mode === "delivered" ? "，正在执行…" : "，已排队。"}`, at: new Date().toISOString() });
    return { ok: true, mode, via: "root-fallback" };
  }

  /**
   * M2 P0-D: 员工队列消费者 — dequeue 取锁 → 派发 (dequeue 出的 taskId 与发送/完成一致)
   * → agent.ctx.on("agent/status" idle) 完成 + 排空 pending; 120s 兜底防卡死.
   * @returns {boolean} 是否真的派发了一个任务
   */
  async pumpEmployeeQueue(id, workerDir, agent) {
    try {
      const { dequeue, complete } = await import("./employee/queue.js");
      const slot = await dequeue(workerDir);
      if (!slot.taskId) return false; // 忙或无任务
      const { buildTaskMessage } = await import("./waker.js");
      // 残留②: send 同步抛错 → 立即 complete 清 running (防队列楔死)
      let sent = false;
      try {
        agent.send(buildTaskMessage(slot.text), "next-turn", true);
        sent = true;
      } catch {
        await complete(workerDir, slot.taskId).catch(() => {});
        return false;
      }
      if (!sent) return false;
      // P0-1 (M4): idle → completed; 120s 兜底 → timeout (不算成功, 防失败流程固化技能)
      const done = (result) => {
        // M3 P0-1 + M4: 任务完成 → 反思循环 (情景记忆 + 经验沉淀 + 技能固化 + 成长轨迹)
        const instruction = slot.instruction ?? slot.text ?? "";
        import("./employee/evolution.js").then(async (ev) => {
          try {
            await ev.reflect(workerDir, { taskId: slot.taskId, instruction, taskText: slot.text ?? "", result });
          } catch { /* 反思失败不阻塞 */ }
        }).catch(() => {});
        complete(workerDir, slot.taskId).then(() => this.pumpEmployeeQueue(id, workerDir, agent).catch(() => {})).catch(() => {});
      };
      // agent 本体无 on/off — 用 agent.ctx (平台事件面)
      const ctx = agent.ctx;
      const onStatus = (p) => { if (p?.status === "idle") { ctx?.off?.("agent/status", onStatus); clearTimeout(timer); done("completed"); } };
      ctx?.on?.("agent/status", onStatus);
      // 残留①: 保存 timer, idle 时 clearTimeout (防并发两回合)
      const timer = setTimeout(() => { ctx?.off?.("agent/status", onStatus); done("timeout"); }, 120_000);
      return true;
    } catch {
      return false;
    }
  }

  /** 读员工对话历史. */
  async employeeChat(id) {
    await this.workers.load();
    const w = this.workers.get(id);
    if (!w) return { ok: false, reason: "worker not found" };
    return { ok: true, chat: this.workers.getChat(id) };
  }

  /** M4: 用户反馈 → 习惯记忆 (upsertHabit). */
  async employeeFeedback(id, name, value) {
    await this.workers.load();
    const w = this.workers.get(id);
    if (!w) return { ok: false, reason: "worker not found" };
    if (typeof name !== "string" || name.trim().length === 0) return { ok: false, reason: "habit name required" };
    const { upsertHabit } = await import("./employee/memory-broker.js");
    const habits = await upsertHabit(join(this.root, "workers", id), { name: name.trim(), value: String(value ?? true) });
    return { ok: true, habits };
  }

  /** M4: 成长轨迹 (供 UI 成长页). */
  async employeeGrowth(id) {
    await this.workers.load();
    const w = this.workers.get(id);
    if (!w) return { ok: false, reason: "worker not found" };
    const { readGrowth } = await import("./employee/evolution.js");
    const g = await readGrowth(join(this.root, "workers", id));
    return { ok: true, growth: g };
  }

  /** DSH 已有工作区列表 (创建员工下拉选择). ctx.workspaces (client 侧) 不可用时 sessions 去重兜底. */
  async listWorkspaces() {
    try {
      const ws = this.ctx.get("workspaces");
      const list = ws?.list;
      // ObservableSnapshot / SnapshotStore: 尝试 .value 或 .get()
      const state = (list && typeof list.get === "function") ? list.get() : (list?.value ?? list);
      const items = Array.isArray(state?.items) ? state.items : null;
      if (items) {
        return { ok: true, workspaces: items.map((w) => ({ id: w.workspaceId ?? w.id, title: w.title ?? w.path, path: w.path })) };
      }
    } catch { /* workspaces 服务不可用 */ }
    // 兜底: 从会话的 cwd (工作区路径) 去重提取
    try {
      const sessions = this.ctx.sessions;
      const list = typeof sessions?.list === "function" ? sessions.list() : [];
      const seen = new Map();
      for (const s of Array.isArray(list) ? list : []) {
        const cwd = s?.header?.cwd ?? s?.meta?.cwd ?? s?.cwd;
        if (typeof cwd === "string" && cwd.length > 0) {
          seen.set(cwd, { id: cwd, title: cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd, path: cwd });
        }
      }
      return { ok: true, workspaces: [...seen.values()].slice(0, 50) };
    } catch { /* sessions 也不可用 */ }
    return { ok: true, workspaces: [] };
  }

  /**
   * 真 AI 生成员工灵魂: 任务描述 → LLM 产出结构化灵魂 JSON → 组装完整 prompt.
   * 替代前端正则模板 (用户反馈: 灵魂太简单).
   */
  async generateSoul(taskDesc) {
    const llm = this.ctx.get("llm");
    if (!llm?.stream) return { ok: false, reason: "llm service unavailable" };
    // 当前模型: modelSelection (setModel 设) 兜底 getModels (从 agent session header 读)
    // 诊断: bai 路由 finish-only — 临时降级候选 (deepseek-modlens)
    let cur = this.modelSelection?.current ?? (await this.getModels().catch(() => ({ current: null }))).current;
    let provider = cur?.provider;
    let model = cur?.model;
    if (provider === "bai") {
      const models = await this.getModels().catch(() => ({ available: [] }));
      const alt = (models.available ?? []).find((m) => m.provider !== "bai");
      if (alt) { provider = alt.provider; model = alt.id; }
    }
    if (!provider || !model) return { ok: false, reason: "no active model" };
    const system = [
      "你是「AI 员工灵魂设计器」。根据用户描述的任务，设计一个 7×24 常驻 AI 员工的完整灵魂档案。",
      "只输出一个 JSON 对象（不要 markdown 代码块），结构：",
      '{"name":"中文名(简短,2-4字)","role":"岗位角色(如 运维工程师)","description":"一句话定位(≤60字)","mission":"使命陈述(≤120字,含7×24职责)","skills":[{"name":"技能名","keywords":["关键词"]}](3-5项)","persona":{"tone":"语气(沉稳/活泼/严谨…)","style":["工作风格"],"quirks":"小癖好(可空)"},"workflow":{"planFirst":true,"reportFrequency":"daily|hourly","escalation":"error-first|wait","maxAutonomy":"handle-routine-escalate-risk"},"values":["价值观"](3-5条),"rules":["行为边界"](3-5条,含安全/权限)}',
      "要求：角色与任务匹配；价值观/边界务实可执行；不要输出 JSON 之外的任何文字。",
    ].join("\n");
    let text = "";
    try {
      // 合法 Message 契约 (id + source + ContentBlock[]) — 参照 dsh-verification 完整结构
      const stream = llm.stream({
        provider, model,
        system,
        messages: [{
          id: `cw-soul-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
          role: "user",
          content: [{ type: "text", text: taskDesc.slice(0, 400) }],
          source: { kind: "plugin", plugin: "dsh-continuous-worker" },
        }],
        temperature: 0,
        maxTokens: 4000,
      });
      for await (const chunk of stream) {
        // StreamChunk: 文本增量是 { type: 'text-delta', text } (reasoning-delta 忽略)
        if (chunk?.type === "text-delta" && typeof chunk.text === "string") text += chunk.text;
      }
    } catch (error) {
      return { ok: false, reason: `llm call failed: ${String(error?.message ?? error)}` };
    }
    if (text.length === 0) {
      return { ok: false, reason: "llm returned no text" };
    }
    // 提取 JSON (去 markdown 围栏)
    const cleaned = text.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start < 0 || end <= start) throw new Error("no JSON object");
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return { ok: false, reason: `llm output not parseable as JSON (${text.length} chars): ${text.slice(0, 160)}` };
    }
    // 组装完整 prompt (走 schema 校验)
    try {
      const { createPromptJson, validatePrompt } = await import("./employee/prompt-schema.js");
      const soul = {
        identity: {
          name: String(parsed.name ?? "小AI").slice(0, 12),
          role: String(parsed.role ?? "全能员工").slice(0, 24),
          emoji: "", visual: {},
        },
        description: String(parsed.description ?? taskDesc.slice(0, 60)).slice(0, 80),
        mission: String(parsed.mission ?? taskDesc.slice(0, 120)).slice(0, 200),
        skills: Array.isArray(parsed.skills) ? parsed.skills.slice(0, 5).map((s) => ({ name: String(s?.name ?? "通用").slice(0, 24), keywords: Array.isArray(s?.keywords) ? s.keywords.slice(0, 8).map(String) : [] })) : [],
        persona: {
          tone: String(parsed.persona?.tone ?? "沉稳").slice(0, 12),
          style: Array.isArray(parsed.persona?.style) ? parsed.persona.style.slice(0, 6).map(String) : ["先规划后执行"],
          quirks: String(parsed.persona?.quirks ?? "").slice(0, 60),
        },
        workflow: { planFirst: true, reportFrequency: "daily", escalation: "error-first", maxAutonomy: "handle-routine-escalate-risk" },
        values: Array.isArray(parsed.values) ? parsed.values.slice(0, 5).map(String) : ["如实汇报", "不越权限"],
        rules: Array.isArray(parsed.rules) ? parsed.rules.slice(0, 5).map(String) : ["不删除工作区之外的文件", "危险操作先请示"],
      };
      const prompt = createPromptJson({
        soul,
        meta: { source: "llm-generated", generation: { fromTask: taskDesc.slice(0, 200), model: `${provider}/${model}` } },
      });
      const check = validatePrompt(prompt);
      if (!check.ok) return { ok: false, reason: `soul invalid: ${check.errors.join("; ")}` };
      return { ok: true, prompt };
    } catch (error) {
      return { ok: false, reason: `soul build failed: ${String(error?.message ?? error)}` };
    }
  }

  /** M5: 思维留痕 (taskId 缺省返回任务列表). */
  async employeeThinking(id, taskId = null) {
    await this.workers.load();
    const w = this.workers.get(id);
    if (!w) return { ok: false, reason: "worker not found" };
    const { readThinking, listThinkingTasks } = await import("./employee/thinking.js");
    const workerDir = join(this.root, "workers", id);
    if (taskId) {
      return { ok: true, taskId, entries: await readThinking(workerDir, taskId) };
    }
    return { ok: true, tasks: await listThinkingTasks(workerDir) };
  }

  /** 员工自身状态 (隔离于 root) — 实体 + 成长 + 思维 + 队列 + ledger. */
  async employeeStatus(id) {
    await this.workers.load();
    const w = this.workers.get(id);
    if (!w) return { ok: false, reason: "worker not found" };
    const workerDir = join(this.root, "workers", id);
    const [growth, thinking, queue, ledger] = await Promise.all([
      import("./employee/evolution.js").then((m) => m.readGrowth(workerDir)).catch(() => null),
      import("./employee/thinking.js").then((m) => m.listThinkingTasks(workerDir)).catch(() => []),
      import("./employee/queue.js").then((m) => m.queueStatus(workerDir)).catch(() => ({ pending: 0, running: null, idle: true })),
      import("./employee/budget.js").then((m) => m.readLedger(workerDir, w.promptLimits)).catch(() => null),
    ]);
    const agentAlive = this.employeeAgents.has(id);
    return {
      ok: true,
      employee: { id: w.id, name: w.name, role: w.role ?? null, cwd: w.cwd, model: w.model, status: w.status, promptVersion: w.promptVersion },
      growth,
      thinkingTasks: thinking,
      queue,
      ledger,
      agentAlive,
    };
  }

  /**
   * M1 H4 / M4 H2 fix: durability barrier — flush the session so appended
   * ledger events are confirmed persisted before we acknowledge a mutation.
   * Returns false when the persistence backend is unavailable (fail-soft: the
   * caller decides whether to treat the write as uncertain).
   */
  async flush() {
    try {
      if (this.ctx.sessions?.flush === undefined) return false;
      return await this.ctx.sessions.flush(this.agent.session);
    } catch {
      return false;
    }
  }

  /**
   * M3 H2 fix: HOST-side accept channel for pending skills/memory — the ONLY
   * path that may promote pending items under requireSkillReviewConfirm /
   * requireRetainReview. Called by a command or the Web panel (human side),
   * never by a model tool (which is blocked in tools.js).
   */
  async reviewSkillAccept(name, reviewer = "human") {
    await this.skills.load();
    return this.skills.review({ name, decision: "accept", reviewer });
  }

  async reviewMemoryAccept(id, reviewer = "human") {
    await this.memory.load();
    return this.memory.review(id, "accept", reviewer);
  }

  /**
   * M2 H2 fix: apply the supervision preset for a task type to the worker
   * session via ctx.permissionPresets.set (the platform's per-session knob).
   * Returns { applied } or { applied:false, reason } when the service is
   * unavailable or the preset is unknown.
   */
  async applySupervision(taskType) {
    const presets = this.ctx.get("permissionPresets");
    if (presets === undefined || typeof presets.set !== "function") {
      return { applied: false, reason: "ctx.permissionPresets unavailable" };
    }
    const { supervisionPreset } = await import("./guardrails.js");
    const preset = supervisionPreset(taskType);
    // R3 Low fix: map by SANDBOX mode first (read-only stays read-only — the
    // previous never→danger-full-access branch mapped internal tasks to the
    // widest preset). Platform presets are named by sandbox mode.
    const registered = preset.sandbox === "read-only" ? "read-only"
      : preset.sandbox === "danger-full-access" ? "danger-full-access"
      : "workspace-write";
    try {
      presets.set(this.agent.session, registered);
      return { applied: true, preset: registered, taskType };
    } catch (error) {
      return { applied: false, reason: `permissionPresets.set failed: ${String(error)}` };
    }
  }
}

/**
 * Cordis function-plugin entry.
 * @param {object} ctx - global service context.
 * @param {object} config - validated Config.
 */
export function apply(ctx, config = {}) {
  const cfg = Config(config);
  // Defensive normalization: nested object defaults may not materialize under
  // some schemastery shapes — guarantee the objects exist (real bug found in
  // real-session verification: `cfg.supplyChain` was undefined).
  cfg.credentials = { requireDeclaredRefs: true, denyDirectAccess: true, ...(cfg.credentials ?? {}) };
  cfg.supplyChain = { verifyOnInstall: true, enforceOnShellTools: true, ...(cfg.supplyChain ?? {}) };
  cfg.supervision = { forbidSelfDowngrade: true, ...(cfg.supervision ?? {}) };
  cfg.skill = { requireSkillReview: true, requireSkillReviewConfirm: true, autoLearnBelowConfidence: 0.7, ...(cfg.skill ?? {}) };
  cfg.memory = { requireRetainReview: true, useAgentOSMemory: false, mcpClient: "dsh", mcpProject: "", ...(cfg.memory ?? {}) };
  cfg.report = { maxReportsPerDay: 10, ...(cfg.report ?? {}) };
  cfg.probe = { enabled: true, baseIntervalMs: 3_600_000, maxRunsPerDay: 96, dailyBudgetTokens: 50_000, anomalyCooldownMs: 1_800_000, defaultDisposition: ["record", "escalate"], ...(cfg.probe ?? {}) };
  cfg.diagnose = { enabled: true, everyRuns: 50, driftThreshold: 0.3, autoDowngrade: true, ...(cfg.diagnose ?? {}) };
  cfg.persona = { name: "", tone: "professional", outputFormat: "", constraints: [], ...(cfg.persona ?? {}) };
  cfg.guardrails = { enforcePersona: false, requirePersonaConfirm: true, ...(cfg.guardrails ?? {}) };
  cfg.workorder = { autoRecordTools: [], ...(cfg.workorder ?? {}) };
  cfg.heartbeat = { maxConsecutiveWakes: 3, delivery: "wakeup", ...(cfg.heartbeat ?? {}) };
  const runtimes = new Map();
  let stopping = false;
  // M2 P1: 员工 agent handles — apply 作用域持有 (dispose 时清理; WorkerRuntime 共享此 map)
  const employeeAgents = new Map();

  // M2a P0-B: 员工类型 preset 进入平台实际扫描的 roots.
  // 平台在构造时快照 resolvedRoots (config.roots + user root dshHome/.agent-presets),
  // push config.roots 无效 → 真修: 把插件 presets/employee-* 包装进 user root
  // (dshHome/.agent-presets, includeUserRoot 默认 true 会被扫描). 幂等: 已存在则跳过.
  // 用同步 fs (apply 非 async; 插件加载期一次性开销可接受).
  // 残留④: dshHome 用 resolve 展开 (防特殊 DSH_HOME 值相对路径分歧).
  try {
    const dshHome = resolve(
      process.env.DSH_HOME && process.env.DSH_HOME.length > 0
        ? process.env.DSH_HOME
        : join(homedir(), ".dsh")
    );
    const userPresetRoot = join(dshHome, ".agent-presets");
    const here = dirname(fileURLToPath(import.meta.url));
    const presetsDir = join(here, "..", "presets");
    const entries = readdirSync(presetsDir);
    for (const name of entries) {
      if (!name.startsWith("employee-")) continue;
      const src = join(presetsDir, name, "agent.cordis.yml");
      const dstDir = join(userPresetRoot, name);
      const dst = join(dstDir, "agent.cordis.yml");
      if (existsSync(dst)) continue;
      mkdirSync(dstDir, { recursive: true });
      copyFileSync(src, dst);
    }
  } catch { /* user root 不可写 — 静默 (部署层需配置 agentPresets.roots 指向插件 presets/) */ }

  // Model-visible guidance (装入后形态: 模型视角): tell the agent it is a
  // resident worker with cw_* tools, that scheduled work arrives on its
  // own (do not poll), and that persona/memory/skills persist.
  // ⚠️ 必须在 apply 时注册一次, 不能在 agent/created 里注册: 同名 section 重复
  // 注册会抛 "prompt section is already registered", 中断 host 的 agent 恢复
  // 流程 → 点历史会话时主区闪退回新会话页 (2026-08-18 实测根因)。
  ctx.systemPrompt.section({
    name: "continuous-worker",
    order: 110,
    text:
      "You are a resident autonomous worker (dsh-continuous-worker). Scheduled/heartbeat tasks are delivered to you automatically on their own cadence — do not poll cw_status for due work. The cw_* tools manage schedules, heartbeats, loops, memory, skills, probes, reports, and accountability. Your persona, long-term memory, and learned skills persist across sessions. Output quantity is not success: quality gates and budgets apply.",
  });

  // 浏览器端面板经 /continuous-worker HTTP 端点消费（host/浏览器 Context 独立，
  // host 的 ctx.provide 服务对 client 不可见）。currentRuntime 在 agent/created
  // 时接入实际 worker runtime；无 runtime 时路由返回 status:null / 409。
  // 多员工 (用户反馈): runtimeByAgentId 保存每个员工 (agent) 的 runtime,
  // /continuous-worker/workers 列出全部, status/control 支持 ?worker=<agentId>。
  let currentRuntime = null;
  const runtimeByAgentId = new Map();

  ctx.effect(() => {
    const disposeRoutes = registerWorkerHttpRoutes(
      ctx,
      (workerId) => {
        if (workerId && runtimeByAgentId.has(workerId)) return runtimeByAgentId.get(workerId);
        return currentRuntime;
      },
      async () => {
        const out = [];
        for (const [agentId, rt] of runtimeByAgentId) {
          try {
            const s = await rt.getStatus();
            out.push({
              id: agentId,
              name: s.persona?.name || "AI 员工",
              alive: s.watcher?.alive === true,
              downgrade: s.watcher?.downgrade,
              taskCount: s.registry?.records?.length ?? 0,
              pendingApprovals: s.workOrders?.pending?.length ?? 0,
              dayToken: s.budget?.dayTokenSpent ?? 0,
            });
          } catch {
            out.push({ id: agentId, name: "AI 员工", alive: false });
          }
        }
        return out;
      }
    );
    // 挂载一个 root agent 的 WorkerRuntime (抽成函数: agent/created 事件 + 立即补挂双路径)
    const mountRuntime = (agent) => {
      try {
        // M2a: 员工 agent 排除 — 经 session.header.agentPreset 识别 (employee- 前缀),
        // 跳过 WorkerRuntime 装配 (员工运行时强制由 employee/budget + queue 承担, 防控制面重复)
        const presetId = agent?.session?.header?.agentPreset;
        if (typeof presetId === "string" && presetId.startsWith("employee-")) return;
        if (stopping || runtimes.has(agent) || !ctx.agents.roots().includes(agent)) return;

        const runtime = new WorkerRuntime(ctx, agent, cfg, employeeAgents);

      // Attach this runtime to the HTTP endpoint so /continuous-worker status
      // and control act on the live worker once it exists.
      currentRuntime = runtime;
      runtimeByAgentId.set(agent.id, runtime);

      // (worker status 由 /continuous-worker HTTP 端点提供 — 见 apply 处路由注册)

      // M2: supply-chain interception on the pre-execute hook (docs/02 §13.13).
      // M2 补充 fix: ApprovalRequest only accepts agent/toolName/callId/reason/
      // signal — subject/description are invalid; wrap approval in try/catch
      // (approval.request throws outside an open turn). T4 blocks outright.
      const stopSupply = ctx.on("tools/pre-execute", (exec, next) => {
        if (exec.agent !== agent) return next();
        // Never intercept the plugin's own read-only query tools (they are
        // policy queries, not executions).
        if (typeof exec.name === "string" && exec.name.startsWith("cw_")) return next();
        if (!cfg.supplyChain.enforceOnShellTools) return next();
        const decision = classifySupplyCall(
          { toolName: exec.name, args: exec.arguments ?? {} },
          cfg.supplyChain
        );
        if (decision.approval === "block") {
          return { kind: "deny", reason: `cw supply-chain: ${decision.reason}` };
        }
        if (decision.approval === "ask") {
          const approval = ctx.get("approval");
          if (approval === undefined) {
            return { kind: "deny", reason: `cw supply-chain: ${decision.reason} — no approval seam` };
          }
          try {
            return approval
              .request({
                agent,
                callId: exec.callId,
                toolName: exec.name,
                reason: `cw supply-chain: ${decision.reason}`,
              })
              .then((outcome) => {
                if (outcome === "allowed-once") return next();
                return { kind: "deny", reason: `cw supply-chain: rejected (${outcome})` };
              });
          } catch {
            return { kind: "deny", reason: "cw supply-chain: approval unavailable outside a turn" };
          }
        }
        return next();
      });

      // M2 H3 fix (P0-6): credentials read-exclusion — block worker file reads
      // of the credential store and writes to plugin config/stores. Fail-closed.
      const stopCredGuard = ctx.on("tools/pre-execute", (exec, next) => {
        if (exec.agent !== agent) return next();
        if (typeof exec.name === "string" && exec.name.startsWith("cw_")) return next();
        const argsText = JSON.stringify(exec.arguments ?? {});
        const protectedPaths = [
          ".credentials.yaml",
          "continuous-worker/checkpoints",
          "settings.yaml",
          "cordis.patch.yml",
        ];
        const touched = protectedPaths.some((p) => argsText.includes(p));
        if (!touched) return next();
        const reads = typeof exec.name === "string" && /read|cat|type|view|show|get|grep|find|sed|bat/i.test(exec.name);
        const writes = typeof exec.name === "string" && /write|edit|update|delete|rm|mv|cp|patch|append/i.test(exec.name);
        if (argsText.includes(".credentials.yaml")) {
          return { kind: "deny", reason: "cw credential guard: credential store is worker-excluded (read+write)" };
        }
        if (writes && argsText.includes("continuous-worker/checkpoints")) {
          return { kind: "deny", reason: "cw credential guard: worker stores are write-protected" };
        }
        if (writes && (argsText.includes("settings.yaml") || argsText.includes("cordis.patch.yml"))) {
          return { kind: "deny", reason: "cw credential guard: plugin config is worker write-protected" };
        }
        return next();
      });

      // P1: persona red-line enforcement (M5 双轨, enforcePersona=true 时):
      // guardrails pre-execute 拦截违反 persona.constraints 的调用。
      const stopPersona = ctx.on("tools/pre-execute", (exec, next) => {
        if (exec.agent !== agent) return next();
        if (!cfg.guardrails.enforcePersona) return next();
        const decision = runtime.persona.enforce({
          toolName: exec.name,
          argsText: JSON.stringify(exec.arguments ?? {}),
        });
        if (decision.blocked) {
          return { kind: "deny", reason: `cw persona guard: ${decision.reason}` };
        }
        return next();
      });

      // P2: work_order auto-record — post-execute 对白名单外部副作用工具
      // 自动生成 work_order (gatesPassed 由插件记录, 非 worker 自填)。
      const stopWorkOrder = ctx.on("tools/post-execute", (exec, result, next) => {
        if (exec.agent !== agent) return next();
        const autoTools = cfg.workorder.autoRecordTools ?? [];
        if (autoTools.length === 0 || !autoTools.includes(exec.name)) return next();
        void runtime.workOrders
          .add(
            buildWorkOrder({
              action: `${exec.name}(${JSON.stringify(exec.arguments ?? {})})`,
              actor: agent.id,
              evidenceRef: `call:${exec.callId}`,
              gatesPassed: ["budget", "supply-chain"],
              revertPath: null,
            })
          )
          .catch(() => {});
        return next();
      });

      const cleanup = agent.ctx.effect(() => {
        const disposeTools = registerTools(ctx, agent.ctx, runtime);
        const stopStatus = agent.ctx.on("agent/status", ({ status }) => {
          if (status === "idle" && !runtime.stopping) runtime.pacemaker.requestDrive();
        });
        runtime.start();
        return async () => {
          stopStatus();
          stopSupply();
          stopCredGuard();
          stopPersona();
          stopWorkOrder();
          disposeTools();
          // Detach this runtime from the apply-time service so getStatus/control
          // no longer act on a disposed worker.
          if (currentRuntime === runtime) currentRuntime = null;
          try {
            await runtime.dispose();
          } finally {
            if (runtimes.get(agent) === cleanup) runtimes.delete(agent);
          }
        };
      }, "continuous-worker.runtime()");

      runtimes.set(agent, cleanup);
      } catch (error) {
        // 插件自身异常绝不允许阻断宿主 agent 创建/恢复流程（曾导致点历史会话
        // 时主区闪退回新会话）。记录后放行，worker 运行时对该 agent 不生效。
        ctx.logger?.error?.(`cw: agent/created handler failed: ${String(error?.stack ?? error)}`);
        console.error("[dsh-continuous-worker] agent/created handler failed:", error);
        // 修复: 一个 agent 创建失败不应清掉整个工作台的 currentRuntime —
        // 保留最后成功创建的 runtime (davies 等), 仅 stopping 清理时置空 (L1434).
      }
    };

    // agent/created 事件触发挂载
    const stopCreated = ctx.on("agent/created", ({ agent }) => {
      mountRuntime(agent);
    });
    // 立即补挂已有 root agents — 热重载/重启后无需发消息激活 (用户反馈: 其他客户端 AI 员工不需要繁琐步骤)
    // 只挂最新的 root agent (注册顺序最后 = 用户当前会话); 历史会话 agent 不挂 (打开时 created 才挂载)
    try {
      const roots = ctx.agents.roots();
      if (roots.length > 0) mountRuntime(roots[roots.length - 1]);
    } catch { /* 补挂失败不阻塞 */ }

    return async () => {
      stopping = true;
      stopCreated();
      disposeRoutes();
      const cleanups = [...runtimes.values()];
      runtimes.clear();
      // M2 P1: 清理员工 agent handles (apply 作用域 map, 防泄漏)
      const empHandles = [...employeeAgents.values()];
      employeeAgents.clear();
      await Promise.allSettled(cleanups.map((cleanup) => Promise.resolve(cleanup())));
      await Promise.allSettled(empHandles.map((h) => Promise.resolve(h?.dispose?.())));
    };
  }, "continuous-worker.lifecycle()");
}

/**
 * H1 返修 (v5 复审): 从 session 事件日志提取最近 N 条 user/assistant 消息。
 * 纯函数 — 平台 SessionEvent 形状 { type, seq, time, data }:
 *   user/message       -> ev.data.content (UserMessage)
 *   assistant/message  -> ev.data.message.content (AssistantMessage)
 * 导出供单元测试 (复审要求补真实形状单测)。
 * @param {Array} events - session.events
 * @param {number} limit - 最多返回条数
 * @returns {Array<{role:'user'|'ai', text:string, at:string}>}
 */
export function extractRecentMessages(events, limit = 20) {
  const extractText = (content) => {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((c) => (typeof c === "string" ? c : c?.text ?? c?.content ?? ""))
        .filter(Boolean)
        .join(" ");
    }
    if (content?.text !== undefined) return String(content.text);
    if (content?.content !== undefined) return extractText(content.content);
    return "";
  };
  try {
    const out = [];
    for (let i = (events?.length ?? 0) - 1; i >= 0 && out.length < limit; i--) {
      const ev = events[i];
      const type = ev?.type;
      const data = ev?.data;
      if (type === "user/message") {
        const text = extractText(data?.content).slice(0, 400);
        if (text.length > 0) out.push({ role: "user", text, at: new Date(ev.time).toISOString() });
      } else if (type === "assistant/message") {
        const text = extractText(data?.message?.content).slice(0, 800);
        if (text.length > 0) out.push({ role: "ai", text, at: new Date(ev.time).toISOString() });
      }
    }
    return out.reverse();
  } catch {
    return [];
  }
}

export const internals = {
  WorkerRuntime,
  foldWorkerEvents,
  deliver,
  csrfFence,
  extractRecentMessages,
};
