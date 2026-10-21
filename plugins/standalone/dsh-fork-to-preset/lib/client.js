window.__ModuleLoader__.load({
  id: "dsh-fork-to-preset",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    let react_jsx_runtime = require("react/jsx-runtime");

    /**
     * dsh-fork-to-preset — a compact pill in every conversation's header:
     [branch icon | preset select | Fork button]. Forks the current session
     * into a chosen agent preset (a fresh independent main thread that
     * inherits the source's completed turns). Requires the patched
     * `session.fork` (agentPreset) on both the host apiproxy and client-runtime.
     *
     * Layout robustness: the pill is one shrinkable flex unit (min-width:0);
     * a ResizeObserver on the parent adds `.f2p-tight` when space runs out,
     * and media queries progressively drop the button label, narrow the
     * select, then hide the decorative icon — no wrap, no overlap, no clip.
     */
    const NS = "dsh-fork-to-preset";
    const en = {
      label: "Fork to preset",
      short: "Fork",
      placeholder: "Choose preset…",
      loading: "Loading presets…",
      error: "Could not load agent presets.",
      success: "Forked into a new session.",
      fail: "Fork failed.",
    };
    const zh = {
      label: "分叉到 preset",
      short: "分叉",
      placeholder: "选择 preset…",
      loading: "加载 presets…",
      error: "无法加载 agent presets。",
      success: "已分叉为新会话。",
      fail: "分叉失败。",
    };

    const STYLE_ID = "dsh-fork-to-preset-style";
    const CSS = [
      ".f2p-group{position:relative;display:inline-flex;align-items:center;height:24px;",
      "min-width:0;max-width:100%;flex:0 1 auto;vertical-align:middle;",
      "border:1px solid color-mix(in srgb,currentColor 28%,transparent);border-radius:7px;",
      "transition:border-color .15s ease,box-shadow .15s ease;}",
      ".f2p-group:hover{border-color:color-mix(in srgb,currentColor 52%,transparent);}",
      ".f2p-group:focus-within{border-color:color-mix(in srgb,currentColor 68%,transparent);",
      "box-shadow:0 0 0 2px color-mix(in srgb,currentColor 12%,transparent);}",
      ".f2p-icon{display:inline-flex;align-items:center;justify-content:center;width:20px;height:100%;",
      "flex:none;opacity:.72;pointer-events:none;}",
      ".f2p-sep{width:1px;height:13px;flex:none;background:color-mix(in srgb,currentColor 24%,transparent);}",
      ".f2p-select{appearance:none;-webkit-appearance:none;height:100%;min-width:0;flex:0 1 auto;",
      "max-width:clamp(92px,17vw,168px);padding:0 15px 0 5px;margin:0;",
      "font-size:12px;line-height:1;color:inherit;font-family:inherit;",
      "background:transparent url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\") no-repeat right 4px center/8px 5px;",
      "border:none;outline:none;text-overflow:ellipsis;white-space:nowrap;overflow:hidden;cursor:pointer;}",
      ".f2p-select:disabled{cursor:default;opacity:.55;}",
      ".f2p-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:100%;",
      "padding:0 9px;flex:none;font-size:12px;line-height:1;color:inherit;font-family:inherit;",
      "background:color-mix(in srgb,currentColor 9%,transparent);cursor:pointer;",
      "border:none;border-left:1px solid color-mix(in srgb,currentColor 20%,transparent);",
      "border-radius:0 6px 6px 0;transition:background .15s ease,opacity .15s ease;}",
      ".f2p-btn:hover:not(:disabled){background:color-mix(in srgb,currentColor 17%,transparent);}",
      ".f2p-btn:active:not(:disabled){background:color-mix(in srgb,currentColor 26%,transparent);}",
      ".f2p-btn:disabled{opacity:.45;cursor:default;}",
      ".f2p-btn:focus-visible,.f2p-select:focus-visible{outline:none;}",
      ".f2p-btn-inner{display:inline-flex;align-items:center;gap:4px;line-height:1;}",
      ".f2p-svg-wrap{display:inline-flex;align-items:center;pointer-events:none;}",
      ".f2p-ok{font-weight:700;letter-spacing:.5px;}",
      ".f2p-spin{width:10px;height:10px;border-radius:50%;flex:none;",
      "border:1.5px solid color-mix(in srgb,currentColor 30%,transparent);border-top-color:currentColor;",
      "animation:f2p-rot .7s linear infinite;}",
      "@keyframes f2p-rot{to{transform:rotate(360deg)}}",
      ".f2p-err{position:absolute;top:calc(100% + 6px);right:0;z-index:60;",
      "max-width:min(320px,70vw);padding:5px 9px;border-radius:6px;",
      "font-size:11px;line-height:1.5;color:CanvasText;text-align:left;",
      "background:color-mix(in srgb,Canvas 93%,currentColor);",
      "border:1px solid color-mix(in srgb,currentColor 25%,transparent);",
      "box-shadow:0 4px 14px rgba(0,0,0,.22);animation:f2p-in .16s ease;",
      "white-space:normal;word-break:break-word;pointer-events:none;}",
      "@keyframes f2p-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}",
      /* progressive squeeze: media queries as the coarse pass … */
      "@media (max-width:1180px){.f2p-btn .f2p-label{display:none}.f2p-btn{padding:0 7px}}",
      "@media (max-width:900px){.f2p-select{max-width:112px}}",
      "@media (max-width:640px){.f2p-select{max-width:86px}.f2p-icon,.f2p-sep{display:none}.f2p-select{padding-left:7px}}",
      /* … and the ResizeObserver fine pass (.f2p-tight on measured parent width) */
      ".f2p-tight .f2p-btn .f2p-label{display:none}.f2p-tight .f2p-btn{padding:0 7px}",
      ".f2p-tight .f2p-select{max-width:104px}",
    ].join("");

    function ensureStyle() {
      if (typeof document === "undefined") return;
      if (!document.getElementById(STYLE_ID)) {
        const st = document.createElement("style");
        st.id = STYLE_ID;
        st.textContent = CSS;
        document.head.appendChild(st);
      }
    }

    const BRANCH_SVG = '<svg class="f2p-svg" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="4" cy="3.5" r="1.7"/><circle cx="4" cy="12.5" r="1.7"/><circle cx="12" cy="3.5" r="1.7"/><path d="M4 5.2v5.6M12 5.2v1.2c0 1.6-1.3 2.7-2.9 2.7H5.9"/></svg>';

    function BranchIcon() {
      return react_jsx_runtime.jsx("span", {
        className: "f2p-svg-wrap",
        dangerouslySetInnerHTML: { __html: BRANCH_SVG },
      });
    }

    function Spinner() {
      return react_jsx_runtime.jsx("span", { className: "f2p-spin", "aria-hidden": true });
    }

    function ForkToPresetAction({ sessionId, listPresets, toPreset, t }) {
      const [presets, setPresets] = react.useState(null); // null = loading, array = loaded
      const [preset, setPreset] = react.useState("");
      const [busy, setBusy] = react.useState(false);
      const [done, setDone] = react.useState(false);
      const [err, setErr] = react.useState(null);
      const groupRef = react.useRef(null);
      const errTimer = react.useRef(null);

      // Fine-grained squeeze: watch the PARENT's real available width and flag
      // the pill tight when it can no longer fit comfortably. Works even when
      // media queries lie (split panes, docked sidebars, zoom).
      react.useEffect(() => {
        const el = groupRef.current;
        if (!el || typeof ResizeObserver === "undefined") return undefined;
        const target = el.parentElement || el;
        const ro = new ResizeObserver(() => {
          const w = target.clientWidth || 0;
          el.classList.toggle("f2p-tight", w > 0 && w < 250);
        });
        ro.observe(target);
        return () => ro.disconnect();
      }, []);

      react.useEffect(() => () => {
        if (errTimer.current) clearTimeout(errTimer.current);
      }, []);

      const showError = react.useCallback((msg) => {
        setErr(msg);
        if (errTimer.current) clearTimeout(errTimer.current);
        errTimer.current = setTimeout(() => setErr(null), 6000);
      }, []);

      const load = react.useCallback(() => {
        setPresets(null);
        return listPresets().then((list) => {
          setPresets(list || []);
          setErr(null);
          if (list && list.length) setPreset((p) => p || list[0].id);
        }).catch((e) => {
          setPresets([]);
          showError(String((e && e.message) ? e.message : e) || t("error"));
        });
      }, [listPresets, showError, t]);
      react.useEffect(() => { load(); }, [load]);

      const runFork = () => {
        if (!preset || busy || done || !sessionId) return;
        setBusy(true);
        setErr(null);
        toPreset(sessionId, preset).then((ok) => {
          setBusy(false);
          if (ok) {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          } else {
            showError(t("fail"));
          }
        }).catch((e) => {
          setBusy(false);
          showError(String((e && e.message) ? e.message : e));
        });
      };

      return react_jsx_runtime.jsxs("span", {
        ref: groupRef,
        className: "f2p-group",
        title: err || t("label"),
        children: [
          react_jsx_runtime.jsx("span", { className: "f2p-icon", children: react_jsx_runtime.jsx(BranchIcon, {}) }),
          react_jsx_runtime.jsx("span", { className: "f2p-sep", "aria-hidden": true }),
          react_jsx_runtime.jsx("select", {
            className: "f2p-select",
            value: preset,
            onChange: (e) => setPreset(e.target.value),
            disabled: presets === null || busy,
            "aria-label": t("placeholder"),
            children: presets === null
              ? react_jsx_runtime.jsx("option", { value: "", children: t("loading") })
              : (presets || []).map((p) => react_jsx_runtime.jsx("option", { value: p.id, children: p.name || p.id }, p.id)),
          }),
          react_jsx_runtime.jsx("button", {
            type: "button",
            className: "f2p-btn",
            onClick: runFork,
            disabled: busy || done || !preset || !sessionId,
            "aria-label": t("label"),
            children: busy
              ? react_jsx_runtime.jsx(Spinner, {})
              : done
                ? react_jsx_runtime.jsx("span", { className: "f2p-ok", children: "\u2713" })
                : react_jsx_runtime.jsxs("span", {
                    className: "f2p-btn-inner",
                    children: [
                      react_jsx_runtime.jsx(BranchIcon, {}),
                      react_jsx_runtime.jsx("span", { className: "f2p-label", children: t("short") }),
                    ],
                  }),
          }),
          err ? react_jsx_runtime.jsx("span", { className: "f2p-err", role: "alert", children: err }) : null,
        ],
      });
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), "fork-to-preset: locale");
      ensureStyle();
      const sessions = ctx.sessions;
      // Session-scoped slots call `inject(sessionId)` for every mounted session.
      // Passing a plain object makes the rc.8 renderer throw before the component
      // can mount, so expose the actions through the required factory shape.
      const forkActions = (_sessionId) => ({
        listPresets: () => fetch("/fork-to-preset/presets", { method: "POST", headers: { "content-type": "application/json" } })
          .then((r) => r.json())
          .then((data) => (data && data.presets) || [])
          .catch(() => []),
        toPreset: async (sessionId, agentPreset) => {
          // The public client-runtime API resolves directly to the child id.
          const childId = await sessions.fork({ sessionId, agentPreset, increaseTitle: true });
          if (!childId) return false;
          sessions.open(childId);
          return true;
        },
      });
      ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
        name: "conversation.session.header.actions",
        id: "fork-to-preset",
        order: 5,
        locale: NS,
        inject: forkActions,
      }, ForkToPresetAction));
    }
    exports.apply = apply;
    exports.inject = ["slots", "locale", "sessions"];
    return module.exports;
  }
});
