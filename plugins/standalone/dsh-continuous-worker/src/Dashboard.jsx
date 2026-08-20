// dsh-continuous-worker — AI 员工工作台 v12 (高级面板, 全面重做).
//
// 用户决策: 放弃像素场景 (v11 太丑), 全面重做为高级面板。
// hy3 总设计师规格 (ui-design-v12.md): 三栏 (NAV 员工列表 / MAIN 7-Tab 员工面板 /
// ACTION 对话+操作)、双主题 (暗/浅)、员工头部卡、7 个信息 Tab、成长曲线、创建向导。

import React, { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import { Bot, Send, Plus, FolderOpen, MessageSquare, Trash2, Sun, Moon, Pause, Play, Zap } from "lucide-react";
import { buildS, lightTheme, darkTheme, baseCss } from "./theme.js";

/* ---- 双主题 Context ---- */
const ThemeContext = createContext({ T: lightTheme, S: null, isDark: false });
const useTheme = () => useContext(ThemeContext);

/* ---- 状态色语义: active=ok busy=warn rest=info offline=danger ---- */
const STATUS_META = {
  active: { label: "在岗", color: "ok" },
  busy: { label: "忙碌", color: "warn" },
  rest: { label: "休息", color: "info" },
  offline: { label: "离线", color: "danger" },
};

/* ---- 7 Tab 定义 ---- */
const TABS = [
  { key: "experience", label: "📅 经历" },
  { key: "skills", label: "🧰 技能" },
  { key: "habits", label: "🕐 习惯" },
  { key: "thinking", label: "🧠 思维" },
  { key: "chat", label: "💬 通讯" },
  { key: "status", label: "📊 状态" },
  { key: "growth", label: "🌱 成长" },
];

/** 空态引导. */
function Empty({ icon, text, hint }) {
  const { T } = useTheme();
  return (
    <div style={{ textAlign: "center", padding: "48px 20px", color: T.textFaint, fontSize: 13, lineHeight: 1.8 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <div>{text}</div>
      {hint && <div style={{ fontSize: 12, color: T.textFaint, opacity: .8 }}>{hint}</div>}
    </div>
  );
}

/* ---- 员工头部卡 ---- */
function EmployeeHeader({ emp, growth, status, onChat, onDispatch, onDelete }) {
  const { T } = useTheme();
  const st = STATUS_META[emp.status] ?? STATUS_META.active;
  const rate = growth?.successRate ?? 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, background: T.panel, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "16px 18px", flexShrink: 0 }}>
      <div style={{ width: 64, height: 64, borderRadius: 12, background: T.surface, border: `1px solid ${T.borderStrong}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, flexShrink: 0 }}>
        {emp.role === "运维工程师" || emp.role?.includes("运维") ? "🛡️" : emp.role?.includes("程序") ? "💻" : emp.role?.includes("科学") ? "🔬" : emp.role?.includes("设计") ? "🎨" : "🤖"}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: T.text }}>{emp.name}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, fontSize: 12, background: T[st.color] + "22", color: T[st.color], fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: T[st.color] }} />
            {st.label}
          </span>
        </div>
        <div style={{ fontSize: 13, color: T.textMuted, marginTop: 4 }}>{emp.role ?? "AI 员工"}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: T.textMuted }}>Lv.1</span>
          <div style={{ width: 140, height: 6, borderRadius: 999, background: T.surface, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, Math.max(4, rate))}%`, height: 6, background: `linear-gradient(90deg, ${T.accent}, ${T.accent2})` }} />
          </div>
          <span style={{ fontSize: 11, color: T.textMuted }}>成功率 {rate}%</span>
          {emp.cwd && <span style={chipStyle(T)}><FolderOpen size={10} /> {emp.cwd}</span>}
        </div>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 }}>
        <button onClick={onChat} style={accBtn(T)}><MessageSquare size={13} /> 对话</button>
        <button onClick={onDispatch} style={ghostBtn(T)}><Zap size={13} /> 派发</button>
        <button onClick={onDelete} style={{ ...ghostBtn(T), color: T.danger }}><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

