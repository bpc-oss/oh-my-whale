// dsh-continuous-worker — Web client entry (左侧主侧边栏独立入口 + AI 工作台).
//
// 形态 (用户拍板 v3): 独立出现在 DSH 原生左侧主侧边栏底部 (sidebar.footer.
// action slot), 点击打开 **AI 工作台** 面板 (区别于对话窗口):
//   - 不叫"打工人" (v3 改名);
//   - 面板不是全屏覆盖整个窗口 (避免与桌面版关闭按钮重合) — 覆盖内容区,
//     顶部留出标题栏, 左上角有 **左箭头返回** 按钮 (v3 修复)。
// 设置页保留中文 section 作为第二入口。
//
// 数据通道: 经 /continuous-worker HTTP 端点消费 host 状态/控制 (webServer 路由).
//
// Build: esbuild src/client.jsx -> dist/client.js wrapped in
// window.__ModuleLoader__.load({ id: "dsh-continuous-worker", factory }).

import React, { useState } from "react";
import WorkerDashboard, { WorkerSettingsPanel } from "./Dashboard.jsx";

/** Runtime services this client needs (Cordis inject) — 仅平台/浏览器端服务. */
export const inject = ["slots"];

/** 与 host 端 /continuous-worker 路由对应的 service 面. */
function createWorkerHttpService() {
  const request = async (path, init) => {
    const res = await fetch(path, {
      headers: { accept: "application/json", ...(init?.body !== undefined ? { "content-type": "application/json" } : {}) },
      ...init,
    });
    const payload = await res.json().catch(() => ({ ok: false, error: `http ${res.status}` }));
    if (!res.ok && res.status !== 200 && res.status !== 409) {
      throw new Error(payload?.error ?? `http ${res.status}`);
    }
    return payload;
  };
  return {
    getStatus: async (workerId) => {
      const q = workerId ? `?worker=${encodeURIComponent(workerId)}` : "";
      const payload = await request(`/continuous-worker/status${q}`);
      return payload.status ?? null;
    },
    getWorkers: async () => {
      const payload = await request("/continuous-worker/workers");
      return payload.workers ?? [];
    },
    subscribe: () => () => {}, // MVP: 无 push, 面板 5s 轮询
    control: async (action, id, extra = {}, workerId) => {
      const q = workerId ? `?worker=${encodeURIComponent(workerId)}` : "";
      const payload = await request(`/continuous-worker/control${q}`, {
        method: "POST",
        body: JSON.stringify({ action, id, extra }),
      });
      return payload;
    },
    // UI v4: 用户↔AGI 交流 — 工作台指令投递给 agent.
    instruct: async (text, workerId) => {
      const q = workerId ? `?worker=${encodeURIComponent(workerId)}` : "";
      const payload = await request(`/continuous-worker/instruct${q}`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      return payload;
    },
    // UI v5: 模型选择器 — 列可用模型 + 切换.
    getModels: async () => {
      const payload = await request("/continuous-worker/models");
      return payload.models ?? { available: [], current: null };
    },
    setModel: async (provider, model) => {
      const payload = await request("/continuous-worker/model", {
        method: "POST",
        body: JSON.stringify({ provider, model }),
      });
      return payload;
    },
    // v8 多员工: 员工 CRUD + 工作区 + 独立对话 (插件自管, 不走 DSH 会话).
    getEmployees: async () => {
      const payload = await request("/continuous-worker/employees");
      return payload.employees ?? [];
    },
    createEmployee: async (name, cwd, prompt) => {
      const payload = await request("/continuous-worker/employees", {
        method: "POST",
        body: JSON.stringify({ name, cwd, prompt: prompt ?? undefined }),
      });
      return payload;
    },
    instructEmployee: async (id, text) => {
      const payload = await request("/continuous-worker/employees/instruct", {
        method: "POST",
        body: JSON.stringify({ id, text }),
      });
      return payload;
    },
    employeeChat: async (id) => {
      const payload = await request(`/continuous-worker/employees/${encodeURIComponent(id)}/chat`);
      return payload.chat ?? [];
    },
    setEmployeeWorkspace: async (id, cwd) => {
      const payload = await request(`/continuous-worker/employees/${encodeURIComponent(id)}/workspace`, {
        method: "POST",
        body: JSON.stringify({ cwd }),
      });
      return payload;
    },
    // v9: 弹系统目录选择框 (复用平台 directoryPicker), 返回 { ok, path }.
    pickDirectory: async () => {
      const payload = await request("/continuous-worker/pick-directory");
      return payload;
    },
    // M4: 员工成长轨迹 + 反馈 (习惯)
    employeeGrowth: async (id) => {
      const payload = await request(`/continuous-worker/employees/${encodeURIComponent(id)}/growth`);
      return payload.growth ?? null;
    },
    employeeFeedback: async (id, name, value) => {
      const payload = await request(`/continuous-worker/employees/${encodeURIComponent(id)}/feedback`, {
        method: "POST",
        body: JSON.stringify({ name, value }),
      });
      return payload;
    },
    // M5: 员工思维留痕
    employeeThinking: async (id, taskId) => {
      const q = taskId ? `?taskId=${encodeURIComponent(taskId)}` : "";
      const payload = await request(`/continuous-worker/employees/${encodeURIComponent(id)}/thinking${q}`);
      return payload;
    },
    // 员工自身状态 (隔离于 root: 实体+成长+思维+队列+ledger)
    employeeStatus: async (id) => {
      const payload = await request(`/continuous-worker/employees/${encodeURIComponent(id)}/status`);
      return payload;
    },
    // DSH 已有工作区 (创建员工下拉选择)
    listWorkspaces: async () => {
      const payload = await request("/continuous-worker/workspaces");
      return payload.workspaces ?? [];
    },
    // 真 AI 生成员工灵魂 (任务 → LLM 产出完整灵魂)
    generateSoul: async (task) => {
      const payload = await request("/continuous-worker/employees/generate-soul", {
        method: "POST",
        body: JSON.stringify({ task }),
      });
      return payload;
    },
  };
}

/** 机器人图标 (侧边栏底部动作 + 工作台头部). */
function BotIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M12 4v4M9 13h.01M15 13h.01" />
      <circle cx="9" cy="13" r="0.5" fill="currentColor" />
      <circle cx="15" cy="13" r="0.5" fill="currentColor" />
      <path d="M9 16h6" />
    </svg>
  );
}

