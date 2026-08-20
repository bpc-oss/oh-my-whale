window.__ModuleLoader__.load({
  id: "dsh-continuous-worker",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.jsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);
var import_react4 = __toESM(require("react"), 1);

// src/Dashboard.jsx
var import_react3 = __toESM(require("react"), 1);

// vendor/lucide-react/dist/esm/createLucideIcon.js
var import_react2 = require("react");

// vendor/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();

// vendor/lucide-react/dist/esm/Icon.js
var import_react = require("react");

// vendor/lucide-react/dist/esm/defaultAttributes.js
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

// vendor/lucide-react/dist/esm/Icon.js
var Icon = (0, import_react.forwardRef)(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => {
    return (0, import_react.createElement)(
      "svg",
      {
        ref,
        ...defaultAttributes,
        width: size,
        height: size,
        stroke: color,
        strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
        className: mergeClasses("lucide", className),
        ...rest
      },
      [
        ...iconNode.map(([tag, attrs]) => (0, import_react.createElement)(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);

// vendor/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = (0, import_react2.forwardRef)(
    ({ className, ...props }, ref) => (0, import_react2.createElement)(Icon, {
      ref,
      iconNode,
      className: mergeClasses(`lucide-${toKebabCase(iconName)}`, className),
      ...props
    })
  );
  Component.displayName = `${iconName}`;
  return Component;
};

// vendor/lucide-react/dist/esm/icons/bot.js
var Bot = createLucideIcon("Bot", [
  ["path", { d: "M12 8V4H8", key: "hb8ula" }],
  ["rect", { width: "16", height: "12", x: "4", y: "8", rx: "2", key: "enze0r" }],
  ["path", { d: "M2 14h2", key: "vft8re" }],
  ["path", { d: "M20 14h2", key: "4cs60a" }],
  ["path", { d: "M15 13v2", key: "1xurst" }],
  ["path", { d: "M9 13v2", key: "rq6x2g" }]
]);

// vendor/lucide-react/dist/esm/icons/folder-open.js
var FolderOpen = createLucideIcon("FolderOpen", [
  [
    "path",
    {
      d: "m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2",
      key: "usdka0"
    }
  ]
]);

// vendor/lucide-react/dist/esm/icons/message-square.js
var MessageSquare = createLucideIcon("MessageSquare", [
  ["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", key: "1lielz" }]
]);

// vendor/lucide-react/dist/esm/icons/moon.js
var Moon = createLucideIcon("Moon", [
  ["path", { d: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z", key: "a7tn18" }]
]);

// vendor/lucide-react/dist/esm/icons/plus.js
var Plus = createLucideIcon("Plus", [
  ["path", { d: "M5 12h14", key: "1ays0h" }],
  ["path", { d: "M12 5v14", key: "s699le" }]
]);

// vendor/lucide-react/dist/esm/icons/send.js
var Send = createLucideIcon("Send", [
  [
    "path",
    {
      d: "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z",
      key: "1ffxy3"
    }
  ],
  ["path", { d: "m21.854 2.147-10.94 10.939", key: "12cjpa" }]
]);

// vendor/lucide-react/dist/esm/icons/sun.js
var Sun = createLucideIcon("Sun", [
  ["circle", { cx: "12", cy: "12", r: "4", key: "4exip2" }],
  ["path", { d: "M12 2v2", key: "tus03m" }],
  ["path", { d: "M12 20v2", key: "1lh1kg" }],
  ["path", { d: "m4.93 4.93 1.41 1.41", key: "149t6j" }],
  ["path", { d: "m17.66 17.66 1.41 1.41", key: "ptbguv" }],
  ["path", { d: "M2 12h2", key: "1t8f8n" }],
  ["path", { d: "M20 12h2", key: "1q8mjw" }],
  ["path", { d: "m6.34 17.66-1.41 1.41", key: "1m8zz5" }],
  ["path", { d: "m19.07 4.93-1.41 1.41", key: "1shlcs" }]
]);

// vendor/lucide-react/dist/esm/icons/trash-2.js
var Trash2 = createLucideIcon("Trash2", [
  ["path", { d: "M3 6h18", key: "d0wm0j" }],
  ["path", { d: "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6", key: "4alrt4" }],
  ["path", { d: "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2", key: "v07s0e" }],
  ["line", { x1: "10", x2: "10", y1: "11", y2: "17", key: "1uufr5" }],
  ["line", { x1: "14", x2: "14", y1: "11", y2: "17", key: "xtxkd" }]
]);

// vendor/lucide-react/dist/esm/icons/zap.js
var Zap = createLucideIcon("Zap", [
  [
    "path",
    {
      d: "M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z",
      key: "1xq2db"
    }
  ]
]);

// src/theme.js
var lightTheme = {
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
  info: "#3b82f6"
};
var darkTheme = {
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
  info: "#60a5fa"
};
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
var baseCss = `
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: rgba(148,163,184,.3); border-radius: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::selection { background: rgba(56,189,248,.3); }
`;
function buildS(t) {
  return {
    card: { background: t.panel, border: `1px solid ${t.border}`, borderRadius: t.radius, boxShadow: "0 1px 3px rgba(0,0,0,.08)" },
    input: { background: t.surface, border: `1px solid ${t.border}`, borderRadius: t.radiusSm, color: t.text, outline: "none", fontFamily: t.fontBody, fontSize: 13, padding: "9px 12px" },
    chip: (color) => ({ fontSize: 11, fontWeight: 600, color: color ?? t.textMuted, background: `${color ?? t.accent}14`, border: `1px solid ${color ?? t.accent}33`, borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }),
    btn: { padding: "6px 12px", borderRadius: t.radiusSm, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${t.borderStrong}`, background: t.panel, color: t.text, fontFamily: t.fontBody, display: "inline-flex", alignItems: "center", gap: 6 },
    btnAccent: { padding: "6px 14px", borderRadius: t.radiusSm, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none", background: t.accent, color: t.name === "dark" ? "#0f141c" : "#ffffff", fontFamily: t.fontBody, display: "inline-flex", alignItems: "center", gap: 6 }
  };
}

// src/Dashboard.jsx
var ThemeContext = (0, import_react3.createContext)({ T: lightTheme, S: null, isDark: false });
var useTheme = () => (0, import_react3.useContext)(ThemeContext);
var STATUS_META = {
  active: { label: "\u5728\u5C97", color: "ok" },
  busy: { label: "\u5FD9\u788C", color: "warn" },
  rest: { label: "\u4F11\u606F", color: "info" },
  offline: { label: "\u79BB\u7EBF", color: "danger" }
};
var TABS = [
  { key: "experience", label: "\u{1F4C5} \u7ECF\u5386" },
  { key: "skills", label: "\u{1F9F0} \u6280\u80FD" },
  { key: "habits", label: "\u{1F550} \u4E60\u60EF" },
  { key: "thinking", label: "\u{1F9E0} \u601D\u7EF4" },
  { key: "chat", label: "\u{1F4AC} \u901A\u8BAF" },
  { key: "status", label: "\u{1F4CA} \u72B6\u6001" },
  { key: "growth", label: "\u{1F331} \u6210\u957F" }
];
function Empty({ icon, text, hint }) {
  const { T } = useTheme();
  return /* @__PURE__ */ import_react3.default.createElement("div", { style: { textAlign: "center", padding: "48px 20px", color: T.textFaint, fontSize: 13, lineHeight: 1.8 } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 32, marginBottom: 8 } }, icon), /* @__PURE__ */ import_react3.default.createElement("div", null, text), hint && /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 12, color: T.textFaint, opacity: 0.8 } }, hint));
}
function EmployeeHeader({ emp, growth, status, onChat, onDispatch, onDelete }) {
  const { T } = useTheme();
  const st = STATUS_META[emp.status] ?? STATUS_META.active;
  const rate = growth?.successRate ?? 0;
  return /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", alignItems: "center", gap: 16, background: T.panel, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "16px 18px", flexShrink: 0 } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { width: 64, height: 64, borderRadius: 12, background: T.surface, border: `1px solid ${T.borderStrong}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, flexShrink: 0 } }, emp.role === "\u8FD0\u7EF4\u5DE5\u7A0B\u5E08" || emp.role?.includes("\u8FD0\u7EF4") ? "\u{1F6E1}\uFE0F" : emp.role?.includes("\u7A0B\u5E8F") ? "\u{1F4BB}" : emp.role?.includes("\u79D1\u5B66") ? "\u{1F52C}" : emp.role?.includes("\u8BBE\u8BA1") ? "\u{1F3A8}" : "\u{1F916}"), /* @__PURE__ */ import_react3.default.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } }, /* @__PURE__ */ import_react3.default.createElement("span", { style: { fontSize: 18, fontWeight: 600, color: T.text } }, emp.name), /* @__PURE__ */ import_react3.default.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, fontSize: 12, background: T[st.color] + "22", color: T[st.color], fontWeight: 600 } }, /* @__PURE__ */ import_react3.default.createElement("span", { style: { width: 6, height: 6, borderRadius: "50%", background: T[st.color] } }), st.label)), /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 13, color: T.textMuted, marginTop: 4 } }, emp.role ?? "AI \u5458\u5DE5"), /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" } }, /* @__PURE__ */ import_react3.default.createElement("span", { style: { fontSize: 12, color: T.textMuted } }, "Lv.1"), /* @__PURE__ */ import_react3.default.createElement("div", { style: { width: 140, height: 6, borderRadius: 999, background: T.surface, overflow: "hidden" } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { width: `${Math.min(100, Math.max(4, rate))}%`, height: 6, background: `linear-gradient(90deg, ${T.accent}, ${T.accent2})` } })), /* @__PURE__ */ import_react3.default.createElement("span", { style: { fontSize: 11, color: T.textMuted } }, "\u6210\u529F\u7387 ", rate, "%"), emp.cwd && /* @__PURE__ */ import_react3.default.createElement("span", { style: chipStyle(T) }, /* @__PURE__ */ import_react3.default.createElement(FolderOpen, { size: 10 }), " ", emp.cwd))), /* @__PURE__ */ import_react3.default.createElement("div", { style: { marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 220 } }, /* @__PURE__ */ import_react3.default.createElement("button", { onClick: onChat, style: accBtn(T) }, /* @__PURE__ */ import_react3.default.createElement(MessageSquare, { size: 13 }), " \u5BF9\u8BDD"), /* @__PURE__ */ import_react3.default.createElement("button", { onClick: onDispatch, style: ghostBtn(T) }, /* @__PURE__ */ import_react3.default.createElement(Zap, { size: 13 }), " \u6D3E\u53D1"), /* @__PURE__ */ import_react3.default.createElement("button", { onClick: onDelete, style: { ...ghostBtn(T), color: T.danger } }, /* @__PURE__ */ import_react3.default.createElement(Trash2, { size: 13 }))));
}
function ExperienceTab({ chat }) {
  const { T } = useTheme();
  if (!chat || chat.length === 0) return /* @__PURE__ */ import_react3.default.createElement(Empty, { icon: "\u{1F4C5}", text: "\u8BE5\u5458\u5DE5\u6682\u65E0\u300C\u7ECF\u5386\u300D\u6570\u636E", hint: "\u53D1\u9001\u5BF9\u8BDD\u6216\u6D3E\u53D1\u4EFB\u52A1\u5373\u53EF\u751F\u6210 \u2192" });
  return /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", flexDirection: "column" } }, chat.map((m, i) => /* @__PURE__ */ import_react3.default.createElement("div", { key: i, style: { display: "flex", gap: 12, padding: "8px 0", borderLeft: `1px solid ${T.border}`, marginLeft: 5 } }, /* @__PURE__ */ import_react3.default.createElement("span", { style: { width: 10, height: 10, borderRadius: "50%", background: m.role === "user" ? T.accent : T.ok, marginLeft: -5.5, flexShrink: 0, marginTop: 4 } }), /* @__PURE__ */ import_react3.default.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 11, color: T.textFaint } }, new Date(m.at ?? Date.now()).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }), " \xB7 ", m.role === "user" ? "\u7528\u6237" : "\u5458\u5DE5"), /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 13, color: T.text, marginTop: 2, whiteSpace: "pre-wrap" } }, m.text)))));
}
function SkillsTab({ growth }) {
  const { T } = useTheme();
  const count = growth?.skillsCount ?? 0;
  if (count === 0) return /* @__PURE__ */ import_react3.default.createElement(Empty, { icon: "\u{1F9F0}", text: "\u8BE5\u5458\u5DE5\u6682\u65E0\u300C\u6280\u80FD\u300D\u6570\u636E", hint: "\u91CD\u590D\u5B8C\u6210\u540C\u7C7B\u4EFB\u52A1 3 \u6B21\u540E\u81EA\u52A8\u56FA\u5316\u6280\u80FD \u2192" });
  return /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 } }, Array.from({ length: Math.min(count, 8) }).map((_, i) => /* @__PURE__ */ import_react3.default.createElement("div", { key: i, style: { padding: 12, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: T.text } }, "\u6280\u80FD #", i + 1), /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 11, color: T.textMuted, marginTop: 6 } }, "\u5173\u952E\u8BCD \xB7 \u81EA\u52A8\u56FA\u5316"), /* @__PURE__ */ import_react3.default.createElement("div", { style: { height: 5, borderRadius: 999, background: T.panel, marginTop: 8, overflow: "hidden" } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { width: `${Math.max(20, 100 - i * 10)}%`, height: 5, background: T.accent } })))));
}
function HabitsTab() {
  return /* @__PURE__ */ import_react3.default.createElement(Empty, { icon: "\u{1F550}", text: "\u8BE5\u5458\u5DE5\u6682\u65E0\u300C\u4E60\u60EF\u300D\u6570\u636E", hint: "\u91CD\u590D\u884C\u4E3A\u4F1A\u88AB\u8BB0\u5F55\u4E3A\u4E60\u60EF\uFF08\u5982\u6BCF\u65E5\u590D\u76D8\uFF09\u2192" });
}
function ThinkingTab({ thinking, onTask }) {
  const { T } = useTheme();
  const [sel, setSel] = (0, import_react3.useState)(null);
  const tasks = thinking?.tasks ?? [];
  if (tasks.length === 0) return /* @__PURE__ */ import_react3.default.createElement(Empty, { icon: "\u{1F9E0}", text: "\u8BE5\u5458\u5DE5\u6682\u65E0\u300C\u601D\u7EF4\u300D\u6570\u636E", hint: "\u5458\u5DE5\u6267\u884C\u4EFB\u52A1\u65F6\u4F1A\u7559\u75D5\uFF08\u89C4\u5212/\u51B3\u7B56/\u53CD\u601D\uFF09\u2192" });
  const t = sel ?? tasks[0];
  return /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("select", { value: t.taskId, onChange: (e) => setSel(tasks.find((x) => x.taskId === e.target.value)), style: { ...S.input, marginBottom: 12 } }, tasks.map((x) => /* @__PURE__ */ import_react3.default.createElement("option", { key: x.taskId, value: x.taskId }, x.taskId, " \xB7 ", x.entries, " \u6761"))), /* @__PURE__ */ import_react3.default.createElement(ThinkingChain, { taskId: t.taskId, onLoad: onTask }));
}
function ThinkingChain({ taskId, onLoad }) {
  const { T } = useTheme();
  const [entries, setEntries] = (0, import_react3.useState)(null);
  (0, import_react3.useEffect)(() => {
    if (!onLoad || !taskId) return;
    let cancelled = false;
    onLoad(taskId).then((p) => {
      if (!cancelled) setEntries(p?.entries ?? []);
    }).catch(() => {
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, onLoad]);
  if (!entries) return /* @__PURE__ */ import_react3.default.createElement("div", { style: { color: T.textFaint, fontSize: 12, padding: 12 } }, "\u52A0\u8F7D\u601D\u7EF4\u94FE\u2026");
  if (entries.length === 0) return /* @__PURE__ */ import_react3.default.createElement(Empty, { icon: "\u{1F9E0}", text: "\u65E0\u601D\u7EF4\u8BB0\u5F55" });
  const kindColor = { plan: T.info, decision: T.accent2, tool: T.accent, reflect: T.ok, step: T.textMuted };
  const kindLabel = { plan: "\u89C4\u5212", decision: "\u51B3\u7B56", tool: "\u5DE5\u5177", reflect: "\u53CD\u601D", step: "\u6B65\u9AA4" };
  return /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", flexDirection: "column" } }, entries.map((e, i) => /* @__PURE__ */ import_react3.default.createElement("div", { key: i, style: { display: "flex", gap: 12, padding: "6px 0", borderLeft: `1px solid ${T.border}`, marginLeft: 5 } }, /* @__PURE__ */ import_react3.default.createElement("span", { style: { width: 10, height: 10, borderRadius: "50%", background: kindColor[e.kind] ?? T.textMuted, marginLeft: -5.5, flexShrink: 0, marginTop: 4 } }), /* @__PURE__ */ import_react3.default.createElement("div", { style: { minWidth: 0 } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } }, /* @__PURE__ */ import_react3.default.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: kindColor[e.kind] ?? T.textMuted, border: `1px solid ${kindColor[e.kind] ?? T.textMuted}44`, padding: "0 6px", borderRadius: 4 } }, kindLabel[e.kind] ?? e.kind), /* @__PURE__ */ import_react3.default.createElement("span", { style: { fontSize: 10, color: T.textFaint } }, new Date(e.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))), /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 12, color: T.text, marginTop: 2, whiteSpace: "pre-wrap" } }, e.content), e.meta?.name && /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 10, color: T.textFaint, marginTop: 2 } }, "\u{1F527} ", e.meta.name)))));
}
function ChatLogTab({ chat }) {
  const { T } = useTheme();
  if (!chat || chat.length === 0) return /* @__PURE__ */ import_react3.default.createElement(Empty, { icon: "\u{1F4AC}", text: "\u6682\u65E0\u901A\u8BAF\u8BB0\u5F55", hint: "\u5728\u53F3\u4FA7\u5BF9\u8BDD\u533A\u7ED9\u5458\u5DE5\u4E0B\u6307\u4EE4 \u2192" });
  return /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } }, chat.map((m, i) => /* @__PURE__ */ import_react3.default.createElement("div", { key: i, style: { display: "flex", gap: 8, justifyContent: m.role === "user" ? "flex-end" : "flex-start" } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { maxWidth: "78%", padding: "10px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", background: m.role === "user" ? T.accentDim : T.surface, border: `1px solid ${T.border}`, color: T.text } }, m.text))));
}
function StatusTab({ st }) {
  const { T } = useTheme();
  const metrics = [
    { label: "\u4EFB\u52A1\u6570", value: st?.growth?.taskCount ?? 0 },
    { label: "\u6210\u529F\u7387", value: `${st?.growth?.successRate ?? 0}%` },
    { label: "\u6280\u80FD", value: st?.growth?.skillsCount ?? 0 },
    { label: "\u7ECF\u9A8C", value: st?.growth?.experienceCount ?? 0 },
    { label: "\u5728\u5C97", value: `${st?.growth?.activeDays ?? 0} \u5929` },
    { label: "\u6392\u961F\u4EFB\u52A1", value: st?.queue?.pending ?? 0, warn: (st?.queue?.pending ?? 0) > 0 },
    { label: "\u4ECA\u65E5 Token", value: `${st?.ledger?.tokensUsed ?? 0}/${st?.ledger?.dailyTokensLimit ?? 0}` },
    { label: "Agent", value: st?.agentAlive ? "\u5B58\u6D3B" : "\u79BB\u7EBF", danger: !st?.agentAlive }
  ];
  return /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 } }, metrics.map((m) => /* @__PURE__ */ import_react3.default.createElement("div", { key: m.label, style: { padding: 14, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ import_react3.default.createElement("span", { style: { width: 8, height: 8, borderRadius: "50%", background: m.danger ? T.danger : m.warn ? T.warn : T.ok } }), /* @__PURE__ */ import_react3.default.createElement("span", { style: { fontSize: 11, color: T.textFaint } }, m.label)), /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 22, fontWeight: 700, color: T.text, marginTop: 6 } }, m.value))));
}
function GrowthTab({ growth }) {
  const { T } = useTheme();
  if (!growth || (growth.taskCount ?? 0) === 0) return /* @__PURE__ */ import_react3.default.createElement(Empty, { icon: "\u{1F331}", text: "\u8BE5\u5458\u5DE5\u6682\u65E0\u300C\u6210\u957F\u300D\u6570\u636E", hint: "\u5B8C\u6210\u4EFB\u52A1\u540E\u8BB0\u5F55\u6210\u957F\u8F68\u8FF9 \u2192" });
  const stats = [
    { label: "\u4EFB\u52A1", value: growth.taskCount ?? 0 },
    { label: "\u6210\u529F\u7387", value: `${growth.successRate ?? 0}%`, color: (growth.successRate ?? 0) >= 80 ? T.ok : (growth.successRate ?? 0) >= 50 ? T.warn : T.danger },
    { label: "\u6280\u80FD", value: growth.skillsCount ?? 0 },
    { label: "\u7ECF\u9A8C", value: growth.experienceCount ?? 0 },
    { label: "\u5728\u5C97", value: `${growth.activeDays ?? 0} \u5929` }
  ];
  const traj = growth.trajectory ?? [];
  return /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 12, marginBottom: 16 } }, stats.map((s) => /* @__PURE__ */ import_react3.default.createElement("div", { key: s.label, style: { padding: 14, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, textAlign: "center" } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 22, fontWeight: 700, color: s.color ?? T.text } }, s.value), /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 11, color: T.textFaint, marginTop: 4 } }, s.label)))), traj.length >= 2 ? /* @__PURE__ */ import_react3.default.createElement("div", { style: { padding: 14, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 10 } }, "\u6210\u529F\u7387\u8D8B\u52BF"), /* @__PURE__ */ import_react3.default.createElement("svg", { viewBox: "0 0 640 200", width: "100%", height: 200 }, [0, 1, 2, 3, 4].map((i) => /* @__PURE__ */ import_react3.default.createElement("line", { key: i, x1: 40, y1: 40 + i * 36, x2: 630, y2: 40 + i * 36, stroke: T.border, strokeWidth: 1 })), traj.slice(-24).map((p, i) => {
    const x = 40 + i / Math.max(1, Math.min(24, traj.length) - 1) * 590;
    const y = 180 - (p.successRate ?? 0) / 100 * 140;
    return /* @__PURE__ */ import_react3.default.createElement("circle", { key: i, cx: x, cy: y, r: 3.5, fill: T.panel, stroke: T.accent, strokeWidth: 2 }, /* @__PURE__ */ import_react3.default.createElement("title", null, `${(p.at ?? "").slice(0, 10)} \xB7 ${p.successRate}%`));
  }))) : /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 12, color: T.textFaint, padding: 8 } }, "\u5B8C\u6210\u66F4\u591A\u4EFB\u52A1\u540E\u663E\u793A\u8D8B\u52BF\u66F2\u7EBF"));
}
function ChatPanel({ emp, chat, input, setInput, busy, send }) {
  const { T, S: S2 } = useTheme();
  const endRef = (0, import_react3.useRef)(null);
  (0, import_react3.useEffect)(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);
  return /* @__PURE__ */ import_react3.default.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: T.panel, border: `1px solid ${T.border}`, borderRadius: T.radius } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { padding: "12px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 600, color: T.text, display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ import_react3.default.createElement(MessageSquare, { size: 14, color: T.accent }), " \u4E0E ", emp.name, " \u5BF9\u8BDD"), /* @__PURE__ */ import_react3.default.createElement("div", { style: { flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 } }, chat.length === 0 ? /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 12, color: T.textFaint, textAlign: "center", paddingTop: 40, lineHeight: 1.8 } }, "\u7ED9 ", emp.name, " \u4E0B\u6307\u4EE4\uFF1A", /* @__PURE__ */ import_react3.default.createElement("br", null), "\u300C\u68C0\u67E5\u5DE5\u4F5C\u533A\u78C1\u76D8\u300D", /* @__PURE__ */ import_react3.default.createElement("br", null), "\u300C\u6BCF\u5929 9 \u70B9\u6C47\u62A5\u300D") : chat.map((m, i) => /* @__PURE__ */ import_react3.default.createElement("div", { key: i, style: { display: "flex", gap: 8, justifyContent: m.role === "user" ? "flex-end" : "flex-start" } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { maxWidth: "85%", padding: "9px 12px", borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", background: m.role === "user" ? T.accentDim : T.surface, border: `1px solid ${T.border}`, color: T.text } }, m.text))), busy && /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 11, color: T.textFaint } }, "\u6295\u9012\u4E2D\u2026"), /* @__PURE__ */ import_react3.default.createElement("div", { ref: endRef })), /* @__PURE__ */ import_react3.default.createElement("div", { style: { padding: 10, borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 } }, /* @__PURE__ */ import_react3.default.createElement("input", { value: input, onChange: (e) => setInput(e.target.value), onKeyDown: (e) => {
    if (e.key === "Enter") send();
  }, placeholder: `\u6307\u4EE4\u2026`, style: { ...S2.input, flex: 1 } }), /* @__PURE__ */ import_react3.default.createElement("button", { onClick: send, disabled: busy || !input.trim(), style: { ...S2.btnAccent, padding: "0 14px", opacity: busy || !input.trim() ? 0.5 : 1, cursor: busy || !input.trim() ? "not-allowed" : "pointer" } }, /* @__PURE__ */ import_react3.default.createElement(Send, { size: 14 }))));
}
function QuickActions({ emp, onPickWorkspace, onDispatch, onDelete }) {
  const { T, S: S2 } = useTheme();
  return /* @__PURE__ */ import_react3.default.createElement("div", { style: { padding: 12, background: T.panel, border: `1px solid ${T.border}`, borderRadius: T.radius } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: T.textMuted, marginBottom: 10 } }, "\u5FEB\u6377\u64CD\u4F5C"), /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } }, /* @__PURE__ */ import_react3.default.createElement("button", { onClick: onPickWorkspace, style: S2.btn }, /* @__PURE__ */ import_react3.default.createElement(FolderOpen, { size: 14 }), " ", emp.cwd ? "\u66F4\u6362\u5DE5\u4F5C\u533A" : "\u9009\u62E9\u5DE5\u4F5C\u533A"), /* @__PURE__ */ import_react3.default.createElement("button", { onClick: onDispatch, style: S2.btn }, /* @__PURE__ */ import_react3.default.createElement(Zap, { size: 14 }), " \u6D3E\u53D1\u4E00\u6B21\u4EFB\u52A1"), /* @__PURE__ */ import_react3.default.createElement("button", { onClick: onDelete, style: { ...S2.btn, color: T.danger, borderColor: T.danger + "55" } }, /* @__PURE__ */ import_react3.default.createElement(Trash2, { size: 14 }), " \u5220\u9664\u5458\u5DE5")));
}
function WorkerDashboard({ service }) {
  const [isDark, setIsDark] = (0, import_react3.useState)(false);
  const T = isDark ? darkTheme : lightTheme;
  const S2 = buildS(T);
  const [tab, setTab] = (0, import_react3.useState)("status");
  const [employees, setEmployees] = (0, import_react3.useState)([]);
  const [activeId, setActiveId] = (0, import_react3.useState)(null);
  const [chat, setChat] = (0, import_react3.useState)([]);
  const [growth, setGrowth] = (0, import_react3.useState)(null);
  const [empStatus, setEmpStatus] = (0, import_react3.useState)(null);
  const [thinking, setThinking] = (0, import_react3.useState)(null);
  const [input, setInput] = (0, import_react3.useState)("");
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [toast, setToast] = (0, import_react3.useState)(null);
  const [creating, setCreating] = (0, import_react3.useState)(false);
  const active = employees.find((e) => e.id === activeId) ?? null;
  const refresh = (0, import_react3.useCallback)(async () => {
    try {
      const list = await service?.getEmployees?.();
      setEmployees(list ?? []);
      if (!list.some((e) => e.id === activeId) && list.length > 0) setActiveId(list[0].id);
    } catch {
    }
  }, [activeId, service]);
  (0, import_react3.useEffect)(() => {
    refresh();
  }, [refresh]);
  (0, import_react3.useEffect)(() => {
    if (toast === null) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);
  (0, import_react3.useEffect)(() => {
    if (!activeId || !service) {
      setChat([]);
      setGrowth(null);
      setEmpStatus(null);
      setThinking(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const [c, s, t] = await Promise.all([
        service.employeeChat?.(activeId).catch(() => []),
        service.employeeStatus?.(activeId).catch(() => null),
        service.employeeThinking?.(activeId).catch(() => null)
      ]);
      if (cancelled) return;
      setChat(Array.isArray(c) ? c : []);
      const g = s?.growth ?? null;
      setEmpStatus(s);
      setGrowth(g);
      setThinking(t);
    };
    load();
    const timer = setInterval(load, 8e3);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeId, service]);
  const send = (0, import_react3.useCallback)(async () => {
    const text = input.trim();
    if (!text || !activeId || busy) return;
    setInput("");
    setBusy(true);
    setChat((m) => [...m, { role: "user", text, at: (/* @__PURE__ */ new Date()).toISOString() }]);
    try {
      const r = await service?.instructEmployee?.(activeId, text);
      setChat((m) => [...m, { role: "ai", text: r?.ok ? `\u5DF2\u63A5\u6536\u6307\u4EE4${r.mode === "delivered" ? "\uFF0C\u6B63\u5728\u6267\u884C\u2026" : "\uFF0C\u5DF2\u6392\u961F\u3002"}` : `\u672A\u80FD\u6295\u9012\uFF1A${r?.reason ?? "\u672A\u77E5"}`, at: (/* @__PURE__ */ new Date()).toISOString() }]);
    } catch (e) {
      setChat((m) => [...m, { role: "ai", text: `\u8FDE\u63A5\u5931\u8D25\uFF1A${String(e)}`, at: (/* @__PURE__ */ new Date()).toISOString() }]);
    } finally {
      setBusy(false);
      refresh();
    }
  }, [input, activeId, busy, service, refresh]);
  const pickWorkspace = (0, import_react3.useCallback)(async () => {
    if (!activeId) return;
    try {
      const r = await service?.pickDirectory?.();
      if (r?.ok && r.path) {
        const set = await service?.setEmployeeWorkspace?.(activeId, r.path);
        setToast(set?.ok ? `\u5DE5\u4F5C\u533A\u5DF2\u8BBE\u7F6E\uFF1A${r.path}` : set?.reason ?? "\u8BBE\u7F6E\u5931\u8D25");
      } else if (!r?.cancelled) {
        setToast(r?.reason ?? "\u65E0\u6CD5\u5F39\u51FA\u76EE\u5F55\u9009\u62E9\u6846");
      }
    } catch (e) {
      setToast(String(e));
    }
    refresh();
  }, [activeId, service, refresh]);
  const removeEmployee = (0, import_react3.useCallback)(async () => {
    if (!activeId || !window.confirm("\u786E\u8BA4\u5220\u9664\u8BE5\u5458\u5DE5\uFF1F\u5176\u6570\u636E\u5C06\u6E05\u9664\u3002")) return;
    try {
      const r = await service?.control?.("remove_employee", activeId);
      setToast(r?.ok ? "\u5DF2\u5220\u9664" : r?.reason ?? "\u5220\u9664\u5931\u8D25");
    } catch (e) {
      setToast(String(e));
    }
    setActiveId(null);
    refresh();
  }, [activeId, service, refresh]);
  return /* @__PURE__ */ import_react3.default.createElement(ThemeContext.Provider, { value: { T, S: S2, isDark } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { height: "100%", display: "grid", gridTemplateColumns: "220px 1fr 320px", background: T.bg, color: T.text, fontFamily: T.fontBody, fontSize: 13 } }, /* @__PURE__ */ import_react3.default.createElement("style", null, baseCss), toast && /* @__PURE__ */ import_react3.default.createElement("div", { style: { position: "fixed", top: 16, right: 16, zIndex: 100, background: T.panel, border: `1px solid ${T.borderStrong}`, borderRadius: 8, padding: "8px 14px", fontSize: 12.5, boxShadow: "0 8px 24px rgba(0,0,0,.2)" } }, toast), /* @__PURE__ */ import_react3.default.createElement("div", { style: { borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", minHeight: 0, background: T.panel } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { padding: "14px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${T.border}` } }, /* @__PURE__ */ import_react3.default.createElement(Bot, { size: 18, color: T.accent }), /* @__PURE__ */ import_react3.default.createElement("strong", { style: { fontSize: 15 } }, "AI \u5458\u5DE5"), /* @__PURE__ */ import_react3.default.createElement("button", { onClick: () => setIsDark(!isDark), title: "\u5207\u6362\u4E3B\u9898", style: { marginLeft: "auto", border: "none", background: "transparent", color: T.textMuted, cursor: "pointer", padding: 4 } }, isDark ? /* @__PURE__ */ import_react3.default.createElement(Sun, { size: 16 }) : /* @__PURE__ */ import_react3.default.createElement(Moon, { size: 16 }))), /* @__PURE__ */ import_react3.default.createElement("div", { style: { padding: "10px 12px" } }, /* @__PURE__ */ import_react3.default.createElement("button", { onClick: () => setCreating(!creating), style: { ...S2.btnAccent, width: "100%", justifyContent: "center" } }, /* @__PURE__ */ import_react3.default.createElement(Plus, { size: 14 }), " ", creating ? "\u6536\u8D77" : "\u521B\u5EFA\u5458\u5DE5")), creating && /* @__PURE__ */ import_react3.default.createElement(CreateForm, { service, onDone: () => {
    setCreating(false);
    refresh();
  }, setToast, T, S: S2 }), /* @__PURE__ */ import_react3.default.createElement("div", { style: { flex: 1, overflowY: "auto", padding: "6px 8px" } }, employees.length === 0 && /* @__PURE__ */ import_react3.default.createElement("div", { style: { padding: 20, fontSize: 12, color: T.textFaint, textAlign: "center" } }, "\u8FD8\u6CA1\u6709\u5458\u5DE5", /* @__PURE__ */ import_react3.default.createElement("br", null), "\u70B9\u4E0A\u65B9\u521B\u5EFA"), employees.map((e) => {
    const st = STATUS_META[e.status] ?? STATUS_META.active;
    return /* @__PURE__ */ import_react3.default.createElement("button", { key: e.id, onClick: () => setActiveId(e.id), style: { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", marginBottom: 4, border: `1px solid ${e.id === activeId ? T.accent : "transparent"}`, background: e.id === activeId ? T.accentDim : "transparent", borderRadius: 10, cursor: "pointer", textAlign: "left", color: T.text, fontFamily: T.fontBody } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { width: 34, height: 34, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 } }, e.role?.includes("\u8FD0\u7EF4") ? "\u{1F6E1}\uFE0F" : e.role?.includes("\u7A0B\u5E8F") ? "\u{1F4BB}" : e.role?.includes("\u79D1\u5B66") ? "\u{1F52C}" : e.role?.includes("\u8BBE\u8BA1") ? "\u{1F3A8}" : "\u{1F916}"), /* @__PURE__ */ import_react3.default.createElement("div", { style: { minWidth: 0, flex: 1 } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ import_react3.default.createElement("span", { style: { fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, e.name), /* @__PURE__ */ import_react3.default.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", background: T[st.color], flexShrink: 0 } })), /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 10.5, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, e.role ?? "AI \u5458\u5DE5", " \xB7 ", e.taskCount ?? 0, " \u4EFB\u52A1")));
  }))), /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", flexDirection: "column", minWidth: 0, padding: "18px 22px", gap: 14, overflowY: "auto" } }, active ? /* @__PURE__ */ import_react3.default.createElement(import_react3.default.Fragment, null, /* @__PURE__ */ import_react3.default.createElement(EmployeeHeader, { emp: active, growth, status: empStatus, onChat: () => setTab("chat"), onDispatch: () => service?.control?.("run_once", null, {}, null).then(() => setToast("\u5DF2\u6D3E\u53D1")).catch(() => {
  }), onDelete: removeEmployee }), /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", gap: 2, borderBottom: `1px solid ${T.border}`, flexWrap: "wrap" } }, TABS.map((t) => /* @__PURE__ */ import_react3.default.createElement("button", { key: t.key, onClick: () => setTab(t.key), style: { padding: "9px 13px", fontSize: 13, border: "none", background: "transparent", color: tab === t.key ? T.accent : T.textMuted, borderBottom: `2px solid ${tab === t.key ? T.accent : "transparent"}`, cursor: "pointer", fontWeight: tab === t.key ? 600 : 400, fontFamily: T.fontBody } }, t.label))), /* @__PURE__ */ import_react3.default.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 2px" } }, tab === "experience" && /* @__PURE__ */ import_react3.default.createElement(ExperienceTab, { chat }), tab === "skills" && /* @__PURE__ */ import_react3.default.createElement(SkillsTab, { growth }), tab === "habits" && /* @__PURE__ */ import_react3.default.createElement(HabitsTab, null), tab === "thinking" && /* @__PURE__ */ import_react3.default.createElement(ThinkingTab, { thinking, onTask: (taskId) => service?.employeeThinking?.(activeId, taskId) }), tab === "chat" && /* @__PURE__ */ import_react3.default.createElement(ChatLogTab, { chat }), tab === "status" && /* @__PURE__ */ import_react3.default.createElement(StatusTab, { st: empStatus }), tab === "growth" && /* @__PURE__ */ import_react3.default.createElement(GrowthTab, { growth }))) : /* @__PURE__ */ import_react3.default.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: T.textMuted } }, /* @__PURE__ */ import_react3.default.createElement(Bot, { size: 40, color: T.textFaint }), /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 15 } }, "\u5DE6\u4FA7\u9009\u62E9\u6216\u521B\u5EFA\u4E00\u4E2A\u5458\u5DE5"))), active ? /* @__PURE__ */ import_react3.default.createElement("div", { style: { borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 12, padding: 14, minHeight: 0, background: T.panel } }, /* @__PURE__ */ import_react3.default.createElement(ChatPanel, { emp: active, chat, input, setInput, busy, send }), /* @__PURE__ */ import_react3.default.createElement(QuickActions, { emp: active, onPickWorkspace: pickWorkspace, onDispatch: () => service?.control?.("run_once", null, {}, null).then(() => setToast("\u5DF2\u6D3E\u53D1")).catch(() => {
  }), onDelete: removeEmployee })) : /* @__PURE__ */ import_react3.default.createElement("div", { style: { borderLeft: `1px solid ${T.border}`, padding: 14, color: T.textFaint, fontSize: 12 } }, "\u9009\u62E9\u5458\u5DE5\u540E\u663E\u793A\u5BF9\u8BDD\u533A")));
}
function CreateForm({ service, onDone, setToast, T, S: S2 }) {
  const [taskDesc, setTaskDesc] = (0, import_react3.useState)("");
  const [newName, setNewName] = (0, import_react3.useState)("");
  const [newCwd, setNewCwd] = (0, import_react3.useState)("");
  const [genPrompt, setGenPrompt] = (0, import_react3.useState)(null);
  const [soulBusy, setSoulBusy] = (0, import_react3.useState)(false);
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const genSoul = (0, import_react3.useCallback)(async () => {
    const t = taskDesc.trim();
    if (!t) {
      setToast("\u5148\u63CF\u8FF0\u5B83\u8981\u5E72\u4EC0\u4E48");
      return;
    }
    if (soulBusy) return;
    setSoulBusy(true);
    setToast("\u23F3 AI \u6B63\u5728\u6784\u601D\u7075\u9B42\u2026");
    try {
      const r = await service?.generateSoul?.(t);
      if (r?.ok && r.prompt) {
        setGenPrompt(r.prompt);
        setNewName(r.prompt.soul.identity.name || newName);
        setToast(`\u5DF2\u751F\u6210 ${r.prompt.soul.identity.role} \u7075\u9B42`);
      } else {
        const name = "\u5C0FAI";
        setNewName(name);
        const prompt = { schemaVersion: 1, soul: { identity: { name, role: "\u5168\u80FD\u5458\u5DE5", emoji: "", visual: {} }, description: t.slice(0, 60), mission: t.slice(0, 120), skills: [], persona: { tone: "\u6C89\u7A33", style: [], quirks: "" }, workflow: { planFirst: true, reportFrequency: "daily", escalation: "error-first", maxAutonomy: "handle-routine-escalate-risk" }, values: ["\u5982\u5B9E\u6C47\u62A5"], rules: [] }, limits: null, team: { role: "solo", mode: "solo", upstream: null, downstream: [], peers: [] }, meta: { modelHint: "fast", version: 1, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString(), source: "template" } };
        setGenPrompt(prompt);
        setToast(r?.reason ?? "AI \u751F\u6210\u5931\u8D25\uFF0C\u5DF2\u7528\u6A21\u677F");
      }
    } catch (e) {
      setToast(`\u751F\u6210\u5931\u8D25\uFF1A${String(e)}`);
    } finally {
      setSoulBusy(false);
    }
  }, [taskDesc, newName, soulBusy, service, setToast]);
  const create = (0, import_react3.useCallback)(async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setToast("\u23F3 \u521B\u5EFA\u5458\u5DE5\u2026");
    try {
      const r = await service?.createEmployee?.(name, newCwd.trim() || null, genPrompt ?? null);
      if (r?.ok) {
        setToast(`\u5DF2\u521B\u5EFA\u300C${r.worker.name}\u300D`);
        onDone();
      } else setToast(r?.reason ?? "\u521B\u5EFA\u5931\u8D25");
    } catch (e) {
      setToast(String(e));
    } finally {
      setBusy(false);
    }
  }, [newName, newCwd, genPrompt, busy, service, onDone, setToast]);
  return /* @__PURE__ */ import_react3.default.createElement("div", { style: { padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 6, borderBottom: `1px solid ${T.border}` } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 9, color: T.textFaint, fontWeight: 700 } }, "1 \u63CF\u8FF0\u4EFB\u52A1 \u203A 2 \u751F\u6210\u7075\u9B42 \u203A 3 \u9009\u5DE5\u4F5C\u533A \u203A 4 \u521B\u5EFA"), /* @__PURE__ */ import_react3.default.createElement("textarea", { value: taskDesc, onChange: (e) => setTaskDesc(e.target.value), rows: 2, placeholder: "\u5B83\u8981 7\xD724 \u5E72\u4EC0\u4E48\uFF1F\u5982\uFF1A\u76EF\u670D\u52A1\u5668\uFF0C\u78C1\u76D8\u6EE1\u6E05\u7406", style: { ...S2.input, resize: "none", fontSize: 12 } }), /* @__PURE__ */ import_react3.default.createElement("button", { onClick: genSoul, disabled: soulBusy, style: { ...S2.btn, justifyContent: "center", color: T.accent, opacity: soulBusy ? 0.5 : 1, cursor: soulBusy ? "wait" : "pointer" } }, soulBusy ? "\u23F3 \u6784\u601D\u4E2D\u2026" : "\u2728 AI \u751F\u6210\u7075\u9B42"), genPrompt && /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 10.5, color: T.textMuted, background: T.surface, borderRadius: 8, padding: "6px 9px", border: `1px solid ${T.border}`, lineHeight: 1.6 } }, /* @__PURE__ */ import_react3.default.createElement("b", { style: { color: T.accent } }, genPrompt.soul.identity.role), " \xB7 ", genPrompt.soul.identity.name, /* @__PURE__ */ import_react3.default.createElement("br", null), /* @__PURE__ */ import_react3.default.createElement("span", { style: { color: T.text } }, genPrompt.soul.description)), /* @__PURE__ */ import_react3.default.createElement("input", { value: newName, onChange: (e) => setNewName(e.target.value), placeholder: "\u540D\u5B57\uFF08\u53EF\u6539\uFF09", style: { ...S2.input, fontSize: 12 } }), /* @__PURE__ */ import_react3.default.createElement("input", { value: newCwd, onChange: (e) => setNewCwd(e.target.value), placeholder: "\u5DE5\u4F5C\u533A\u8DEF\u5F84\uFF08\u53EF\u9009\uFF0C\u6216\u7528\u53F3\u4FA7\u9009\u62E9\uFF09", style: { ...S2.input, fontSize: 11, fontFamily: T.fontMono } }), /* @__PURE__ */ import_react3.default.createElement("button", { onClick: create, disabled: busy || !newName.trim(), style: { ...S2.btnAccent, justifyContent: "center", opacity: busy || !newName.trim() ? 0.5 : 1, cursor: busy || !newName.trim() ? "not-allowed" : "pointer" } }, busy ? "\u23F3 \u521B\u5EFA\u4E2D\u2026" : "\u521B\u5EFA\u5458\u5DE5"));
}
function WorkerSettingsPanel({ service }) {
  const { T, S: S2 } = useTheme();
  const [status, setStatus] = (0, import_react3.useState)(null);
  (0, import_react3.useEffect)(() => {
    Promise.resolve(service?.getStatus?.()).then(setStatus).catch(() => {
    });
    const t = setInterval(() => Promise.resolve(service?.getStatus?.()).then(setStatus).catch(() => {
    }), 1e4);
    return () => clearInterval(t);
  }, [service]);
  const w = status?.status?.watcher ?? {};
  const row = (label, value) => /* @__PURE__ */ import_react3.default.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12.5 } }, /* @__PURE__ */ import_react3.default.createElement("span", { style: { width: 110, color: T.textMuted, flexShrink: 0 } }, label), /* @__PURE__ */ import_react3.default.createElement("span", { style: { color: T.text } }, value ?? "\u2014"));
  return /* @__PURE__ */ import_react3.default.createElement("div", { style: { padding: "16px 18px", fontFamily: T.fontBody, color: T.text, display: "flex", flexDirection: "column", gap: 12, maxWidth: 540 } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 14.5, fontWeight: 700 } }, "AI \u5458\u5DE5 \xB7 \u63D2\u4EF6\u72B6\u6001"), /* @__PURE__ */ import_react3.default.createElement("div", { style: { ...S2.card, padding: "4px 14px" } }, /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 11, color: T.textMuted, padding: "7px 0", textTransform: "uppercase", letterSpacing: ".05em" } }, "\u8FD0\u884C"), row("\u5FC3\u8DF3", w.alive === true ? "\u6B63\u5E38" : "\u5F02\u5E38"), row("\u964D\u7EA7", w.downgrade ?? "normal"), row("\u8FDE\u7EED\u5931\u8D25", w.consecutiveDispatchFailures ?? 0)), /* @__PURE__ */ import_react3.default.createElement("div", { style: { fontSize: 12, color: T.textMuted } }, "\u5458\u5DE5\u7BA1\u7406\u5728\u300CAI \u5DE5\u4F5C\u53F0\u300D\uFF08\u5DE6\u4FA7\u5E95\u90E8\u5165\u53E3\uFF09\u3002"));
}
var chipStyle = (T) => ({ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: T.textMuted, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: "2px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
var accBtn = (T) => ({ height: 32, padding: "0 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: T.accent, color: T.name === "dark" ? "#0f141c" : "#fff", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.fontBody });
var ghostBtn = (T) => ({ height: 32, padding: "0 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${T.borderStrong}`, background: "transparent", color: T.textMuted, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: T.fontBody });

// src/client.jsx
var inject = ["slots"];
function createWorkerHttpService() {
  const request = async (path, init) => {
    const res = await fetch(path, {
      headers: { accept: "application/json", ...init?.body !== void 0 ? { "content-type": "application/json" } : {} },
      ...init
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
    subscribe: () => () => {
    },
    // MVP: 无 push, 面板 5s 轮询
    control: async (action, id, extra = {}, workerId) => {
      const q = workerId ? `?worker=${encodeURIComponent(workerId)}` : "";
      const payload = await request(`/continuous-worker/control${q}`, {
        method: "POST",
        body: JSON.stringify({ action, id, extra })
      });
      return payload;
    },
    // UI v4: 用户↔AGI 交流 — 工作台指令投递给 agent.
    instruct: async (text, workerId) => {
      const q = workerId ? `?worker=${encodeURIComponent(workerId)}` : "";
      const payload = await request(`/continuous-worker/instruct${q}`, {
        method: "POST",
        body: JSON.stringify({ text })
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
        body: JSON.stringify({ provider, model })
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
        body: JSON.stringify({ name, cwd, prompt: prompt ?? void 0 })
      });
      return payload;
    },
    instructEmployee: async (id, text) => {
      const payload = await request("/continuous-worker/employees/instruct", {
        method: "POST",
        body: JSON.stringify({ id, text })
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
        body: JSON.stringify({ cwd })
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
        body: JSON.stringify({ name, value })
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
        body: JSON.stringify({ task })
      });
      return payload;
    }
  };
}
function BotIcon({ size = 18 }) {
  return /* @__PURE__ */ import_react4.default.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ import_react4.default.createElement("rect", { x: "4", y: "8", width: "16", height: "12", rx: "3" }), /* @__PURE__ */ import_react4.default.createElement("path", { d: "M12 4v4M9 13h.01M15 13h.01" }), /* @__PURE__ */ import_react4.default.createElement("circle", { cx: "9", cy: "13", r: "0.5", fill: "currentColor" }), /* @__PURE__ */ import_react4.default.createElement("circle", { cx: "15", cy: "13", r: "0.5", fill: "currentColor" }), /* @__PURE__ */ import_react4.default.createElement("path", { d: "M9 16h6" }));
}
function BackIcon({ size = 18 }) {
  return /* @__PURE__ */ import_react4.default.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, /* @__PURE__ */ import_react4.default.createElement("path", { d: "M19 12H5M12 19l-7-7 7-7" }));
}
function WorkerSidebarAction({ wide }) {
  const [open, setOpen] = (0, import_react4.useState)(false);
  const service = createWorkerHttpService();
  if (!open) {
    return /* @__PURE__ */ import_react4.default.createElement(
      "button",
      {
        onClick: () => setOpen(true),
        title: "AI \u5DE5\u4F5C\u53F0 \u2014 \u67E5\u770B\u4E0E\u6307\u6325\u4F60\u7684\u6301\u7EED\u8FD0\u884C AI \u5458\u5DE5",
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 10px",
          background: "transparent",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          color: "inherit",
          fontSize: 13,
          textAlign: "left"
        }
      },
      /* @__PURE__ */ import_react4.default.createElement(BotIcon, { size: wide ? 16 : 18 }),
      wide && /* @__PURE__ */ import_react4.default.createElement("span", null, "AI \u5DE5\u4F5C\u53F0")
    );
  }
  return /* @__PURE__ */ import_react4.default.createElement(
    "div",
    {
      style: {
        // 覆盖内容区而非整个窗口: 顶部留 ~44px 给窗口标题栏 (避免与桌面版
        // 关闭按钮重合), 不覆盖左侧栏 (left: 0 起, 侧边栏在其上层)。
        position: "fixed",
        top: 44,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9998,
        background: "#f7f7f8",
        // 固定不透明 (var(--dsh-bg) 可能透明导致 DSH 主界面透出)
        display: "flex",
        flexDirection: "column",
        boxShadow: "-8px 0 24px rgba(0,0,0,.12)",
        borderTop: "1px solid rgba(127,127,127,.15)"
      }
    },
    /* @__PURE__ */ import_react4.default.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderBottom: "1px solid rgba(127,127,127,.18)",
          background: "rgba(127,127,127,.04)"
        }
      },
      /* @__PURE__ */ import_react4.default.createElement(
        "button",
        {
          onClick: () => setOpen(false),
          title: "\u8FD4\u56DE\u4E3B\u754C\u9762",
          style: {
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "6px 10px",
            border: "none",
            background: "transparent",
            borderRadius: 8,
            cursor: "pointer",
            color: "inherit",
            fontSize: 13
          }
        },
        /* @__PURE__ */ import_react4.default.createElement(BackIcon, { size: 16 }),
        /* @__PURE__ */ import_react4.default.createElement("span", null, "\u8FD4\u56DE")
      ),
      /* @__PURE__ */ import_react4.default.createElement("span", { style: { width: 1, height: 18, background: "rgba(127,127,127,.2)", margin: "0 6px" } }),
      /* @__PURE__ */ import_react4.default.createElement(BotIcon, { size: 16 }),
      /* @__PURE__ */ import_react4.default.createElement("strong", { style: { fontSize: 14 } }, "AI \u5DE5\u4F5C\u53F0"),
      /* @__PURE__ */ import_react4.default.createElement("span", { style: { marginLeft: "auto", fontSize: 12, color: "rgba(127,127,127,.55)" } }, "\u6301\u7EED\u8FD0\u884C\u7684 AI \u5458\u5DE5 \u2014 \u4EFB\u52A1 / \u9884\u7B97 / \u5065\u5EB7 / \u8D23\u4EFB")
    ),
    /* @__PURE__ */ import_react4.default.createElement("div", { style: { flex: 1, overflow: "auto" } }, /* @__PURE__ */ import_react4.default.createElement(WorkbenchBoundary, null, /* @__PURE__ */ import_react4.default.createElement(WorkerDashboard, { service })))
  );
}
var WorkbenchBoundary = class extends import_react4.default.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("[dsh-continuous-worker] workbench render failed:", error, info?.componentStack ?? "");
  }
  render() {
    if (this.state.error) {
      return /* @__PURE__ */ import_react4.default.createElement("div", { style: { padding: 24, fontSize: 13, lineHeight: 1.7, color: "#b91c1c" } }, /* @__PURE__ */ import_react4.default.createElement("strong", null, "\u5DE5\u4F5C\u53F0\u6E32\u67D3\u5931\u8D25\uFF1A"), /* @__PURE__ */ import_react4.default.createElement("pre", { style: { whiteSpace: "pre-wrap", marginTop: 8 } }, String(this.state.error?.message ?? this.state.error)), /* @__PURE__ */ import_react4.default.createElement("button", { onClick: () => this.setState({ error: null }), style: { marginTop: 12, padding: "6px 14px", border: "1px solid #999", background: "#fff", cursor: "pointer" } }, "\u91CD\u8BD5"));
    }
    return this.props.children;
  }
};
function apply(ctx) {
  const service = createWorkerHttpService();
  ctx.slots.inject(
    "sidebar.footer.action",
    () => ctx.slots.register(
      {
        name: "sidebar.footer.action",
        id: "continuous-worker",
        priority: 0
      },
      WorkerSidebarAction
    )
  );
  ctx.slots.inject(
    "settings.section",
    () => ctx.slots.register(
      {
        name: "settings.section",
        id: "continuous-worker",
        order: 200,
        label: () => "AI \u5458\u5DE5",
        inject: () => ({ service })
      },
      WorkerSettingsPanel
    )
  );
}
/**
 * @license lucide-react v0.468.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */

    return module.exports;
  },
});