/* ---- 7 Tab 内容组件 ---- */
function ExperienceTab({ chat }) {
  const { T } = useTheme();
  if (!chat || chat.length === 0) return <Empty icon="📅" text="该员工暂无「经历」数据" hint="发送对话或派发任务即可生成 →" />;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {chat.map((m, i) => (
        <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", borderLeft: `1px solid ${T.border}`, marginLeft: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: m.role === "user" ? T.accent : T.ok, marginLeft: -5.5, flexShrink: 0, marginTop: 4 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: T.textFaint }}>{new Date(m.at ?? Date.now()).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {m.role === "user" ? "用户" : "员工"}</div>
            <div style={{ fontSize: 13, color: T.text, marginTop: 2, whiteSpace: "pre-wrap" }}>{m.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SkillsTab({ growth }) {
  const { T } = useTheme();
  const count = growth?.skillsCount ?? 0;
  if (count === 0) return <Empty icon="🧰" text="该员工暂无「技能」数据" hint="重复完成同类任务 3 次后自动固化技能 →" />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
      {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
        <div key={i} style={{ padding: 12, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>技能 #{i + 1}</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>关键词 · 自动固化</div>
          <div style={{ height: 5, borderRadius: 999, background: T.panel, marginTop: 8, overflow: "hidden" }}>
            <div style={{ width: `${Math.max(20, 100 - i * 10)}%`, height: 5, background: T.accent }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function HabitsTab() {
  return <Empty icon="🕐" text="该员工暂无「习惯」数据" hint="重复行为会被记录为习惯（如每日复盘）→" />;
}

function ThinkingTab({ thinking, onTask }) {
  const { T } = useTheme();
  const [sel, setSel] = useState(null);
  const tasks = thinking?.tasks ?? [];
  if (tasks.length === 0) return <Empty icon="🧠" text="该员工暂无「思维」数据" hint="员工执行任务时会留痕（规划/决策/反思）→" />;
  const t = sel ?? tasks[0];
  return (
    <div>
      <select value={t.taskId} onChange={(e) => setSel(tasks.find((x) => x.taskId === e.target.value))} style={{ ...S.input, marginBottom: 12 }}>
        {tasks.map((x) => <option key={x.taskId} value={x.taskId}>{x.taskId} · {x.entries} 条</option>)}
      </select>
      <ThinkingChain taskId={t.taskId} onLoad={onTask} />
    </div>
  );
}

function ThinkingChain({ taskId, onLoad }) {
  const { T } = useTheme();
  const [entries, setEntries] = useState(null);
  useEffect(() => {
    if (!onLoad || !taskId) return;
    let cancelled = false;
    onLoad(taskId).then((p) => { if (!cancelled) setEntries(p?.entries ?? []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [taskId, onLoad]);
  if (!entries) return <div style={{ color: T.textFaint, fontSize: 12, padding: 12 }}>加载思维链…</div>;
  if (entries.length === 0) return <Empty icon="🧠" text="无思维记录" />;
  const kindColor = { plan: T.info, decision: T.accent2, tool: T.accent, reflect: T.ok, step: T.textMuted };
  const kindLabel = { plan: "规划", decision: "决策", tool: "工具", reflect: "反思", step: "步骤" };
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {entries.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0", borderLeft: `1px solid ${T.border}`, marginLeft: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: kindColor[e.kind] ?? T.textMuted, marginLeft: -5.5, flexShrink: 0, marginTop: 4 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: kindColor[e.kind] ?? T.textMuted, border: `1px solid ${(kindColor[e.kind] ?? T.textMuted)}44`, padding: "0 6px", borderRadius: 4 }}>{kindLabel[e.kind] ?? e.kind}</span>
              <span style={{ fontSize: 10, color: T.textFaint }}>{new Date(e.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            </div>
            <div style={{ fontSize: 12, color: T.text, marginTop: 2, whiteSpace: "pre-wrap" }}>{e.content}</div>
            {e.meta?.name && <div style={{ fontSize: 10, color: T.textFaint, marginTop: 2 }}>🔧 {e.meta.name}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatLogTab({ chat }) {
  const { T } = useTheme();
  if (!chat || chat.length === 0) return <Empty icon="💬" text="暂无通讯记录" hint="在右侧对话区给员工下指令 →" />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {chat.map((m, i) => (
        <div key={i} style={{ display: "flex", gap: 8, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
          <div style={{ maxWidth: "78%", padding: "10px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", background: m.role === "user" ? T.accentDim : T.surface, border: `1px solid ${T.border}`, color: T.text }}>{m.text}</div>
        </div>
      ))}
    </div>
  );
}

function StatusTab({ st }) {
  const { T } = useTheme();
  const metrics = [
    { label: "任务数", value: st?.growth?.taskCount ?? 0 },
    { label: "成功率", value: `${st?.growth?.successRate ?? 0}%` },
    { label: "技能", value: st?.growth?.skillsCount ?? 0 },
    { label: "经验", value: st?.growth?.experienceCount ?? 0 },
    { label: "在岗", value: `${st?.growth?.activeDays ?? 0} 天` },
    { label: "排队任务", value: st?.queue?.pending ?? 0, warn: (st?.queue?.pending ?? 0) > 0 },
    { label: "今日 Token", value: `${st?.ledger?.tokensUsed ?? 0}/${st?.ledger?.dailyTokensLimit ?? 0}` },
    { label: "Agent", value: st?.agentAlive ? "存活" : "离线", danger: !st?.agentAlive },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
      {metrics.map((m) => (
        <div key={m.label} style={{ padding: 14, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.danger ? T.danger : m.warn ? T.warn : T.ok }} />
            <span style={{ fontSize: 11, color: T.textFaint }}>{m.label}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginTop: 6 }}>{m.value}</div>
        </div>
      ))}
    </div>
  );
}

function GrowthTab({ growth }) {
  const { T } = useTheme();
  if (!growth || (growth.taskCount ?? 0) === 0) return <Empty icon="🌱" text="该员工暂无「成长」数据" hint="完成任务后记录成长轨迹 →" />;
  const stats = [
    { label: "任务", value: growth.taskCount ?? 0 },
    { label: "成功率", value: `${growth.successRate ?? 0}%`, color: (growth.successRate ?? 0) >= 80 ? T.ok : (growth.successRate ?? 0) >= 50 ? T.warn : T.danger },
    { label: "技能", value: growth.skillsCount ?? 0 },
    { label: "经验", value: growth.experienceCount ?? 0 },
    { label: "在岗", value: `${growth.activeDays ?? 0} 天` },
  ];
  const traj = growth.trajectory ?? [];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12, marginBottom: 16 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ padding: 14, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color ?? T.text }}>{s.value}</div>
            <div style={{ fontSize: 11, color: T.textFaint, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
      {traj.length >= 2 ? (
        <div style={{ padding: 14, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 10 }}>成功率趋势</div>
          <svg viewBox="0 0 640 200" width="100%" height={200}>
            {[0, 1, 2, 3, 4].map((i) => (
              <line key={i} x1={40} y1={40 + i * 36} x2={630} y2={40 + i * 36} stroke={T.border} strokeWidth={1} />
            ))}
            {traj.slice(-24).map((p, i) => {
              const x = 40 + (i / Math.max(1, Math.min(24, traj.length) - 1)) * 590;
              const y = 180 - (p.successRate ?? 0) / 100 * 140;
              return <circle key={i} cx={x} cy={y} r={3.5} fill={T.panel} stroke={T.accent} strokeWidth={2}><title>{`${(p.at ?? "").slice(0, 10)} · ${p.successRate}%`}</title></circle>;
            })}
          </svg>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: T.textFaint, padding: 8 }}>完成更多任务后显示趋势曲线</div>
      )}
    </div>
  );
}

/* ---- 右操作区: 对话 + 快捷操作 ---- */
function ChatPanel({ emp, chat, input, setInput, busy, send }) {
  const { T, S } = useTheme();
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat]);
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: T.panel, border: `1px solid ${T.border}`, borderRadius: T.radius }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 600, color: T.text, display: "flex", alignItems: "center", gap: 8 }}>
        <MessageSquare size={14} color={T.accent} /> 与 {emp.name} 对话
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {chat.length === 0 ? (
          <div style={{ fontSize: 12, color: T.textFaint, textAlign: "center", paddingTop: 40, lineHeight: 1.8 }}>
            给 {emp.name} 下指令：<br />「检查工作区磁盘」<br />「每天 9 点汇报」
          </div>
        ) : chat.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 8, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "85%", padding: "9px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", background: m.role === "user" ? T.accentDim : T.surface, border: `1px solid ${T.border}`, color: T.text }}>{m.text}</div>
          </div>
        ))}
        {busy && <div style={{ fontSize: 11, color: T.textFaint }}>投递中…</div>}
        <div ref={endRef} />
      </div>
      <div style={{ padding: 10, borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder={`指令…`} style={{ ...S.input, flex: 1 }} />
        <button onClick={send} disabled={busy || !input.trim()} style={{ ...S.btnAccent, padding: "0 14px", opacity: busy || !input.trim() ? .5 : 1, cursor: busy || !input.trim() ? "not-allowed" : "pointer" }}><Send size={14} /></button>
      </div>
    </div>
  );
}

function QuickActions({ emp, onPickWorkspace, onDispatch, onDelete }) {
  const { T, S } = useTheme();
  return (
    <div style={{ padding: 12, background: T.panel, border: `1px solid ${T.border}`, borderRadius: T.radius }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 10 }}>快捷操作</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button onClick={onPickWorkspace} style={S.btn}><FolderOpen size={14} /> {emp.cwd ? "更换工作区" : "选择工作区"}</button>
        <button onClick={onDispatch} style={S.btn}><Zap size={14} /> 派发一次任务</button>
        <button onClick={onDelete} style={{ ...S.btn, color: T.danger, borderColor: T.danger + "55" }}><Trash2 size={14} /> 删除员工</button>
      </div>
    </div>
  );
}

/* ---- 主组件 ---- */
export default function WorkerDashboard({ service }) {
  const [isDark, setIsDark] = useState(false);
  const T = isDark ? darkTheme : lightTheme;
  const S = buildS(T);
  const [tab, setTab] = useState("status");
  const [employees, setEmployees] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [chat, setChat] = useState([]);
  const [growth, setGrowth] = useState(null);
  const [empStatus, setEmpStatus] = useState(null);
  const [thinking, setThinking] = useState(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [creating, setCreating] = useState(false);

  const active = employees.find((e) => e.id === activeId) ?? null;

  const refresh = useCallback(async () => {
    try { const list = await service?.getEmployees?.(); setEmployees(list ?? []); if (!list.some((e) => e.id === activeId) && list.length > 0) setActiveId(list[0].id); } catch {}
  }, [activeId, service]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (toast === null) return; const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t); }, [toast]);

  // 选中员工 → 拉数据 (chat/growth/status/thinking)
  useEffect(() => {
    if (!activeId || !service) { setChat([]); setGrowth(null); setEmpStatus(null); setThinking(null); return; }
    let cancelled = false;
    const load = async () => {
      const [c, s, t] = await Promise.all([
        service.employeeChat?.(activeId).catch(() => []),
        service.employeeStatus?.(activeId).catch(() => null),
        service.employeeThinking?.(activeId).catch(() => null),
      ]);
      if (cancelled) return;
      setChat(Array.isArray(c) ? c : []);
      const g = s?.growth ?? null;
      setEmpStatus(s);
      setGrowth(g);
      setThinking(t);
    };
    load();
    const timer = setInterval(load, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeId, service]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !activeId || busy) return;
    setInput(""); setBusy(true);
    setChat((m) => [...m, { role: "user", text, at: new Date().toISOString() }]);
    try {
      const r = await service?.instructEmployee?.(activeId, text);
      setChat((m) => [...m, { role: "ai", text: r?.ok ? `已接收指令${r.mode === "delivered" ? "，正在执行…" : "，已排队。"}` : `未能投递：${r?.reason ?? "未知"}` , at: new Date().toISOString() }]);
    } catch (e) { setChat((m) => [...m, { role: "ai", text: `连接失败：${String(e)}`, at: new Date().toISOString() }]); }
    finally { setBusy(false); refresh(); }
  }, [input, activeId, busy, service, refresh]);

  const pickWorkspace = useCallback(async () => {
    if (!activeId) return;
    try {
      const r = await service?.pickDirectory?.();
      if (r?.ok && r.path) {
        const set = await service?.setEmployeeWorkspace?.(activeId, r.path);
        setToast(set?.ok ? `工作区已设置：${r.path}` : set?.reason ?? "设置失败");
      } else if (!r?.cancelled) { setToast(r?.reason ?? "无法弹出目录选择框"); }
    } catch (e) { setToast(String(e)); }
    refresh();
  }, [activeId, service, refresh]);

  const removeEmployee = useCallback(async () => {
    if (!activeId || !window.confirm("确认删除该员工？其数据将清除。")) return;
    try { const r = await service?.control?.("remove_employee", activeId); setToast(r?.ok ? "已删除" : r?.reason ?? "删除失败"); } catch (e) { setToast(String(e)); }
    setActiveId(null); refresh();
  }, [activeId, service, refresh]);

  return (
    <ThemeContext.Provider value={{ T, S, isDark }}>
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "220px 1fr 320px", background: T.bg, color: T.text, fontFamily: T.fontBody, fontSize: 13 }}>
      <style>{baseCss}</style>
      {toast && <div style={{ position: "fixed", top: 16, right: 16, zIndex: 100, background: T.panel, border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: "8px 14px", fontSize: 12.5, boxShadow: "0 8px 24px rgba(0,0,0,.2)" }}>{toast}</div>}

      {/* NAV: 员工列表 */}
      <div style={{ borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", minHeight: 0, background: T.panel }}>
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${T.border}` }}>
          <Bot size={18} color={T.accent} />
          <strong style={{ fontSize: 15 }}>AI 员工</strong>
          <button onClick={() => setIsDark(!isDark)} title="切换主题" style={{ marginLeft: "auto", border: "none", background: "transparent", color: T.textMuted, cursor: "pointer", padding: 4 }}>{isDark ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
        <div style={{ padding: "10px 12px" }}>
          <button onClick={() => setCreating(!creating)} style={{ ...S.btnAccent, width: "100%", justifyContent: "center" }}><Plus size={14} /> {creating ? "收起" : "创建员工"}</button>
        </div>
        {creating && <CreateForm service={service} onDone={() => { setCreating(false); refresh(); }} setToast={setToast} T={T} S={S} />}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
          {employees.length === 0 && <div style={{ padding: 20, fontSize: 12, color: T.textFaint, textAlign: "center" }}>还没有员工<br />点上方创建</div>}
          {employees.map((e) => {
            const st = STATUS_META[e.status] ?? STATUS_META.active;
            return (
              <button key={e.id} onClick={() => setActiveId(e.id)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", marginBottom: 4, border: `1px solid ${e.id === activeId ? T.accent : "transparent"}`, background: e.id === activeId ? T.accentDim : "transparent", borderRadius: 10, cursor: "pointer", textAlign: "left", color: T.text, fontFamily: T.fontBody }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{e.role?.includes("运维") ? "🛡️" : e.role?.includes("程序") ? "💻" : e.role?.includes("科学") ? "🔬" : e.role?.includes("设计") ? "🎨" : "🤖"}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: T[st.color], flexShrink: 0 }} />
                  </div>
                  <div style={{ fontSize: 10.5, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.role ?? "AI 员工"} · {e.taskCount ?? 0} 任务</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN: 头部卡 + 7 Tab */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, padding: "18px 22px", gap: 14, overflowY: "auto" }}>
        {active ? (
          <>
            <EmployeeHeader emp={active} growth={growth} status={empStatus} onChat={() => setTab("chat")} onDispatch={() => service?.control?.("run_once", null, {}, null).then(() => setToast("已派发")).catch(() => {})} onDelete={removeEmployee} />
            {/* Tab 栏 */}
            <div style={{ display: "flex", gap: 2, borderBottom: `1px solid ${T.border}`, flexWrap: "wrap" }}>
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "9px 13px", fontSize: 13, border: "none", background: "transparent", color: tab === t.key ? T.accent : T.textMuted, borderBottom: `2px solid ${tab === t.key ? T.accent : "transparent"}`, cursor: "pointer", fontWeight: tab === t.key ? 600 : 400, fontFamily: T.fontBody }}>{t.label}</button>
              ))}
            </div>
            {/* Tab 内容 */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 2px" }}>
              {tab === "experience" && <ExperienceTab chat={chat} />}
              {tab === "skills" && <SkillsTab growth={growth} />}
              {tab === "habits" && <HabitsTab />}
              {tab === "thinking" && <ThinkingTab thinking={thinking} onTask={(taskId) => service?.employeeThinking?.(activeId, taskId)} />}
              {tab === "chat" && <ChatLogTab chat={chat} />}
              {tab === "status" && <StatusTab st={empStatus} />}
              {tab === "growth" && <GrowthTab growth={growth} />}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: T.textMuted }}>
            <Bot size={40} color={T.textFaint} />
            <div style={{ fontSize: 15 }}>左侧选择或创建一个员工</div>
          </div>
        )}
      </div>

      {/* ACTION: 对话 + 快捷操作 */}
      {active ? (
        <div style={{ borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 12, padding: 14, minHeight: 0, background: T.panel }}>
          <ChatPanel emp={active} chat={chat} input={input} setInput={setInput} busy={busy} send={send} />
          <QuickActions emp={active} onPickWorkspace={pickWorkspace} onDispatch={() => service?.control?.("run_once", null, {}, null).then(() => setToast("已派发")).catch(() => {})} onDelete={removeEmployee} />
        </div>
      ) : (
        <div style={{ borderLeft: `1px solid ${T.border}`, padding: 14, color: T.textFaint, fontSize: 12 }}>选择员工后显示对话区</div>
      )}
    </div>
    </ThemeContext.Provider>
  );
}

/* ---- 创建员工表单 (复用向导: 任务→AI 灵魂→工作区→创建) ---- */
function CreateForm({ service, onDone, setToast, T, S }) {
  const [taskDesc, setTaskDesc] = useState("");
  const [newName, setNewName] = useState("");
  const [newCwd, setNewCwd] = useState("");
  const [genPrompt, setGenPrompt] = useState(null);
  const [soulBusy, setSoulBusy] = useState(false);
  const [busy, setBusy] = useState(false);

  const genSoul = useCallback(async () => {
    const t = taskDesc.trim();
    if (!t) { setToast("先描述它要干什么"); return; }
    if (soulBusy) return;
    setSoulBusy(true); setToast("⏳ AI 正在构思灵魂…");
    try {
      const r = await service?.generateSoul?.(t);
      if (r?.ok && r.prompt) {
        setGenPrompt(r.prompt);
        setNewName(r.prompt.soul.identity.name || newName);
        setToast(`已生成 ${r.prompt.soul.identity.role} 灵魂`);
      } else {
        const name = "小AI";
        setNewName(name);
        const prompt = { schemaVersion: 1, soul: { identity: { name, role: "全能员工", emoji: "", visual: {} }, description: t.slice(0, 60), mission: t.slice(0, 120), skills: [], persona: { tone: "沉稳", style: [], quirks: "" }, workflow: { planFirst: true, reportFrequency: "daily", escalation: "error-first", maxAutonomy: "handle-routine-escalate-risk" }, values: ["如实汇报"], rules: [] }, limits: null, team: { role: "solo", mode: "solo", upstream: null, downstream: [], peers: [] }, meta: { modelHint: "fast", version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: "template" } };
        setGenPrompt(prompt);
        setToast(r?.reason ?? "AI 生成失败，已用模板");
      }
    } catch (e) { setToast(`生成失败：${String(e)}`); }
    finally { setSoulBusy(false); }
  }, [taskDesc, newName, soulBusy, service, setToast]);

  const create = useCallback(async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true); setToast("⏳ 创建员工…");
    try {
      const r = await service?.createEmployee?.(name, newCwd.trim() || null, genPrompt ?? null);
      if (r?.ok) { setToast(`已创建「${r.worker.name}」`); onDone(); }
      else setToast(r?.reason ?? "创建失败");
    } catch (e) { setToast(String(e)); }
    finally { setBusy(false); }
  }, [newName, newCwd, genPrompt, busy, service, onDone, setToast]);

  return (
    <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 6, borderBottom: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 9, color: T.textFaint, fontWeight: 700 }}>1 描述任务 › 2 生成灵魂 › 3 选工作区 › 4 创建</div>
      <textarea value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} rows={2} placeholder="它要 7×24 干什么？如：盯服务器，磁盘满清理" style={{ ...S.input, resize: "none", fontSize: 12 }} />
      <button onClick={genSoul} disabled={soulBusy} style={{ ...S.btn, justifyContent: "center", color: T.accent, opacity: soulBusy ? .5 : 1, cursor: soulBusy ? "wait" : "pointer" }}>{soulBusy ? "⏳ 构思中…" : "✨ AI 生成灵魂"}</button>
      {genPrompt && (
        <div style={{ fontSize: 10.5, color: T.textMuted, background: T.surface, borderRadius: 8, padding: "6px 9px", border: `1px solid ${T.border}`, lineHeight: 1.6 }}>
          <b style={{ color: T.accent }}>{genPrompt.soul.identity.role}</b> · {genPrompt.soul.identity.name}<br />
          <span style={{ color: T.text }}>{genPrompt.soul.description}</span>
        </div>
      )}
      <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="名字（可改）" style={{ ...S.input, fontSize: 12 }} />
      <input value={newCwd} onChange={(e) => setNewCwd(e.target.value)} placeholder="工作区路径（可选，或用右侧选择）" style={{ ...S.input, fontSize: 11, fontFamily: T.fontMono }} />
      <button onClick={create} disabled={busy || !newName.trim()} style={{ ...S.btnAccent, justifyContent: "center", opacity: busy || !newName.trim() ? .5 : 1, cursor: busy || !newName.trim() ? "not-allowed" : "pointer" }}>{busy ? "⏳ 创建中…" : "创建员工"}</button>
    </div>
  );
}

/* ---- 设置页面板 (settings.section 入口) ---- */
export function WorkerSettingsPanel({ service }) {
  const { T, S } = useTheme();
  const [status, setStatus] = useState(null);
  useEffect(() => {
    Promise.resolve(service?.getStatus?.()).then(setStatus).catch(() => {});
    const t = setInterval(() => Promise.resolve(service?.getStatus?.()).then(setStatus).catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [service]);
  const w = status?.status?.watcher ?? {};
  const row = (label, value) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12.5 }}>
      <span style={{ width: 110, color: T.textMuted, flexShrink: 0 }}>{label}</span>
      <span style={{ color: T.text }}>{value ?? "—"}</span>
    </div>
  );
  return (
    <div style={{ padding: "16px 18px", fontFamily: T.fontBody, color: T.text, display: "flex", flexDirection: "column", gap: 12, maxWidth: 540 }}>
      <div style={{ fontSize: 14.5, fontWeight: 700 }}>AI 员工 · 插件状态</div>
      <div style={{ ...S.card, padding: "4px 14px" }}>
        <div style={{ fontSize: 11, color: T.textMuted, padding: "7px 0", textTransform: "uppercase", letterSpacing: ".05em" }}>运行</div>
        {row("心跳", w.alive === true ? "正常" : "异常")}
        {row("降级", w.downgrade ?? "normal")}
        {row("连续失败", w.consecutiveDispatchFailures ?? 0)}
      </div>
      <div style={{ fontSize: 12, color: T.textMuted }}>员工管理在「AI 工作台」（左侧底部入口）。</div>
    </div>
  );
}

/* ---- 样式辅助 ---- */
const chipStyle = (T) => ({ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: T.textMuted, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "2px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
const accBtn = (T) => ({ height: 32, padding: "0 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: T.accent, color: T.name === "dark" ? "#0f141c" : "#fff", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.fontBody });
const ghostBtn = (T) => ({ height: 32, padding: "0 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${T.borderStrong}`, background: "transparent", color: T.textMuted, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.fontBody });
