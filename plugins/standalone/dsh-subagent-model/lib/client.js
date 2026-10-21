window.__ModuleLoader__.load({
  id: "dsh-subagent-model",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");
    let react_jsx_runtime = require("react/jsx-runtime");

    /**
     * dsh-subagent-model — a read-only [provider/model] badge in subagent
     * session composers. The official model-selection seat is gated off for
     * addressed subagents (single slot, returns null without relinquishing),
     * so this plugin mounts the ADJACENT list slot conversation.input.right
     * and renders only when sessions.subagentAddress(sessionId) is set.
     *
     * Runtime contract notes (rc.8, learned from dsh-fork-to-preset):
     *   - slot inject must be a session-scoped factory function
     *   - jsx(type, props): props must NEVER be undefined/null
     *   - no react.Fragment via require("react"); use wrapper spans
     */
    const NS = "dsh-subagent-model";
    const en = {
      label: "Subagent model",
      live: "live",
      cold: "session ended",
      na: "model n/a",
      loading: "…",
    };
    const zh = {
      label: "子代理模型",
      live: "运行中",
      cold: "会话已结束",
      na: "模型不可用",
      loading: "…",
    };

    const STYLE_ID = "dsh-subagent-model-style";
    const CSS = [
      ".smm-badge{position:relative;display:inline-flex;align-items:center;height:22px;",
      "min-width:0;max-width:100%;flex:0 1 auto;padding:0 8px;",
      "border:1px solid color-mix(in srgb,currentColor 26%,transparent);border-radius:6px;",
      "font-size:11px;line-height:1;color:inherit;white-space:nowrap;",
      "transition:border-color .15s ease;}",
      ".smm-badge:hover{border-color:color-mix(in srgb,currentColor 50%,transparent);}",
      ".smm-dot{width:6px;height:6px;border-radius:50%;flex:none;margin-right:5px;",
      "background:color-mix(in srgb,currentColor 40%,transparent);}",
      ".smm-live .smm-dot{background:#3fb950;}",
      ".smm-cold{opacity:.55;}",
      ".smm-text{overflow:hidden;text-overflow:ellipsis;max-width:clamp(80px,14vw,180px);}",
      ".smm-hint{opacity:.65;margin-left:4px;font-size:10px;}",
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

    function SubagentModelSeat({ sessionId, isSubagent, readModel, t }) {
      const [state, setState] = react.useState({ phase: "loading" });

      // Main-thread / ordinary sessions: yield entirely to the official
      // model-selection seat (conditional mutual exclusion by design).
      if (!isSubagent) return null;

      // Late-response race guard: only accept the result for the session that
      // is still mounted. The closure pins this component's sessionId.
      react.useEffect(() => {
        let alive = true;
        setState({ phase: "loading" });
        readModel(sessionId).then((info) => {
          if (!alive || !info) return;
          if (info && info.live && info.model) {
            setState({ phase: "ready", provider: info.provider, model: info.model });
          } else if (info && info.live === false && info.reason === "no-live-agent") {
            setState({ phase: "cold" });
          } else {
            setState({ phase: "unavailable", reason: info ? info.reason : null });
          }
        }).catch(() => {
          if (alive) setState({ phase: "unavailable", reason: null });
        });
        return () => { alive = false };
      }, [sessionId, readModel]);

      if (state.phase === "loading") {
        return react_jsx_runtime.jsx("span", { className: "smm-badge smm-loading", title: t("label"), children: t("loading") });
      }
      if (state.phase === "ready") {
        const text = (state.provider ? state.provider + " / " : "") + (state.model || "?");
        return react_jsx_runtime.jsx("span", { className: "smm-badge smm-live", title: t("label"), children:
          react_jsx_runtime.jsx("span", { className: "smm-text", children: text })
        });
      }
      if (state.phase === "cold") {
        return react_jsx_runtime.jsx("span", { className: "smm-badge smm-cold", title: t("cold"), children:
          react_jsx_runtime.jsx("span", { className: "smm-text", children: t("cold") })
        });
      }
      return react_jsx_runtime.jsx("span", { className: "smm-badge smm-cold", title: String(state.reason || t("na")), children:
        react_jsx_runtime.jsx("span", { className: "smm-text", children: t("na") })
      });
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), "subagent-model: locale");
      ensureStyle();
      const sessions = ctx.sessions;
      // Session-scoped slots call `inject(sessionId)` per mounted session.
      const modelActions = (sessionId) => ({
        readModel: (sid) => fetch("/subagent-model/read", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: sid }),
        }).then((r) => r.json()).catch(() => ({ live: false, reason: "fetch-failed" })),
        // Conditional exclusion: render only for ADDRESSED subagent sessions.
        isSubagent: sessions.subagentAddress(sessionId) !== void 0,
      });
      ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
        name: "conversation.input.right",
        id: "subagent-model",
        order: 90,
        locale: NS,
        inject: modelActions,
      }, SubagentModelSeat));
    }
    exports.apply = apply;
    exports.inject = ["slots", "locale", "sessions"];
    return module.exports;
  }
});