/** 左箭头返回图标. */
function BackIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

/**
 * 左侧主侧边栏底部入口 (sidebar.footer.action): "AI 工作台" 按钮, 点击
 * 打开工作台面板 (覆盖内容区, 顶部留标题栏, 左上角左箭头返回)。
 */
function WorkerSidebarAction({ wide }) {
  const [open, setOpen] = useState(false);
  const service = createWorkerHttpService();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="AI 工作台 — 查看与指挥你的持续运行 AI 员工"
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "8px 10px", background: "transparent", border: "none",
          borderRadius: 8, cursor: "pointer", color: "inherit",
          fontSize: 13, textAlign: "left",
        }}
      >
        <BotIcon size={wide ? 16 : 18} />
        {wide && <span>AI 工作台</span>}
      </button>
    );
  }

  return (
    <div
      style={{
        // 覆盖内容区而非整个窗口: 顶部留 ~44px 给窗口标题栏 (避免与桌面版
        // 关闭按钮重合), 不覆盖左侧栏 (left: 0 起, 侧边栏在其上层)。
        position: "fixed",
        top: 44,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9998,
        background: "#f7f7f8", // 固定不透明 (var(--dsh-bg) 可能透明导致 DSH 主界面透出)
        display: "flex",
        flexDirection: "column",
        boxShadow: "-8px 0 24px rgba(0,0,0,.12)",
        borderTop: "1px solid rgba(127,127,127,.15)",
      }}
    >
      {/* 头部: 左箭头返回 + 标题 */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 12px", borderBottom: "1px solid rgba(127,127,127,.18)",
          background: "rgba(127,127,127,.04)",
        }}
      >
        <button
          onClick={() => setOpen(false)}
          title="返回主界面"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "6px 10px", border: "none", background: "transparent",
            borderRadius: 8, cursor: "pointer", color: "inherit",
            fontSize: 13,
          }}
        >
          <BackIcon size={16} />
          <span>返回</span>
        </button>
        <span style={{ width: 1, height: 18, background: "rgba(127,127,127,.2)", margin: "0 6px" }} />
        <BotIcon size={16} />
        <strong style={{ fontSize: 14 }}>AI 工作台</strong>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "rgba(127,127,127,.55)" }}>
          持续运行的 AI 员工 — 任务 / 预算 / 健康 / 责任
        </span>
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <WorkbenchBoundary>
          <WorkerDashboard service={service} />
        </WorkbenchBoundary>
      </div>
    </div>
  );
}

/** ErrorBoundary: 工作台渲染错误不崩整个 client (显示错误信息便于修复). */
class WorkbenchBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error("[dsh-continuous-worker] workbench render failed:", error, info?.componentStack ?? "");
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontSize: 13, lineHeight: 1.7, color: "#b91c1c" }}>
          <strong>工作台渲染失败：</strong>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{String(this.state.error?.message ?? this.state.error)}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 12, padding: "6px 14px", border: "1px solid #999", background: "#fff", cursor: "pointer" }}>重试</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Client plugin entry:
 *  1) 左侧主侧边栏底部独立入口 (sidebar.footer.action);
 *  2) 设置页中文 section (第二入口)。
 * @param {object} ctx - client-side Cordis context.
 */
export function apply(ctx) {
  const service = createWorkerHttpService();

  // ---- 左侧主侧边栏底部: "AI 工作台" 入口 ----
  ctx.slots.inject("sidebar.footer.action", () =>
    ctx.slots.register(
      {
        name: "sidebar.footer.action",
        id: "continuous-worker",
        priority: 0,
      },
      WorkerSidebarAction
    )
  );

  // ---- 设置页 section (中文, 第二入口) ----
  // ---- 设置页 section (纯设置, 用户反馈: 不与左侧栏工作台重复) ----
  ctx.slots.inject("settings.section", () =>
    ctx.slots.register(
      {
        name: "settings.section",
        id: "continuous-worker",
        order: 200,
        label: () => "AI 员工",
        inject: () => ({ service }),
      },
      WorkerSettingsPanel
    )
  );
}
