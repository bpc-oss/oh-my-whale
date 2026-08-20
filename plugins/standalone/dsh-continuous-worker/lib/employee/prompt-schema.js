// dsh-continuous-worker — employee prompt schema (M1: Prompt 即灵魂).
//
// 三方设计定稿 (worker-team-design.md):
//   员工 = Prompt(灵魂) + 记忆(经历) + 进化(成长)
//   Prompt 三段式: soul (给 LLM/UI) + limits (给引擎, 员工不能自我授权) + team (协作) + meta (审计)
// 本模块: schema 定义 + 默认值 + 校验 + 生成默认灵魂档案.

export const PROMPT_SCHEMA_VERSION = 1;

/** 空灵魂模板 (用户任务 → 填充生成). */
export function emptySoul() {
  return {
    identity: { name: "", role: "", emoji: "", visual: { hair: "brown", outfit: "shirt" } },
    description: "",       // 路由依据, ≤80 字
    mission: "",           // 使命
    skills: [],            // [{name, tools[], keywords[]}]
    persona: { tone: "严谨", style: [], quirks: "" },
    workflow: { planFirst: true, reportFrequency: "daily", escalation: "error-first", maxAutonomy: "handle-routine-escalate-risk" },
    values: [],            // ["安全 > 效率", ...]
    rules: [],             // 软红线 (注入提示词)
  };
}

/** 默认 limits (引擎强制, 永不接受模型填写). */
export function defaultLimits() {
  return {
    budget: { dailyTokens: 200000, dailyRuns: 50, maxCostPerDay: 1.0 },
    permissions: { dangerTools: "ask", network: "ask", toolAllowlist: ["read", "grep", "shell", "write"] },
    redLines: ["never-write-outside-workspace", "no-secret-leak", "no-unbounded-retry"],
  };
}

/** 默认 team (协作位置). */
export function defaultTeam() {
  return { role: "solo", mode: "solo", upstream: null, downstream: [], peers: [] };
}

/** 完整 prompt 对象 (三段式 + meta). */
export function createPromptJson({ soul = null, limits = null, team = null, meta = {} } = {}) {
  return {
    schemaVersion: PROMPT_SCHEMA_VERSION,
    soul: soul ?? emptySoul(),
    limits: limits ?? defaultLimits(),
    team: team ?? defaultTeam(),
    meta: {
      modelHint: "fast",
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: "manual",            // manual | llm-generated | evolution
      generation: null,            // { fromTask, model }
      ...meta,
    },
  };
}

/** 校验 prompt 对象; 返回 { ok, errors[] }. */
export function validatePrompt(p) {
  const errors = [];
  if (!p || typeof p !== "object") return { ok: false, errors: ["prompt must be object"] };
  if (p.schemaVersion !== PROMPT_SCHEMA_VERSION) errors.push(`schemaVersion mismatch: ${p.schemaVersion}`);
  if (!p.soul || typeof p.soul !== "object") return { ok: false, errors: ["soul required"] };
  const s = p.soul;
  if (!s.identity?.name) errors.push("soul.identity.name required");
  if (!s.description || s.description.trim().length === 0) errors.push("soul.description required");
  if (s.description.length > 80) errors.push(`description too long: ${s.description.length}>80`);
  if (!Array.isArray(s.values) || s.values.length === 0) errors.push("soul.values must be non-empty array");
  if (!Array.isArray(s.rules)) errors.push("soul.rules must be array");
  if (!p.limits || typeof p.limits !== "object") errors.push("limits required");
  if (!Array.isArray(p.limits?.permissions?.toolAllowlist)) errors.push("limits.permissions.toolAllowlist must be array");
  if (!Array.isArray(p.limits?.redLines)) errors.push("limits.redLines must be array");
  // 敏感/自我授权扫描 (校验门第 3 道): 归一化 (小写+去空格+去零宽+去标点) 后匹配, 防大小写/空格/零宽/变体绕过
  const norm = (t) => String(t).toLowerCase()
    .replace(/[\u200B-\u200F\u2060-\u206F\u180E\uFEFF]/g, "") // 零宽/格式字符
    .replace(/[\s\-_.,，。;；:：'"“”‘’`!！?？()（）\[\]{}]/g, "");
  // 扫描所有可渲染进 systemPrompt 的字段: soul + team (limits 已被 mergeLimits 强制, 一并扫保险)
  const joinedNorm = norm(JSON.stringify({ soul: p.soul, team: p.team }));
  const selfAuth = [
    "可以访问任何系统", "访问所有系统", "完全自主", "无需批准", "不受限制", "无限制访问",
    "bypassapproval", "fullaccess", "unrestricted", "noapproval", "allpowers", "overridepermissions",
    "无视权限", "绕过审批", "任意访问", "一切权限", "最大权限", "不受约束", "任意执行", "超级权限",
  ];
  for (const pat of selfAuth) {
    if (joinedNorm.includes(norm(pat))) errors.push(`self-authorization pattern detected: "${pat}"`);
  }
  return { ok: errors.length === 0, errors };
}

export const internals = { emptySoul, defaultLimits, defaultTeam, createPromptJson, validatePrompt };
