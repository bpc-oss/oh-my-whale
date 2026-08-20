// dsh-continuous-worker — 设计系统 v12 (高级面板, 全面重做).
//
// 用户决策: 放弃像素场景 (v11 太丑), 全面重做为高级面板。
// hy3 总设计师规格 (ui-design-v12.md §1): 现代精致、双主题 (暗/浅)、
// 状态色语义化、微圆角 + 克制阴影。非像素、非场景、非看板。

export const lightTheme = {
  name: "light",
  bg: "#f4f6f9",
  panel: "#ffffff",
  surface: "#f8fafc",
  surfaceHover: "#eef2f7",
  border: "rgba(15,23,42,.10)",
  borderStrong: "rgba(15,23,42,.22)",
  accent: "#2563eb",
  accentDim: "rgba(37,99,235,.10)",
  accent2: "#7c3aed",
  text: "#1e293b",
  textMuted: "#475569",
  textFaint: "#94a3b8",
  ok: "#10b981",
  warn: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
};

export const darkTheme = {
  name: "dark",
  bg: "#0f141c",
  panel: "#161d29",
  surface: "#1c2533",
  surfaceHover: "#222c3c",
  border: "rgba(148,163,184,.14)",
  borderStrong: "rgba(148,163,184,.28)",
  accent: "#38bdf8",
  accentDim: "rgba(56,189,248,.16)",
  accent2: "#a78bfa",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textFaint: "#64748b",
  ok: "#34d399",
  warn: "#fbbf24",
  danger: "#f87171",
  info: "#60a5fa",
};

export const theme = lightTheme;

/** 旧字段兼容 (v12 无场景, 保留引用). */
for (const t of [lightTheme, darkTheme]) {
  t.fontBody = "'Inter','Segoe UI',system-ui,sans-serif";
  t.fontDisplay = t.fontBody;
  t.fontMono = "'JetBrains Mono','SF Mono',Consolas,monospace";
  t.iconSize = 16;
  t.iconSizeSm = 14;
  t.radius = 12;
  t.radiusSm = 8;
  t.sceneFloor = t.bg;
  t.sceneLine = t.border;
  t.sceneCarpet = t.surface;
  t.sceneDesk = t.surface;
  t.sceneSkin = "#f0c79a";
  t.sceneHair = "#4a3a2a";
}

/** 基础样式. */
export const baseCss = `
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: rgba(148,163,184,.3); border-radius: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::selection { background: rgba(56,189,248,.3); }
`;

export async function loadFonts() { /* Inter/系统字体 */ }

/** 样式对象 (按主题构造). */
export function buildS(t) {
  return {
    card: { background: t.panel, border: `1px solid ${t.border}`, borderRadius: t.radius, boxShadow: "0 1px 3px rgba(0,0,0,.08)" },
    input: { background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.radiusSm, color: t.text, outline: "none", fontFamily: t.fontBody, fontSize: 13, padding: "9px 12px" },
    chip: (color) => ({ fontSize: 11, fontWeight: 600, color: color ?? t.textMuted, background: `${color ?? t.accent}14`, border: `1px solid ${color ?? t.accent}33`, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }),
    btn: { padding: "6px 12px", borderRadius: t.radiusSm, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${t.borderStrong}`, background: t.panel, color: t.text, fontFamily: t.fontBody, display: "inline-flex", alignItems: "center", gap: 6 },
    btnAccent: { padding: "6px 14px", borderRadius: t.radiusSm, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", background: t.accent, color: t.name === "dark" ? "#0f141c" : "#ffffff", fontFamily: t.fontBody, display: "inline-flex", alignItems: "center", gap: 6 },
  };
}
