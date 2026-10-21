window.__ModuleLoader__.load({
	id: "dsh-full-remote",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-full-remote-css:/home/runner/work/dsh-full-remote/dsh-full-remote/src/client/remote.module.css.mjs
		const css$1 = ".RbypWW_copyField,.RbypWW_secondaryButton,.RbypWW_textButton,.RbypWW_primaryButton,.RbypWW_dangerButton{font:inherit;touch-action:manipulation}.RbypWW_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}.RbypWW_title{margin:0;font-size:18px;font-weight:600;line-height:1.3}.RbypWW_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:13px;line-height:1.5}.RbypWW_hero{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;display:flex}.RbypWW_heroMain{align-items:center;gap:10px;min-width:0;display:flex}.RbypWW_brand{background:var(--dsw-alias-interactive-bg-hover);width:28px;height:28px;color:var(--dsw-alias-label-tertiary);border-radius:8px;flex:none;place-items:center;display:grid}.RbypWW_brand[data-online=true]{color:var(--dsw-alias-state-success-primary)}.RbypWW_heroCopy{min-width:0}.RbypWW_heroCopy strong{font-size:14px;font-weight:500;line-height:22px;display:block}.RbypWW_heroActions .RbypWW_primaryButton,.RbypWW_heroActions .RbypWW_dangerButton,.RbypWW_heroActions .RbypWW_secondaryButton{flex:none;align-self:center}.RbypWW_heroActions{flex-wrap:wrap;justify-content:flex-end;gap:8px;display:flex}.RbypWW_qr{width:min(100%,180px);margin-top:8px}.RbypWW_qr svg{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;width:100%;height:auto;display:block}.RbypWW_inviteUrl{overflow-wrap:anywhere;font-size:12px;display:block}.RbypWW_group{flex-direction:column;gap:8px;min-width:0;display:flex}.RbypWW_groupHead{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;font-weight:600}.RbypWW_badge{border:1px solid color-mix(in srgb, var(--dsw-alias-state-warn-label,#c48a00) 45%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-warn-label,#c48a00) 14%, transparent);color:var(--dsw-alias-state-warn-label,#8a5a00);vertical-align:1px;border-radius:999px;margin-left:6px;padding:1px 7px;font-size:11px;font-weight:600;line-height:16px;display:inline-block}.RbypWW_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.RbypWW_listenRow{grid-template-columns:minmax(0,1fr) 104px auto;align-items:end;gap:10px;display:grid}.RbypWW_listenRow>.RbypWW_secondaryButton{align-self:end;height:34px}.RbypWW_field{flex-direction:column;gap:6px;min-width:0;display:flex}.RbypWW_field>span{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}.RbypWW_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);width:100%;height:34px;color:var(--dsw-alias-label-primary);font:inherit;border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}.RbypWW_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}.RbypWW_warn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);border-radius:8px;margin:0;padding:8px 10px;font-size:12px;line-height:1.5}.RbypWW_copyField{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);width:100%;min-height:34px;color:inherit;text-align:left;cursor:pointer;border-radius:8px;justify-content:space-between;align-items:center;gap:12px;padding:6px 12px;display:flex}.RbypWW_copyField code{overflow-wrap:anywhere;min-width:0;font-size:12px}.RbypWW_copyField span{color:var(--dsw-alias-label-secondary);flex:none;font-size:12px;font-weight:500}.RbypWW_secondaryButton,.RbypWW_primaryButton,.RbypWW_dangerButton{appearance:none;cursor:pointer;border:1px solid #0000;border-radius:8px;align-self:flex-start;padding:5px 14px;font-size:13px;font-weight:500;line-height:1.5}.RbypWW_secondaryButton{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.RbypWW_secondaryButton:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.RbypWW_primaryButton{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.RbypWW_dangerButton{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:0 0}.RbypWW_textButton{min-height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;flex:none;align-self:center;padding:0;font-size:12px;line-height:1.5}.RbypWW_textButton:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.RbypWW_tokenRow{flex-wrap:wrap;align-items:center;gap:12px;min-width:0;display:flex}.RbypWW_tokenActions{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.RbypWW_tokenRow>.RbypWW_copyField{flex:1;width:auto}.RbypWW_toast{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:8px;align-items:flex-start;gap:10px;padding:10px 8px 10px 12px;display:flex}.RbypWW_toastBody{flex:1;min-width:0}.RbypWW_toastBody strong{font-size:12px;font-weight:600;line-height:18px;display:block}.RbypWW_toastBody p{margin:4px 0 0;font-size:13px;line-height:20px}.RbypWW_toastError{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, var(--dsw-alias-bg-layer-3))}.RbypWW_toastWarn{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-label,#c48a00) 55%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-state-warn-label,#c48a00) 12%, var(--dsw-alias-bg-layer-3))}.RbypWW_toastSuccess{border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 55%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, var(--dsw-alias-bg-layer-3))}.RbypWW_toastDismiss{width:28px;height:28px;color:inherit;cursor:pointer;background:0 0;border:0;border-radius:8px;flex:none;margin-top:-4px;font-size:18px;line-height:1}.RbypWW_toastDismiss:hover{background:var(--dsw-alias-interactive-bg-hover)}@media (prefers-reduced-motion:no-preference){.RbypWW_toast{animation:.16s ease-out RbypWW_toast-in}@keyframes RbypWW_toast-in{0%{opacity:0;transform:translateY(-4px)}}}button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}button:disabled{cursor:not-allowed;opacity:.4}.RbypWW_emptyText{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.RbypWW_deviceList{flex-direction:column;gap:8px;margin:0;padding:0;list-style:none;display:flex}.RbypWW_deviceItem{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px;padding:10px 12px;display:flex}.RbypWW_deviceInfo{flex-wrap:wrap;align-items:center;gap:6px;min-width:0;display:flex}.RbypWW_deviceInfo strong{text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;overflow:hidden}.RbypWW_deviceMeta{color:var(--dsw-alias-label-tertiary);flex-basis:100%;font-size:12px}.RbypWW_pendingBadge,.RbypWW_onlineBadge{white-space:nowrap;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500}.RbypWW_onlineBadge{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent)}.RbypWW_pendingBadge{color:var(--dsw-alias-state-warn-label,#8a5a00);background:color-mix(in srgb, var(--dsw-alias-state-warn-label,#c48a00) 14%, transparent)}.RbypWW_deviceActions{flex-shrink:0;gap:8px;padding-top:2px;display:flex}.RbypWW_deviceRename{flex-wrap:wrap;align-items:center;gap:8px;min-width:min(100%,220px);display:flex}.RbypWW_deviceRename .RbypWW_input{flex:1;min-width:10em}.RbypWW_auditRow{grid-template-columns:minmax(0,1fr) 104px;align-items:end;gap:10px;display:grid}.RbypWW_auditActions{flex-wrap:wrap;gap:8px;display:flex}.RbypWW_auditList{flex-direction:column;gap:8px;margin:12px 0 0;padding:0;list-style:none;display:flex}.RbypWW_auditItem{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;padding:10px 12px}.RbypWW_auditItem code{color:var(--dsw-alias-label-tertiary);font-size:12px}.RbypWW_auditItem strong{margin-top:2px;font-size:13px;font-weight:600;display:block}.RbypWW_auditDetail{background:var(--dsw-alias-bg-layer-2);white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-secondary);border-radius:8px;margin:8px 0 0;padding:8px;font-size:11px;line-height:1.5}@media (width<=560px){.RbypWW_hero{flex-wrap:wrap}.RbypWW_heroActions{width:100%}.RbypWW_heroActions .RbypWW_primaryButton,.RbypWW_heroActions .RbypWW_dangerButton,.RbypWW_heroActions .RbypWW_secondaryButton{flex:auto}.RbypWW_listenRow{grid-template-columns:minmax(0,1fr) 104px}.RbypWW_listenRow>.RbypWW_secondaryButton{grid-column:1/-1;width:100%}.RbypWW_deviceActions{justify-content:flex-end;width:100%;padding-top:0}.RbypWW_deviceRename{width:100%}.RbypWW_auditRow{grid-template-columns:minmax(0,1fr)}}";
		const tagId$1 = "dsh-full-remote/remote.module.css";
		if (typeof document !== "undefined" && !document.querySelector(`style[data-plugin-css="${tagId$1}"]`)) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-full-remote";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var remote_module_css_default = {
			"groupHead": "RbypWW_groupHead",
			"toastError": "RbypWW_toastError",
			"toastDismiss": "RbypWW_toastDismiss",
			"toastSuccess": "RbypWW_toastSuccess",
			"pendingBadge": "RbypWW_pendingBadge",
			"warn": "RbypWW_warn",
			"toastWarn": "RbypWW_toastWarn",
			"deviceMeta": "RbypWW_deviceMeta",
			"inviteUrl": "RbypWW_inviteUrl",
			"input": "RbypWW_input",
			"emptyText": "RbypWW_emptyText",
			"primaryButton": "RbypWW_primaryButton",
			"auditItem": "RbypWW_auditItem",
			"textButton": "RbypWW_textButton",
			"deviceList": "RbypWW_deviceList",
			"tokenRow": "RbypWW_tokenRow",
			"deviceInfo": "RbypWW_deviceInfo",
			"deviceRename": "RbypWW_deviceRename",
			"badge": "RbypWW_badge",
			"section": "RbypWW_section",
			"copyField": "RbypWW_copyField",
			"secondaryButton": "RbypWW_secondaryButton",
			"deviceActions": "RbypWW_deviceActions",
			"auditActions": "RbypWW_auditActions",
			"heroCopy": "RbypWW_heroCopy",
			"brand": "RbypWW_brand",
			"heroActions": "RbypWW_heroActions",
			"hint": "RbypWW_hint",
			"group": "RbypWW_group",
			"title": "RbypWW_title",
			"toastBody": "RbypWW_toastBody",
			"listenRow": "RbypWW_listenRow",
			"field": "RbypWW_field",
			"auditRow": "RbypWW_auditRow",
			"deviceItem": "RbypWW_deviceItem",
			"heroMain": "RbypWW_heroMain",
			"onlineBadge": "RbypWW_onlineBadge",
			"toast": "RbypWW_toast",
			"qr": "RbypWW_qr",
			"dangerButton": "RbypWW_dangerButton",
			"intro": "RbypWW_intro",
			"tokenActions": "RbypWW_tokenActions",
			"hero": "RbypWW_hero",
			"toast-in": "RbypWW_toast-in",
			"auditDetail": "RbypWW_auditDetail",
			"auditList": "RbypWW_auditList"
		};
		//#endregion
		//#region src/client/DevicesSection.tsx
		/**
		* DevicesSection — connected-device management inside the settings page.
		*
		* Pure presentational slice: renders the session list (online / pending)
		* and delegates every action through the passed callbacks. Polling and API
		* state live in RemoteSection.
		*/
		function DevicesSection({ sessions, approvalMode, busy, t, onKick, onDecide, onRename }) {
			const [renamingId, setRenamingId] = (0, react.useState)();
			const [draft, setDraft] = (0, react.useState)("");
			const beginRename = (session) => {
				setRenamingId(session.id);
				setDraft(session.label);
			};
			const cancelRename = () => {
				setRenamingId(void 0);
				setDraft("");
			};
			const submitRename = (id) => {
				const next = draft.trim();
				if (next === "") return;
				onRename(id, next);
				cancelRename();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: remote_module_css_default.group,
				"data-shot": "devices",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: remote_module_css_default.groupHead,
						children: t("devices.title")
					}),
					approvalMode && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: remote_module_css_default.hint,
						children: t("devices.approvalHint")
					}),
					sessions.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: remote_module_css_default.emptyText,
						children: t("devices.empty")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: remote_module_css_default.deviceList,
						children: sessions.map((session) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: remote_module_css_default.deviceItem,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: remote_module_css_default.deviceInfo,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: session.label }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: session.status === "pending" ? remote_module_css_default.pendingBadge : remote_module_css_default.onlineBadge,
										children: session.status === "pending" ? t("devices.pending") : t("devices.active")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: remote_module_css_default.deviceMeta,
										children: t("devices.lastSeen", { time: new Date(session.lastSeenAt).toLocaleString() })
									}),
									session.lastSeenIp !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: remote_module_css_default.deviceMeta,
										children: t("devices.lastSeenIp", { ip: session.lastSeenIp })
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: remote_module_css_default.deviceActions,
								children: session.status === "pending" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: remote_module_css_default.textButton,
									type: "button",
									disabled: busy,
									"aria-label": `${t("devices.approve")}: ${session.label}`,
									onClick: () => {
										onDecide(session.id, true);
									},
									children: t("devices.approve")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: remote_module_css_default.textButton,
									type: "button",
									disabled: busy,
									"aria-label": `${t("devices.reject")}: ${session.label}`,
									onClick: () => {
										onDecide(session.id, false);
									},
									children: t("devices.reject")
								})] }) : renamingId === session.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
									className: remote_module_css_default.deviceRename,
									onSubmit: (event) => {
										event.preventDefault();
										submitRename(session.id);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: remote_module_css_default.input,
											value: draft,
											maxLength: 64,
											disabled: busy,
											"aria-label": t("devices.renamePrompt"),
											autoFocus: true,
											onChange: (event) => {
												setDraft(event.target.value);
											},
											onKeyDown: (event) => {
												if (event.key === "Escape") cancelRename();
											}
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: remote_module_css_default.textButton,
											type: "submit",
											disabled: busy || draft.trim() === "",
											children: t("devices.renameSave")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: remote_module_css_default.textButton,
											type: "button",
											disabled: busy,
											onClick: cancelRename,
											children: t("devices.renameCancel")
										})
									]
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: remote_module_css_default.textButton,
									type: "button",
									disabled: busy,
									"aria-label": `${t("devices.rename")}: ${session.label}`,
									onClick: () => {
										beginRename(session);
									},
									children: t("devices.rename")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: remote_module_css_default.textButton,
									type: "button",
									disabled: busy,
									"aria-label": `${t("devices.kick")}: ${session.label}`,
									onClick: () => {
										onKick(session.id);
									},
									children: t("devices.kick")
								})] })
							})]
						}, session.id))
					})
				]
			});
		}
		//#endregion
		//#region src/client/PanelToast.tsx
		/**
		* PanelToast — dismissible notice inside the reverse-proxy settings page.
		*
		* Errors and warnings stay until the user dismisses them (they carry the
		* next step). Success toasts auto-dismiss after a short delay.
		*/
		const KIND_LABEL = {
			error: "toast.error",
			warn: "toast.warn",
			success: "toast.success"
		};
		const KIND_CLASS = {
			error: remote_module_css_default.toastError,
			warn: remote_module_css_default.toastWarn,
			success: remote_module_css_default.toastSuccess
		};
		function PanelToast({ toast, t, onDismiss }) {
			(0, react.useEffect)(() => {
				if (toast.kind !== "success") return;
				const timer = window.setTimeout(onDismiss, 3200);
				return () => {
					window.clearTimeout(timer);
				};
			}, [toast, onDismiss]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${remote_module_css_default.toast} ${KIND_CLASS[toast.kind]}`,
				role: toast.kind === "success" ? "status" : "alert",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: remote_module_css_default.toastBody,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(KIND_LABEL[toast.kind]) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: toast.text })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: remote_module_css_default.toastDismiss,
					type: "button",
					"aria-label": t("toast.dismiss"),
					onClick: onDismiss,
					children: "×"
				})]
			});
		}
		//#endregion
		//#region src/client/ReverseProxyIcon.tsx
		/**
		* ReverseProxyIcon — 16×16 fill glyph in the official DeepSeek Harness
		* icon language (currentColor, evenodd, no strokes).
		*
		* A solid local node bridged to a hollow remote node: the hop this plugin
		* actually is. Not a diamond, plus, phone, gear, or crosshair — those
		* already sit in the same settings panel.
		*/
		function ReverseProxyIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					fill: "currentColor",
					fillRule: "evenodd",
					clipRule: "evenodd",
					d: "M4 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm8 0a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm0 1.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM6.25 7.25h3.5v1.5h-3.5z"
				})
			});
		}
		//#endregion
		//#region src/client/toast.ts
		function bindOf(status) {
			return status.listen === void 0 ? "" : `${status.listen.host}:${status.listen.port}`;
		}
		function toastFromReason(reason, status, t, intent) {
			const bind = bindOf(status);
			const backend = status.backend ?? "";
			switch (reason) {
				case "listen-failed": return {
					kind: "error",
					text: t(intent === "listen" ? "error.listenFailed" : "error.startListenFailed", {
						bind,
						backend
					})
				};
				case "self-loop": return {
					kind: "error",
					text: t("error.startSelfLoop", {
						bind,
						backend
					})
				};
				case "disposed": return {
					kind: "error",
					text: t("error.startDisposed")
				};
				case "invalid-listen": return {
					kind: "error",
					text: t("error.invalidListenServer")
				};
				case "listen-failed-restored": return {
					kind: "warn",
					text: t("error.listenRestored", { bind })
				};
				case "tls-failed": return {
					kind: "error",
					text: t("error.tlsFailed")
				};
				default: return {
					kind: "error",
					text: t("error.unknownReason", { reason })
				};
			}
		}
		function toastFromStatus(status, t, intent) {
			if (intent === "rotate") {
				if (status.reason !== void 0 && status.reason !== "") return {
					kind: "warn",
					text: t("toast.tokenRotatedWithIssue", { detail: toastFromReason(status.reason, status, t, intent).text })
				};
				return {
					kind: "success",
					text: t("toast.tokenRotated")
				};
			}
			if (status.reason !== void 0 && status.reason !== "") return toastFromReason(status.reason, status, t, intent);
			if (intent === "start") return status.running ? {
				kind: "success",
				text: t("toast.started")
			} : {
				kind: "error",
				text: t("error.startUnknown")
			};
			if (intent === "stop") return {
				kind: "success",
				text: t("toast.stopped")
			};
			if (intent === "listen") return {
				kind: "success",
				text: t("toast.listenApplied")
			};
			return {
				kind: "success",
				text: t("toast.tokenRotated")
			};
		}
		function toastFromCaught(error, t) {
			const message = error instanceof Error ? error.message : "";
			if (message === "forbidden") return {
				kind: "error",
				text: t("error.forbidden")
			};
			if (message === "loopback-required") return {
				kind: "error",
				text: t("error.loopbackRequired")
			};
			if (message === "token-read-disabled") return {
				kind: "error",
				text: t("error.tokenReadDisabled")
			};
			if (message === "invalid-request") return {
				kind: "error",
				text: t("error.invalidRequest")
			};
			if (message === "invalid-base") return {
				kind: "error",
				text: t("error.invalidInviteBase")
			};
			if (message === "not-running") return {
				kind: "error",
				text: t("error.notRunning")
			};
			if (message === "tls-unsupported") return {
				kind: "error",
				text: t("tunnel.errorTlsUnsupported")
			};
			if (message === "disposed") return {
				kind: "error",
				text: t("error.startDisposed")
			};
			if (message === "action-failed") return {
				kind: "error",
				text: t("error.generic")
			};
			if (message !== "") return {
				kind: "error",
				text: t("error.network", { detail: message })
			};
			return {
				kind: "error",
				text: t("error.generic")
			};
		}
		/**
		* Map a tunnel status `detail` token (state 'error') to a toast. Unknown
		* tokens return undefined so the panel can fall back to a generic line.
		*/
		function toastFromTunnelDetail(detail, t) {
			switch (detail) {
				case "download-failed": return {
					kind: "error",
					text: t("tunnel.errorDownloadFailed")
				};
				case "integrity-failed": return {
					kind: "error",
					text: t("tunnel.errorIntegrityFailed")
				};
				case "configured-path-invalid": return {
					kind: "error",
					text: t("tunnel.errorConfiguredPathInvalid")
				};
				case "unsupported-platform": return {
					kind: "error",
					text: t("tunnel.errorUnsupportedPlatform")
				};
				case "spawn-failed": return {
					kind: "error",
					text: t("tunnel.errorSpawnFailed")
				};
				case "connect-failed": return {
					kind: "error",
					text: t("tunnel.errorConnectFailed")
				};
				case "connect-timeout": return {
					kind: "error",
					text: t("tunnel.errorConnectTimeout")
				};
				case "exited": return {
					kind: "warn",
					text: t("tunnel.errorExited")
				};
				default: return;
			}
		}
		//#endregion
		//#region src/hosts.ts
		/**
		* Host classification shared by the Node host, the proxy, and the settings
		* page. Kept free of Node builtins so the client bundle can import it.
		*/
		/** True for bind-all wildcards: not connectable destination hosts. */
		function isWildcardHost(host) {
			const value = String(host ?? "").replace(/^\[|\]$/g, "");
			return value === "" || value === "0.0.0.0" || value === "::" || value === "::0";
		}
		/**
		* Loopback classification aligned with harness `isLoopbackHostname`:
		* localhost, [::1], and any IPv4 in 127/8. Also accepts the IPv4-mapped
		* form Node reports on sockets (`::ffff:127.0.0.1`).
		*/
		function isLoopbackHost(host) {
			let hostname = String(host ?? "").replace(/^\[|\]$/g, "").toLowerCase();
			if (hostname.startsWith("::ffff:")) hostname = hostname.slice(7);
			if (hostname === "localhost" || hostname === "::1") return true;
			const parts = hostname.split(".");
			return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
		}
		//#endregion
		//#region src/client/RemoteSection.tsx
		/**
		* RemoteSection — reverse-proxy control page on the official
		* `settings.section` slot. Rhythm matches Plugins / Agent presets:
		* 18/600 title, 13px intro, grouped fields, primary action in the
		* status card. The shell owns the dialog chrome and nav.
		*/
		/** Only render QR SVG that looks like our own generator output. */
		function safeQrSvg(svg) {
			if (typeof svg !== "string") return void 0;
			const trimmed = svg.trim();
			if (!trimmed.startsWith("<svg") || /<script[\s>]/i.test(trimmed)) return void 0;
			return trimmed;
		}
		function isLoopbackHttpUrl(url) {
			try {
				const parsed = new URL(url);
				return (parsed.protocol === "http:" || parsed.protocol === "https:") && isLoopbackHost(parsed.hostname);
			} catch {
				return false;
			}
		}
		function CopyField(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				className: remote_module_css_default.copyField,
				type: "button",
				disabled: props.disabled,
				onClick: props.onCopy,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: props.value }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: props.action })]
			});
		}
		function RemoteSection({ api, t }) {
			const [status, setStatus] = (0, react.useState)();
			const [accessToken, setAccessToken] = (0, react.useState)();
			const [busyKind, setBusyKind] = (0, react.useState)();
			const busy = busyKind !== void 0;
			const [toast, setToast] = (0, react.useState)();
			const [listenHost, setListenHost] = (0, react.useState)("");
			const [listenPort, setListenPort] = (0, react.useState)("");
			const [sessions, setSessions] = (0, react.useState)([]);
			const [check, setCheck] = (0, react.useState)();
			const [inviteBase, setInviteBase] = (0, react.useState)("");
			const [invite, setInvite] = (0, react.useState)();
			const [audit, setAudit] = (0, react.useState)();
			const [auditLoading, setAuditLoading] = (0, react.useState)(false);
			const [auditFilter, setAuditFilter] = (0, react.useState)("");
			const [auditLimit, setAuditLimit] = (0, react.useState)("50");
			const toastSeq = (0, react.useRef)(0);
			const mounted = (0, react.useRef)(true);
			const sessionsEpoch = (0, react.useRef)(0);
			/** Previous tunnel snapshot so polling toasts transitions exactly once. */
			const prevTunnelRef = (0, react.useRef)(void 0);
			const showToast = (model) => {
				if (!mounted.current) return;
				toastSeq.current += 1;
				setToast({
					...model,
					id: toastSeq.current
				});
			};
			const dismissToast = (0, react.useCallback)(() => {
				setToast(void 0);
			}, []);
			const applySessions = (list, epoch) => {
				if (!mounted.current || epoch !== sessionsEpoch.current) return;
				setSessions(list);
			};
			const refreshSessions = async (epoch = sessionsEpoch.current) => {
				try {
					const list = await api.sessions();
					applySessions(list, epoch);
					return true;
				} catch {
					return false;
				}
			};
			(0, react.useEffect)(() => {
				mounted.current = true;
				let active = true;
				let pollFailed = false;
				setToast(void 0);
				api.status().then((value) => {
					if (!active) return;
					setStatus(value);
					if (value.listen) {
						setListenHost((prev) => prev === "" ? value.listen.host : prev);
						setListenPort((prev) => prev === "" ? String(value.listen.port) : prev);
					}
					if (value.reason !== void 0 && value.reason !== "" && value.running !== true) showToast(toastFromReason(value.reason, value, t, "start"));
				}, (reason) => {
					if (active) showToast(toastFromCaught(reason, t));
				});
				const poll = () => {
					const epoch = sessionsEpoch.current;
					api.sessions().then((list) => {
						if (!active) return;
						pollFailed = false;
						applySessions(list, epoch);
					}, () => {
						if (!active || pollFailed) return;
						pollFailed = true;
						showToast({
							kind: "warn",
							text: t("error.sessionsPoll")
						});
					});
				};
				poll();
				const sessionTimer = setInterval(poll, 3e3);
				return () => {
					active = false;
					mounted.current = false;
					clearInterval(sessionTimer);
				};
			}, [api, t]);
			(0, react.useEffect)(() => {
				const state = status?.tunnel?.state;
				if (state !== "starting" && state !== "online") return;
				const timer = setInterval(() => {
					api.status().then((next) => {
						if (!mounted.current) return;
						const prev = prevTunnelRef.current;
						applyTunnelStatus(next);
						const tunnel = next.tunnel;
						if (tunnel === void 0) return;
						if (tunnel.state === "error" && prev?.state !== "error") {
							const model = tunnel.detail === void 0 ? void 0 : toastFromTunnelDetail(tunnel.detail, t);
							showToast(model ?? {
								kind: "error",
								text: t("tunnel.state.error")
							});
						} else if (tunnel.state === "online" && prev?.state !== "online" && tunnel.publicUrl !== void 0) showToast({
							kind: "success",
							text: t("tunnel.toast.online", { url: tunnel.publicUrl })
						});
					}, () => {});
				}, 2e3);
				return () => {
					clearInterval(timer);
				};
			}, [
				status?.tunnel?.state,
				api,
				t
			]);
			const applyResult = (next, intent) => {
				if (!mounted.current) return;
				setStatus(next);
				setCheck(void 0);
				if (next.listen) {
					setListenHost(next.listen.host);
					setListenPort(String(next.listen.port));
				}
				showToast(toastFromStatus(next, t, intent));
			};
			const withBusy = async (kind, work) => {
				setBusyKind(kind);
				try {
					await work();
				} catch (reason) {
					showToast(toastFromCaught(reason, t));
				} finally {
					if (mounted.current) setBusyKind(void 0);
				}
			};
			const run = async (intent) => {
				await withBusy(intent, async () => {
					applyResult(await (intent === "stop" ? api.stop() : api.start()), intent);
				});
			};
			const applyTunnelStatus = (next) => {
				if (!mounted.current) return;
				prevTunnelRef.current = next.tunnel;
				setStatus(next);
				const tunnel = next.tunnel;
				if (tunnel !== void 0 && tunnel.state !== "starting" && tunnel.state !== "online") setInvite(void 0);
			};
			const startTunnel = async () => {
				await withBusy("tunnel", async () => {
					let current = status;
					if (!current?.running) {
						current = await api.start();
						if (mounted.current) {
							setStatus(current);
							setCheck(void 0);
						}
						if (!current.running) {
							showToast(toastFromStatus(current, t, "start"));
							return;
						}
					}
					applyTunnelStatus(await api.startTunnel());
				});
			};
			const stopTunnel = async () => {
				await withBusy("tunnel", async () => {
					applyTunnelStatus(await api.stopTunnel());
					showToast({
						kind: "success",
						text: t("tunnel.toast.stopped")
					});
				});
			};
			const copyViaExecCommand = (value) => {
				const textarea = document.createElement("textarea");
				textarea.value = value;
				textarea.setAttribute("readonly", "");
				textarea.style.position = "fixed";
				textarea.style.opacity = "0";
				document.body.appendChild(textarea);
				textarea.select();
				let ok = false;
				try {
					ok = document.execCommand("copy");
				} catch {}
				textarea.remove();
				return ok;
			};
			const copy = async (value, label, doneKey) => {
				try {
					if (navigator.clipboard?.writeText !== void 0) await navigator.clipboard.writeText(value);
					else if (!copyViaExecCommand(value)) {
						showToast({
							kind: "error",
							text: t("copy.failed", { label })
						});
						return;
					}
					showToast({
						kind: "success",
						text: t(doneKey)
					});
				} catch {
					if (!copyViaExecCommand(value)) {
						showToast({
							kind: "error",
							text: t("copy.failed", { label })
						});
						return;
					}
					showToast({
						kind: "success",
						text: t(doneKey)
					});
				}
			};
			const revealToken = async () => {
				await withBusy("token", async () => {
					const token = await api.token();
					if (mounted.current) setAccessToken(token);
				});
			};
			const rotate = async () => {
				await withBusy("token", async () => {
					const next = await api.rotateToken();
					sessionsEpoch.current += 1;
					if (mounted.current) {
						setInvite(void 0);
						setSessions([]);
						setAccessToken(next.accessToken);
					}
					applyResult(next, "rotate");
					refreshSessions(sessionsEpoch.current);
				});
			};
			const applyListen = async () => {
				const host = listenHost.trim();
				const portText = listenPort.trim();
				if (host === "" || portText === "") {
					showToast({
						kind: "error",
						text: t("error.invalidListen")
					});
					return;
				}
				const port = Number(portText);
				if (!Number.isInteger(port) || port < 0 || port > 65535) {
					showToast({
						kind: "error",
						text: t("error.invalidListen")
					});
					return;
				}
				await withBusy("listen", async () => {
					if (mounted.current) setInvite(void 0);
					applyResult(await api.setListen(host, port), "listen");
				});
			};
			const afterDeviceMutation = async (successKey) => {
				showToast({
					kind: "success",
					text: t(successKey)
				});
				sessionsEpoch.current += 1;
				const epoch = sessionsEpoch.current;
				if (!await refreshSessions(epoch)) showToast({
					kind: "warn",
					text: t("error.sessionsPoll")
				});
			};
			const mutateDevice = async (action, successKey, failKey) => {
				await withBusy("device", async () => {
					if (!(await action()).ok) {
						showToast({
							kind: "error",
							text: t(failKey)
						});
						return;
					}
					await afterDeviceMutation(successKey);
				});
			};
			const kick = (id) => mutateDevice(() => api.revokeSession(id), "devices.kicked", "error.sessionActionFailed");
			const decide = (id, approve) => mutateDevice(() => approve ? api.approveSession(id) : api.revokeSession(id), approve ? "devices.approved" : "devices.rejected", "error.sessionActionFailed");
			const rename = (id, label) => mutateDevice(() => api.renameSession(id, label), "devices.renamed", "devices.renameFailed");
			const runSelfCheck = async () => {
				await withBusy("check", async () => {
					const result = await api.selfCheck();
					if (mounted.current) setCheck(result);
				});
			};
			const generateInvite = async () => {
				await withBusy("invite", async () => {
					const base = inviteBase.trim();
					const result = await api.invite(base === "" ? void 0 : base);
					if (mounted.current) setInvite(result);
				});
			};
			const loadAudit = async () => {
				if (auditLoading) return;
				setAuditLoading(true);
				try {
					const rawLimit = auditLimit.trim() === "" ? 50 : Number(auditLimit);
					const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
					const result = await api.audit(limit, auditFilter.trim() || void 0);
					if (mounted.current) setAudit(result);
				} catch (reason) {
					showToast(toastFromCaught(reason, t));
				} finally {
					if (mounted.current) setAuditLoading(false);
				}
			};
			const exportAudit = async () => {
				try {
					const blob = await api.exportAudit(auditFilter.trim() || void 0);
					const url = URL.createObjectURL(blob);
					const link = document.createElement("a");
					link.href = url;
					link.download = "dsh-reverse-proxy-audit.json";
					document.body.appendChild(link);
					link.click();
					link.remove();
					window.setTimeout(() => {
						URL.revokeObjectURL(url);
					}, 1e3);
					showToast({
						kind: "success",
						text: t("audit.exported")
					});
				} catch (reason) {
					showToast(toastFromCaught(reason, t));
				}
			};
			const running = status?.running === true;
			const statusReady = status !== void 0;
			const host = listenHost.trim();
			const wildcard = isWildcardHost(host);
			const nonLoopback = host !== "" && !wildcard && !isLoopbackHost(host);
			const startStopLabel = busyKind === "start" || busyKind === "stop" ? t("busy") : running ? t("stop") : t("start");
			const checkLabel = busyKind === "check" ? t("check.running") : t("check.run");
			const inviteLabel = busyKind === "invite" ? t("busy") : t("invite.generate");
			const listenLabel = busyKind === "listen" ? t("busy") : t("listen.apply");
			const heroTitle = !statusReady ? t("status.loading") : running ? t("status.running") : t("status.stopped");
			const heroHint = !statusReady ? t("status.loadingHint") : running ? t("status.runningHint") : t("status.stoppedHint");
			const qrSvg = safeQrSvg(invite?.qrSvg);
			const fenceDetail = check === void 0 ? void 0 : check.fence.ok ? t("check.fenceOk", {
				method: check.fence.method,
				status: check.fence.status
			}) : t("check.fenceFail", {
				method: check.fence.method,
				status: check.fence.status,
				detail: check.fence.detail ? ` — ${check.fence.detail}` : ""
			});
			const extraReachables = (status?.reachables ?? []).filter((url) => url !== status?.target);
			const proxyStoppedHint = check !== void 0 && statusReady && !running;
			const lanUrl = !statusReady ? void 0 : !isLoopbackHttpUrl(status.target) ? status.target : (status.reachables ?? []).find((url) => !isLoopbackHttpUrl(url));
			const tunnelState = status?.tunnel?.state ?? "off";
			const tunnelUrl = status?.tunnel?.publicUrl;
			const tunnelOn = tunnelState === "starting" || tunnelState === "online";
			const tunnelStartLabel = busyKind === "tunnel" ? t("busy") : tunnelOn ? t("tunnel.oneClick.stop") : t("tunnel.oneClick.start");
			const tunnelStage = tunnelState === "starting" ? status?.tunnel?.detail === "resolving" ? t("tunnel.state.resolving") : status?.tunnel?.detail === "downloading" ? t("tunnel.state.downloading") : status?.tunnel?.detail === "connecting" ? t("tunnel.state.connecting") : t("busy") : void 0;
			const tlsBlocksTunnel = status?.tls === true;
			const tunnelHint = tlsBlocksTunnel ? t("tunnel.hint.tlsBlocked") : tunnelState === "starting" ? tunnelStage : tunnelState === "online" ? t("tunnel.hint.ephemeral") : tunnelState === "error" ? t("tunnel.state.error") : !running ? t("tunnel.hint.requiresProxy") : void 0;
			const copyTarget = (url) => {
				copy(url, t("tunnel.copy"), "copied.target");
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: remote_module_css_default.section,
				"data-shot": "section",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: remote_module_css_default.title,
						children: t("section.title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: remote_module_css_default.intro,
						children: t("section.intro")
					}),
					toast !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelToast, {
						toast,
						t,
						onDismiss: dismissToast
					}, toast.id),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: remote_module_css_default.hero,
						"data-shot": "hero",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: remote_module_css_default.heroMain,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: remote_module_css_default.brand,
								"data-online": running ? "true" : void 0,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReverseProxyIcon, {})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: remote_module_css_default.heroCopy,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: heroTitle }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: remote_module_css_default.hint,
									children: heroHint
								})]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: remote_module_css_default.heroActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: remote_module_css_default.secondaryButton,
								type: "button",
								disabled: busy || !statusReady,
								onClick: () => {
									runSelfCheck();
								},
								children: checkLabel
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: running ? remote_module_css_default.dangerButton : remote_module_css_default.primaryButton,
								type: "button",
								disabled: busy || !statusReady,
								onClick: () => {
									run(running ? "stop" : "start");
								},
								children: startStopLabel
							})]
						})]
					}),
					check !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: remote_module_css_default.group,
						"data-shot": "check",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: remote_module_css_default.groupHead,
								children: t("check.label")
							}),
							fenceDetail !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: check.fence.ok ? remote_module_css_default.hint : remote_module_css_default.warn,
								children: fenceDetail
							}),
							check.bootstrapFailed === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.warn,
								children: t("check.bootstrapFail")
							}) : check.trustBootstrap === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("check.bootstrapOk")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("check.bootstrapMissing")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: check.tls ? t("check.tlsOn") : t("check.tlsOff")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: check.auditLog ? t("check.auditOn") : t("check.auditOff")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: check.trustForwardedFor ? t("check.trustForwardedForOn") : t("check.trustForwardedForOff")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: check.allowTokenRead ? t("check.tokenReadOn") : t("check.tokenReadOff")
							}),
							proxyStoppedHint && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("check.proxyStopped")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: remote_module_css_default.group,
						"data-shot": "listen",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: remote_module_css_default.groupHead,
								children: t("listen.label")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("listen.description")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: remote_module_css_default.listenRow,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: remote_module_css_default.field,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("listen.host") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: remote_module_css_default.input,
											value: listenHost,
											onChange: (event) => {
												setListenHost(event.target.value);
											},
											placeholder: "127.0.0.1",
											inputMode: "url",
											autoCapitalize: "none",
											autoCorrect: "off",
											spellCheck: false
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: remote_module_css_default.field,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("listen.port") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: remote_module_css_default.input,
											value: listenPort,
											onChange: (event) => {
												setListenPort(event.target.value.replace(/[^0-9]/g, ""));
											},
											placeholder: "3081",
											inputMode: "numeric"
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: remote_module_css_default.secondaryButton,
										type: "button",
										disabled: busy,
										onClick: () => {
											applyListen();
										},
										children: listenLabel
									})
								]
							}),
							wildcard && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.warn,
								children: t("listen.wildcard")
							}),
							nonLoopback && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.warn,
								children: t("listen.warn")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: remote_module_css_default.group,
						"data-shot": "guide",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: remote_module_css_default.groupHead,
								children: t("guide.label")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("guide.description")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: lanUrl !== void 0 ? t("guide.wifi", { url: lanUrl }) : t("guide.wifiNone")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("guide.outside")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.warn,
								children: t("guide.quick")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: remote_module_css_default.group,
						"data-shot": "tunnel",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: remote_module_css_default.groupHead,
								children: t("tunnel.label")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CopyField, {
								value: status?.target ?? t("tunnel.loading"),
								action: t("tunnel.copy"),
								disabled: status === void 0,
								onCopy: () => {
									if (status !== void 0) copyTarget(status.target);
								}
							}),
							status?.wildcard === true && status.listen !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("tunnel.bound", { bind: `${status.listen.host}:${status.listen.port}` })
							}),
							lanUrl !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("tunnel.target.recommended")
							}),
							extraReachables.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("tunnel.reachables")
							}), extraReachables.map((url) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CopyField, {
								value: url,
								action: t("tunnel.copy"),
								onCopy: () => {
									copyTarget(url);
								}
							}, url))] })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: remote_module_css_default.group,
						"data-shot": "oneClick",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
								className: remote_module_css_default.groupHead,
								children: [
									t("tunnel.oneClick.label"),
									" ",
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: remote_module_css_default.badge,
										children: t("tunnel.oneClick.badge")
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("tunnel.oneClick.description")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: remote_module_css_default.tokenRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: tunnelOn ? remote_module_css_default.dangerButton : remote_module_css_default.secondaryButton,
									type: "button",
									disabled: busy || tlsBlocksTunnel,
									onClick: () => {
										tunnelOn ? stopTunnel() : startTunnel();
									},
									children: tunnelStartLabel
								}), tunnelState === "online" && tunnelUrl !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CopyField, {
									value: tunnelUrl,
									action: t("tunnel.copy"),
									onCopy: () => {
										copyTarget(tunnelUrl);
									}
								})]
							}),
							tunnelHint !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: tunnelState === "error" || tlsBlocksTunnel ? remote_module_css_default.warn : remote_module_css_default.hint,
								children: tunnelHint
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: remote_module_css_default.group,
						"data-shot": "invite",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: remote_module_css_default.groupHead,
								children: t("invite.label")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("invite.description")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: remote_module_css_default.field,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("invite.base") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: remote_module_css_default.input,
									value: inviteBase,
									onChange: (event) => {
										setInviteBase(event.target.value);
									},
									placeholder: t("invite.placeholder"),
									inputMode: "url",
									autoCapitalize: "none",
									autoCorrect: "off",
									spellCheck: false
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: remote_module_css_default.tokenRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: remote_module_css_default.secondaryButton,
									type: "button",
									disabled: busy || statusReady && !running,
									onClick: () => {
										generateInvite();
									},
									children: inviteLabel
								}), invite !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: remote_module_css_default.secondaryButton,
									type: "button",
									onClick: () => {
										copy(invite.inviteUrl, t("invite.copy"), "invite.copied");
									},
									children: t("invite.copy")
								})]
							}),
							statusReady && !running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("invite.requiresRunning")
							}),
							tunnelState === "online" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("tunnel.hint.inviteUsesTunnel")
							}),
							tunnelState === "off" && statusReady && running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("invite.lanHint")
							}),
							qrSvg !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: remote_module_css_default.qr,
								dangerouslySetInnerHTML: { __html: qrSvg }
							}),
							invite !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
									className: remote_module_css_default.inviteUrl,
									children: invite.inviteUrl
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: remote_module_css_default.group,
						"data-shot": "token",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: remote_module_css_default.groupHead,
								children: t("token.label")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("token.description")
							}),
							accessToken === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: remote_module_css_default.tokenActions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: remote_module_css_default.secondaryButton,
									type: "button",
									disabled: busy,
									onClick: () => {
										revealToken();
									},
									children: busyKind === "token" ? t("busy") : t("token.reveal")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: remote_module_css_default.textButton,
									type: "button",
									disabled: busy,
									onClick: () => {
										rotate();
									},
									children: busyKind === "token" ? t("busy") : t("token.rotate")
								})]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: remote_module_css_default.tokenRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CopyField, {
									value: accessToken,
									action: t("tunnel.copy"),
									onCopy: () => {
										copy(accessToken, t("token.copyLabel"), "copied.token");
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: remote_module_css_default.textButton,
									type: "button",
									disabled: busy,
									onClick: () => {
										rotate();
									},
									children: busyKind === "token" ? t("busy") : t("token.rotate")
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DevicesSection, {
						sessions,
						approvalMode: status?.approvalMode === true,
						busy,
						t,
						onKick: (id) => {
							kick(id);
						},
						onDecide: (id, approve) => {
							decide(id, approve);
						},
						onRename: (id, label) => {
							rename(id, label);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: remote_module_css_default.group,
						"data-shot": "audit",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: remote_module_css_default.groupHead,
								children: t("audit.label")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("audit.description")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: remote_module_css_default.auditRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: remote_module_css_default.field,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("audit.filter") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: remote_module_css_default.input,
										value: auditFilter,
										onChange: (event) => {
											setAuditFilter(event.target.value);
										},
										placeholder: t("audit.filterPlaceholder"),
										autoCapitalize: "none",
										autoCorrect: "off",
										spellCheck: false
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: remote_module_css_default.field,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("audit.limit") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: remote_module_css_default.input,
										value: auditLimit,
										onChange: (event) => {
											setAuditLimit(event.target.value.replace(/[^0-9]/g, ""));
										},
										inputMode: "numeric",
										placeholder: "50"
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: remote_module_css_default.auditActions,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: remote_module_css_default.secondaryButton,
									type: "button",
									disabled: busy || auditLoading,
									onClick: () => {
										loadAudit();
									},
									children: auditLoading ? t("busy") : t("audit.load")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: remote_module_css_default.secondaryButton,
									type: "button",
									disabled: busy || auditLoading,
									onClick: () => {
										exportAudit();
									},
									children: t("audit.export")
								})]
							}),
							audit !== void 0 && !audit.enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.warn,
								children: t("audit.disabled")
							}),
							audit !== void 0 && audit.enabled && audit.events.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: remote_module_css_default.hint,
								children: t("audit.empty")
							}),
							audit !== void 0 && audit.events.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: remote_module_css_default.auditList,
								children: audit.events.map((event, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
									className: remote_module_css_default.auditItem,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: event.ts }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: event.event }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
											className: remote_module_css_default.auditDetail,
											children: JSON.stringify(event, null, 2)
										})
									]
								}, `${event.ts}-${index}`))
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/pending-source.ts
		const EMPTY_STATE = { items: [] };
		/**
		* Show the remote overlay when this browser is not the host loopback window,
		* or when the viewport is phone-narrow (adb reverse still looks like 127.0.0.1).
		*/
		function shouldUseInteractionOverlay(hostname = typeof location === "undefined" ? "127.0.0.1" : location.hostname, width = typeof window === "undefined" ? 1024 : window.innerWidth) {
			return !isLoopbackHost(hostname) || width <= 720;
		}
		/**
		* Narrow a question batch to a binary plan review, or undefined for the generic flow.
		*/
		function planReviewOf(questions) {
			if (questions.length !== 1) return void 0;
			const question = questions[0];
			if (question === void 0) return void 0;
			const intent = question.intent;
			if (intent?.kind !== "plan-review" || question.detail === void 0) return void 0;
			if (question.multiSelect === true) return void 0;
			const options = question.options ?? [];
			if (options.length > 2) return void 0;
			const approve = options.find((option) => option.label === intent.approve);
			if (approve === void 0) return void 0;
			const decline = options.find((option) => option.label !== intent.approve);
			return {
				id: question.id,
				question: question.question,
				plan: question.detail,
				approve: approve.label,
				...decline === void 0 ? {} : { decline: decline.label }
			};
		}
		/**
		* Split a conventional "(recommended)" suffix without changing the answer value.
		*/
		function parseRecommendedLabel(label) {
			const suffix = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i;
			return suffix.test(label) ? {
				label: label.replace(suffix, ""),
				recommended: true
			} : {
				label,
				recommended: false
			};
		}
		function fingerprint(state) {
			return state.items.map((item) => {
				const q = item.questions?.map((question) => JSON.stringify(question)).join(",") ?? "";
				const approval = item.approval === void 0 ? "" : JSON.stringify(item.approval);
				return `${item.key}:${item.ready}:${item.presentation}:${q}:${approval}`;
			}).join("|");
		}
		function questionView(wait) {
			return wait.payload.questions.map((question) => ({
				id: question.id,
				question: question.question,
				...question.detail === void 0 ? {} : { detail: question.detail },
				...question.header === void 0 ? {} : { header: question.header },
				...question.options === void 0 ? {} : { options: question.options.map((option) => ({
					label: option.label,
					...option.description === void 0 ? {} : { description: option.description }
				})) },
				...question.multiSelect === true ? { multiSelect: true } : {},
				...question.intent?.kind === "plan-review" ? { intent: {
					kind: "plan-review",
					approve: question.intent.approve
				} } : {}
			}));
		}
		function projectWait(wait, sessionTitle, current) {
			if (wait.kind === "question") {
				const questions = questionView(wait);
				return {
					key: wait.key,
					kind: "question",
					presentation: planReviewOf(questions) === void 0 ? "question" : "plan-review",
					sessionId: wait.sessionId,
					sessionTitle,
					current,
					ready: true,
					questions
				};
			}
			const approval = wait;
			return {
				key: approval.key,
				kind: "approval",
				presentation: "approval",
				sessionId: approval.sessionId,
				sessionTitle,
				current,
				ready: true,
				approval: {
					toolName: approval.payload.toolName,
					...approval.payload.reason === void 0 ? {} : { reason: approval.payload.reason }
				}
			};
		}
		function receiptError(receipt, action) {
			if (receipt.accepted) return;
			throw new Error(`${action} rejected: ${receipt.reason ?? "unknown"}`);
		}
		/**
		* Subscribe to the session list and every pending session's conversation
		* snapshot. `binding()` instantiates the session so buffered question/approval
		* frames become answerable waits without changing the current selection.
		*/
		function createPendingSource(sessions) {
			const listeners = /* @__PURE__ */ new Set();
			const sessionUnsubs = /* @__PURE__ */ new Map();
			const waits = /* @__PURE__ */ new Map();
			let snapshot = EMPTY_STATE;
			let disposed = false;
			const notify = () => {
				for (const listener of listeners) listener();
			};
			const collect = () => {
				if (disposed) return;
				const list = sessions.list.getSnapshot();
				const items = [];
				const nextWaits = /* @__PURE__ */ new Map();
				const pendingIds = /* @__PURE__ */ new Set();
				for (const id of list.ids) {
					const row = list.byId[id];
					if (row?.pendingInteraction === void 0) continue;
					pendingIds.add(id);
					const pending = sessions.binding(id)?.session.getSnapshot().pending ?? [];
					if (pending.length === 0) {
						items.push({
							key: `hint:${id}`,
							kind: row.pendingInteraction === "approval" ? "approval" : "question",
							presentation: row.pendingInteraction,
							sessionId: id,
							sessionTitle: row.displayTitle,
							current: list.current === id,
							ready: false
						});
						continue;
					}
					for (const wait of pending) {
						nextWaits.set(wait.key, wait);
						items.push(projectWait(wait, row.displayTitle, list.current === id));
					}
				}
				waits.clear();
				for (const [key, wait] of nextWaits) waits.set(key, wait);
				for (const [id, unsub] of sessionUnsubs) {
					if (pendingIds.has(id)) continue;
					unsub();
					sessionUnsubs.delete(id);
				}
				for (const id of pendingIds) {
					if (sessionUnsubs.has(id)) continue;
					const binding = sessions.binding(id);
					if (binding === void 0) continue;
					sessionUnsubs.set(id, binding.session.subscribe(collect));
				}
				const next = items.length === 0 ? EMPTY_STATE : { items };
				if (fingerprint(next) === fingerprint(snapshot)) return;
				snapshot = next;
				notify();
			};
			const listUnsub = sessions.list.subscribe(collect);
			collect();
			return {
				getSnapshot: () => snapshot,
				subscribe: (fn) => {
					listeners.add(fn);
					return () => {
						listeners.delete(fn);
					};
				},
				dispose: () => {
					disposed = true;
					listUnsub();
					for (const unsub of sessionUnsubs.values()) unsub();
					sessionUnsubs.clear();
					waits.clear();
					listeners.clear();
					snapshot = EMPTY_STATE;
				},
				answerApproval: async (key, outcome) => {
					const wait = waits.get(key);
					if (wait === void 0 || wait.kind !== "approval") throw new Error("approval is no longer pending");
					receiptError(await wait.respond({
						ok: true,
						value: {
							sessionId: wait.sessionId,
							approvalId: wait.payload.approvalId,
							outcome
						}
					}), "approval");
				},
				answerQuestion: async (key, answer) => {
					const wait = waits.get(key);
					if (wait === void 0 || wait.kind !== "question") throw new Error("question is no longer pending");
					receiptError(await wait.respond({
						ok: true,
						value: {
							sessionId: wait.sessionId,
							answer
						}
					}), "question");
				},
				cancelQuestion: async (key) => {
					const wait = waits.get(key);
					if (wait === void 0 || wait.kind !== "question") throw new Error("question is no longer pending");
					receiptError(await wait.respond({
						ok: false,
						error: {
							code: "cancelled",
							message: "the user closed this question request",
							details: {}
						}
					}), "question cancel");
				}
			};
		}
		//#endregion
		//#region \0dsh-full-remote-css:/home/runner/work/dsh-full-remote/dsh-full-remote/src/client/interaction.module.css.mjs
		const css = "._3H_igW_layer{z-index:40;pointer-events:auto;justify-content:center;align-items:flex-end;display:flex;position:absolute;inset:0}._3H_igW_backdrop{background:color-mix(in srgb, var(--dsw-alias-bg-base,#111) 55%, transparent);position:absolute;inset:0}._3H_igW_sheet{width:min(100%,440px);max-height:min(88dvh,720px);padding:8px 16px calc(16px + env(safe-area-inset-bottom,0px));border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary);border-radius:20px 20px 0 0;flex-direction:column;display:flex;position:relative}._3H_igW_handle{background:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2));border-radius:999px;width:36px;height:4px;margin:4px auto 10px;display:block}._3H_igW_queue{color:var(--dsw-alias-label-tertiary);margin:0 0 8px;font-size:12px;line-height:1.4}._3H_igW_card{flex-direction:column;flex:1;gap:10px;min-height:0;display:flex}._3H_igW_header{align-items:flex-start;gap:8px;display:flex}._3H_igW_heading{flex:1;min-width:0}._3H_igW_badge{background:color-mix(in srgb, var(--dsw-alias-state-warn-label,#c48a00) 16%, transparent);color:var(--dsw-alias-state-warn-label,#8a5a00);border-radius:999px;flex:none;margin-top:2px;padding:2px 8px;font-size:11px;font-weight:600;line-height:16px}._3H_igW_title{flex:1;margin:0;font-size:17px;font-weight:600;line-height:1.35}._3H_igW_eyebrow{color:var(--dsw-alias-label-tertiary);margin:0 0 2px;font-size:12px}._3H_igW_session{color:var(--dsw-alias-label-tertiary);margin:-4px 0 0;font-size:12px;line-height:1.4}._3H_igW_lede,._3H_igW_detail,._3H_igW_meta{margin:0;font-size:14px;line-height:1.5}._3H_igW_meta{color:var(--dsw-alias-label-tertiary);font-size:12px}._3H_igW_body{overscroll-behavior:contain;flex-direction:column;gap:10px;min-height:0;display:flex;overflow:auto}._3H_igW_plan{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2,transparent);font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;border-radius:12px;margin:0;padding:12px;font-size:13px;line-height:1.55}._3H_igW_options{flex-direction:column;gap:8px;display:flex}._3H_igW_option,._3H_igW_customRow{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2,transparent);width:100%;min-height:48px;color:inherit;font:inherit;text-align:left;touch-action:manipulation;border-radius:12px;align-items:flex-start;gap:10px;margin:0;padding:12px;display:flex}._3H_igW_option:disabled,._3H_igW_customInput:disabled,._3H_igW_customTextarea:disabled{opacity:.6}._3H_igW_optionOn,._3H_igW_customOn{border-color:var(--dsw-alias-state-success-primary,#2f9e44);background:color-mix(in srgb, var(--dsw-alias-state-success-primary,#2f9e44) 10%, transparent)}._3H_igW_optionMark{background:var(--dsw-alias-interactive-bg-hover,transparent);width:22px;height:22px;color:var(--dsw-alias-label-tertiary);border-radius:999px;flex:none;place-items:center;margin-top:1px;font-size:12px;font-weight:600;display:grid}._3H_igW_optionOn ._3H_igW_optionMark{background:color-mix(in srgb, var(--dsw-alias-state-success-primary,#2f9e44) 22%, transparent);color:var(--dsw-alias-state-success-primary,#2f9e44)}._3H_igW_optionCopy{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}._3H_igW_optionLabel{font-size:15px;font-weight:500;line-height:1.4}._3H_igW_optionHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.4}._3H_igW_recommend{background:color-mix(in srgb, var(--dsw-alias-state-success-primary,#2f9e44) 14%, transparent);color:var(--dsw-alias-state-success-primary,#2f9e44);vertical-align:1px;border-radius:999px;margin-left:6px;padding:1px 6px;font-size:11px;font-weight:600;display:inline-block}._3H_igW_customInput,._3H_igW_customTextarea{width:100%;min-width:0;color:inherit;font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;background:0 0;border:0;outline:none;flex:1;font-size:15px;line-height:1.45}._3H_igW_customInput{resize:vertical;min-height:40px;padding:6px 0}._3H_igW_customTextarea{border:1px solid var(--dsw-alias-border-l2);resize:vertical;border-radius:12px;min-height:88px;padding:12px}._3H_igW_footer{flex-direction:column;gap:10px;display:flex}._3H_igW_pager{color:var(--dsw-alias-label-tertiary);justify-content:center;align-items:center;gap:12px;font-size:13px;display:flex}._3H_igW_progress{text-align:center;min-width:3.5em}._3H_igW_actions{justify-content:flex-end;gap:8px;display:flex}._3H_igW_primary,._3H_igW_secondary,._3H_igW_danger,._3H_igW_icon{font:inherit;touch-action:manipulation}._3H_igW_primary,._3H_igW_secondary,._3H_igW_danger{border-radius:10px;min-height:44px;padding:0 16px;font-size:14px;font-weight:600}._3H_igW_primary{background:var(--dsw-alias-interactive-primary,#3b6cff);color:var(--dsw-alias-label-on-primary,#fff);border:0}._3H_igW_secondary,._3H_igW_danger,._3H_igW_icon{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:0 0}._3H_igW_danger{color:var(--dsw-alias-state-error-primary,#c0392b)}._3H_igW_icon{border-radius:8px;flex:none;width:32px;height:32px;padding:0;font-size:18px;line-height:1}._3H_igW_primary:focus-visible,._3H_igW_secondary:focus-visible,._3H_igW_danger:focus-visible,._3H_igW_icon:focus-visible,._3H_igW_option:focus-visible,._3H_igW_customRow:focus-within,._3H_igW_customTextarea:focus-visible{outline:2px solid var(--dsw-alias-interactive-primary,#3b6cff);outline-offset:2px}._3H_igW_primary:disabled,._3H_igW_secondary:disabled,._3H_igW_danger:disabled,._3H_igW_icon:disabled{opacity:.45}._3H_igW_error{color:var(--dsw-alias-state-error-primary,#c0392b);margin:0;font-size:13px;line-height:1.4}@media (width>=640px){._3H_igW_layer{align-items:center;padding:24px}._3H_igW_sheet{border-radius:16px;max-height:min(80vh,640px);padding:16px 20px 20px}._3H_igW_handle{display:none}}";
		const tagId = "dsh-full-remote/interaction.module.css";
		if (typeof document !== "undefined" && !document.querySelector(`style[data-plugin-css="${tagId}"]`)) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-full-remote";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var interaction_module_css_default = {
			"queue": "_3H_igW_queue",
			"detail": "_3H_igW_detail",
			"optionCopy": "_3H_igW_optionCopy",
			"lede": "_3H_igW_lede",
			"plan": "_3H_igW_plan",
			"session": "_3H_igW_session",
			"badge": "_3H_igW_badge",
			"option": "_3H_igW_option",
			"footer": "_3H_igW_footer",
			"progress": "_3H_igW_progress",
			"primary": "_3H_igW_primary",
			"sheet": "_3H_igW_sheet",
			"optionHint": "_3H_igW_optionHint",
			"eyebrow": "_3H_igW_eyebrow",
			"options": "_3H_igW_options",
			"customInput": "_3H_igW_customInput",
			"optionMark": "_3H_igW_optionMark",
			"card": "_3H_igW_card",
			"icon": "_3H_igW_icon",
			"pager": "_3H_igW_pager",
			"secondary": "_3H_igW_secondary",
			"recommend": "_3H_igW_recommend",
			"heading": "_3H_igW_heading",
			"layer": "_3H_igW_layer",
			"backdrop": "_3H_igW_backdrop",
			"error": "_3H_igW_error",
			"title": "_3H_igW_title",
			"customRow": "_3H_igW_customRow",
			"danger": "_3H_igW_danger",
			"optionOn": "_3H_igW_optionOn",
			"header": "_3H_igW_header",
			"customTextarea": "_3H_igW_customTextarea",
			"meta": "_3H_igW_meta",
			"optionLabel": "_3H_igW_optionLabel",
			"actions": "_3H_igW_actions",
			"handle": "_3H_igW_handle",
			"customOn": "_3H_igW_customOn",
			"body": "_3H_igW_body"
		};
		//#endregion
		//#region src/client/InteractionOverlay.tsx
		/**
		* InteractionOverlay — mobile/remote confirmation sheet.
		*
		* Official question/approval UIs take over the conversation composer, which
		* only exists for the current session and is easy to miss on a phone. This
		* entry rides `shell.overlay` so a remote browser can always see and answer
		* pending host interactions.
		*/
		function isComposing(event) {
			return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
		}
		function emptyDrafts(questions) {
			return questions.map(() => ({
				selected: [],
				custom: "",
				skipped: false
			}));
		}
		/**
		* Frame-wide confirmation sheet. Renders nothing on the host desktop window
		* unless the viewport is phone-narrow, so it does not stack on the official
		* composer there.
		*/
		function InteractionOverlay({ t, enabled, openSession, answerApproval, answerQuestion, cancelQuestion, useRemotePending }) {
			const [autoEnabled, setAutoEnabled] = (0, react.useState)(() => enabled ?? shouldUseInteractionOverlay());
			(0, react.useEffect)(() => {
				if (enabled !== void 0) {
					setAutoEnabled(enabled);
					return;
				}
				const sync = () => {
					setAutoEnabled(shouldUseInteractionOverlay());
				};
				sync();
				window.addEventListener("resize", sync);
				return () => {
					window.removeEventListener("resize", sync);
				};
			}, [enabled]);
			const items = useRemotePending((state) => state.items);
			const show = enabled ?? autoEnabled;
			const item = items[0];
			if (!show || item === void 0) return null;
			const remaining = items.length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: interaction_module_css_default.layer,
				"data-remote-interact": item.presentation,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: interaction_module_css_default.backdrop }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: interaction_module_css_default.sheet,
					role: "dialog",
					"aria-modal": "true",
					"aria-labelledby": "dsh-remote-interact-title",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: interaction_module_css_default.handle,
							"aria-hidden": "true"
						}),
						remaining > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: interaction_module_css_default.queue,
							children: t("interact.queue", { count: remaining })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InteractBody, {
							item,
							t,
							openSession,
							answerApproval,
							answerQuestion,
							cancelQuestion
						})
					]
				})]
			});
		}
		function InteractBody(props) {
			const { item, t } = props;
			if (!item.ready) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: interaction_module_css_default.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: interaction_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: interaction_module_css_default.badge,
							children: t(item.kind === "approval" ? "interact.kind.approval" : "interact.kind.question")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: interaction_module_css_default.title,
							id: "dsh-remote-interact-title",
							children: t("interact.open.title")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: interaction_module_css_default.session,
						children: item.sessionTitle
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: interaction_module_css_default.lede,
						children: t("interact.open.hint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: interaction_module_css_default.actions,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: interaction_module_css_default.primary,
							type: "button",
							onClick: () => {
								props.openSession(item.sessionId);
							},
							children: t("interact.open.action")
						})
					})
				]
			});
			if (item.kind === "approval" && item.approval !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ApprovalFlow, {
				itemKey: item.key,
				sessionTitle: item.sessionTitle,
				toolName: item.approval.toolName,
				reason: item.approval.reason,
				t,
				onAnswer: props.answerApproval
			}, item.key);
			const questions = item.questions ?? [];
			const review = planReviewOf(questions);
			if (review !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlanReviewFlow, {
				itemKey: item.key,
				sessionTitle: item.sessionTitle,
				review,
				t,
				onAnswer: props.answerQuestion,
				onCancel: props.cancelQuestion
			}, item.key);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuestionFlow, {
				itemKey: item.key,
				sessionTitle: item.sessionTitle,
				questions,
				t,
				onAnswer: props.answerQuestion,
				onCancel: props.cancelQuestion
			}, item.key);
		}
		function ApprovalFlow(props) {
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const answer = (outcome) => {
				setBusy(true);
				setError(void 0);
				props.onAnswer(props.itemKey, outcome).catch((cause) => {
					setBusy(false);
					setError(cause instanceof Error ? cause.message : String(cause));
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: interaction_module_css_default.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: interaction_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: interaction_module_css_default.badge,
							children: props.t("interact.kind.approval")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: interaction_module_css_default.title,
							id: "dsh-remote-interact-title",
							children: props.t("interact.approval.title")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: interaction_module_css_default.session,
						children: props.sessionTitle
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: interaction_module_css_default.body,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: interaction_module_css_default.lede,
							children: props.reason ?? props.t("interact.approval.fallback", { tool: props.toolName })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: interaction_module_css_default.meta,
							children: props.t("interact.approval.tool", { tool: props.toolName })
						})]
					}),
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: interaction_module_css_default.error,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: interaction_module_css_default.actions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: interaction_module_css_default.danger,
							type: "button",
							disabled: busy,
							onClick: () => {
								answer("rejected");
							},
							children: props.t("interact.approval.reject")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: interaction_module_css_default.primary,
							type: "button",
							disabled: busy,
							onClick: () => {
								answer("allowed-once");
							},
							children: busy ? props.t("interact.busy") : props.t("interact.approval.allow")
						})]
					})
				]
			});
		}
		function PlanReviewFlow(props) {
			const [busy, setBusy] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const send = (label) => {
				setBusy("answer");
				setError(void 0);
				props.onAnswer(props.itemKey, { answers: [{
					id: props.review.id,
					selected: [label]
				}] }).catch((cause) => {
					setBusy(void 0);
					setError(cause instanceof Error ? cause.message : String(cause));
				});
			};
			const cancel = () => {
				setBusy("cancel");
				setError(void 0);
				props.onCancel(props.itemKey).catch((cause) => {
					setBusy(void 0);
					setError(cause instanceof Error ? cause.message : String(cause));
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: interaction_module_css_default.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: interaction_module_css_default.header,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: interaction_module_css_default.badge,
								children: props.t("interact.kind.plan")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: interaction_module_css_default.title,
								id: "dsh-remote-interact-title",
								children: props.review.question
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: interaction_module_css_default.icon,
								type: "button",
								"aria-label": props.t("interact.question.cancel"),
								disabled: busy !== void 0,
								onClick: cancel,
								children: "×"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: interaction_module_css_default.session,
						children: props.sessionTitle
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: interaction_module_css_default.body,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
							className: interaction_module_css_default.plan,
							children: props.review.plan
						})
					}),
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: interaction_module_css_default.error,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: interaction_module_css_default.actions,
						children: [props.review.decline !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: interaction_module_css_default.secondary,
							type: "button",
							disabled: busy !== void 0,
							onClick: () => {
								const decline = props.review.decline;
								if (decline !== void 0) send(decline);
							},
							children: props.t("interact.plan.decline")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: interaction_module_css_default.primary,
							type: "button",
							disabled: busy !== void 0,
							onClick: () => {
								send(props.review.approve);
							},
							children: busy === "answer" ? props.t("interact.busy") : props.t("interact.plan.approve")
						})]
					})
				]
			});
		}
		function QuestionFlow(props) {
			const questions = props.questions;
			const [index, setIndex] = (0, react.useState)(0);
			const [drafts, setDrafts] = (0, react.useState)(() => emptyDrafts(questions));
			const [busy, setBusy] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const question = questions[index] ?? questions[0];
			const draft = drafts[index] ?? drafts[0];
			if (question === void 0 || draft === void 0) return null;
			const hasOptions = (question.options?.length ?? 0) > 0;
			const updateDraft = (next) => {
				setDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? next(item) : item));
				setError(void 0);
			};
			const choose = (label) => {
				updateDraft((current) => {
					if (question.multiSelect === true) {
						const selected = current.selected.includes(label) ? current.selected.filter((item) => item !== label) : [...current.selected, label];
						return {
							...current,
							selected,
							skipped: false
						};
					}
					return {
						selected: [label],
						custom: "",
						skipped: false
					};
				});
				if (question.multiSelect !== true && index < questions.length - 1) setIndex((current) => current + 1);
			};
			const answered = (item) => item.selected.length > 0 || item.custom.trim() !== "";
			const completed = (item) => answered(item) || item.skipped;
			const submitDrafts = (values) => {
				const missing = values.findIndex((item) => !completed(item));
				if (missing >= 0) {
					setIndex(missing);
					setError(props.t("interact.question.incomplete"));
					return;
				}
				const answer = { answers: questions.map((item, itemIndex) => {
					const value = values[itemIndex] ?? {
						selected: [],
						custom: "",
						skipped: true
					};
					if (value.skipped) return {
						id: item.id,
						selected: []
					};
					const custom = value.custom.trim();
					return {
						id: item.id,
						selected: custom === "" || item.multiSelect === true ? value.selected : [],
						...custom === "" ? {} : { custom }
					};
				}) };
				setBusy("answer");
				setError(void 0);
				props.onAnswer(props.itemKey, answer).catch((cause) => {
					setBusy(void 0);
					setError(cause instanceof Error ? cause.message : String(cause));
				});
			};
			const continueFlow = () => {
				if (!answered(draft)) {
					setError(props.t("interact.question.unanswered"));
					return;
				}
				if (index < questions.length - 1) {
					setIndex((current) => current + 1);
					setError(void 0);
					return;
				}
				submitDrafts(drafts);
			};
			const draftCustom = (event) => {
				const value = event.target.value;
				updateDraft((current) => ({
					...current,
					selected: question.multiSelect === true ? current.selected : [],
					custom: value,
					skipped: false
				}));
			};
			const continueFromCustom = (event) => {
				if (event.key !== "Enter" || event.shiftKey || isComposing(event)) return;
				event.preventDefault();
				continueFlow();
			};
			const skipQuestion = () => {
				const nextDrafts = drafts.map((item, itemIndex) => itemIndex === index ? {
					selected: [],
					custom: "",
					skipped: true
				} : item);
				setDrafts(nextDrafts);
				setError(void 0);
				if (index < questions.length - 1) {
					setIndex((current) => current + 1);
					return;
				}
				submitDrafts(nextDrafts);
			};
			const cancel = () => {
				setBusy("cancel");
				setError(void 0);
				props.onCancel(props.itemKey).catch((cause) => {
					setBusy(void 0);
					setError(cause instanceof Error ? cause.message : String(cause));
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: interaction_module_css_default.card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: interaction_module_css_default.header,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: interaction_module_css_default.badge,
								children: props.t("interact.kind.question")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: interaction_module_css_default.heading,
								children: [question.header !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: interaction_module_css_default.eyebrow,
									children: question.header
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									className: interaction_module_css_default.title,
									id: "dsh-remote-interact-title",
									children: question.question
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: interaction_module_css_default.icon,
								type: "button",
								"aria-label": props.t("interact.question.cancel"),
								disabled: busy !== void 0,
								onClick: cancel,
								children: "×"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: interaction_module_css_default.session,
						children: props.sessionTitle
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: interaction_module_css_default.body,
						children: [question.detail !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: interaction_module_css_default.detail,
							children: question.detail
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: interaction_module_css_default.options,
							role: question.multiSelect === true ? "group" : "radiogroup",
							children: [(question.options ?? []).map((option, optionIndex) => {
								const selected = draft.selected.includes(option.label);
								const display = parseRecommendedLabel(option.label);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									className: selected ? `${interaction_module_css_default.option} ${interaction_module_css_default.optionOn}` : interaction_module_css_default.option,
									type: "button",
									role: question.multiSelect === true ? "checkbox" : "radio",
									"aria-checked": selected,
									"aria-label": display.label,
									disabled: busy !== void 0,
									onClick: () => {
										choose(option.label);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: interaction_module_css_default.optionMark,
										"aria-hidden": "true",
										children: question.multiSelect === true ? selected ? "✓" : "" : String(optionIndex + 1)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: interaction_module_css_default.optionCopy,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: interaction_module_css_default.optionLabel,
												children: display.label
											}),
											display.recommended && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: interaction_module_css_default.recommend,
												"aria-hidden": "true",
												children: props.t("interact.question.recommended")
											}),
											option.description !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: interaction_module_css_default.optionHint,
												children: option.description
											})
										]
									})]
								}, `${option.label}-${String(optionIndex)}`);
							}), hasOptions ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: draft.custom !== "" ? `${interaction_module_css_default.customRow} ${interaction_module_css_default.customOn}` : interaction_module_css_default.customRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: interaction_module_css_default.optionMark,
									"aria-hidden": "true",
									children: hasOptions ? "+" : ""
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: interaction_module_css_default.customInput,
									value: draft.custom,
									disabled: busy !== void 0,
									rows: 2,
									placeholder: props.t("interact.question.custom"),
									onChange: draftCustom,
									onKeyDown: continueFromCustom
								})]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: interaction_module_css_default.customTextarea,
								value: draft.custom,
								disabled: busy !== void 0,
								rows: 3,
								placeholder: props.t("interact.question.custom"),
								onChange: draftCustom,
								onKeyDown: continueFromCustom
							})]
						})]
					}),
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: interaction_module_css_default.error,
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: interaction_module_css_default.footer,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: interaction_module_css_default.pager,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: interaction_module_css_default.icon,
									type: "button",
									"aria-label": props.t("interact.question.prev"),
									disabled: index === 0 || busy !== void 0,
									onClick: () => {
										setIndex(index - 1);
										setError(void 0);
									},
									children: "‹"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: interaction_module_css_default.progress,
									children: [
										index + 1,
										" / ",
										questions.length
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: interaction_module_css_default.icon,
									type: "button",
									"aria-label": props.t("interact.question.nextNav"),
									disabled: index === questions.length - 1 || busy !== void 0,
									onClick: () => {
										setIndex(index + 1);
										setError(void 0);
									},
									children: "›"
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: interaction_module_css_default.actions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: interaction_module_css_default.secondary,
								type: "button",
								disabled: busy !== void 0,
								onClick: skipQuestion,
								children: props.t("interact.question.skip")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: interaction_module_css_default.primary,
								type: "button",
								disabled: busy !== void 0 || !answered(draft),
								onClick: continueFlow,
								children: busy === "answer" ? props.t("interact.busy") : index === questions.length - 1 ? props.t("interact.question.submit") : props.t("interact.question.next")
							})]
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/i18n.ts
		/**
		* Client-side dictionary for the reverse-proxy settings section.
		*
		* The locale service (`@deepseek-ai/dsh-client-locale`) is OPTIONAL: when the
		* host composition provides it, the dictionary is registered and every text
		* follows the active DeepSeek Harness locale; otherwise the page falls back
		* to the zh copy that matches the harness's own fallback locale.
		*/
		const NS = "reverse-proxy";
		const zh = {
			"action.label": "反向代理",
			"section.title": "反向代理",
			"section.intro": "发布一个受令牌保护的本地入口，把任意隧道指到下方地址即可远程使用 DeepSeek Harness。",
			"status.running": "代理正在运行",
			"status.stopped": "代理尚未运行",
			"status.loading": "正在读取状态…",
			"status.runningHint": "现在可以让任意 tunnel 指向下方本地端点。",
			"status.stoppedHint": "启动后会创建受令牌保护的本地入口。",
			"status.loadingHint": "正在从本机控制面加载代理状态。",
			"listen.label": "发布地址",
			"listen.description": "指定反向代理发布的 IP 与端口。端口填 0 表示自动选择空闲端口；修改后正在运行的代理会自动重启并生效。",
			"listen.host": "IP / 主机",
			"listen.port": "端口",
			"listen.apply": "应用发布地址",
			"listen.warn": "绑定非回环地址会直接暴露端口，请确保防火墙与 tunnel 配置正确。",
			"listen.wildcard": "0.0.0.0 / :: 会绑定所有网卡，但不是可连接的地址。手机同 WiFi 直连请填具体局域网 IP；下方复制的是一条可达地址。",
			"tunnel.label": "隧道目标",
			"tunnel.description": "将 frp、ngrok、cloudflared 或 SSH 隧道的本地目标设为：",
			"tunnel.bound": "当前绑定 {bind}（通配地址，不可直接连接）",
			"tunnel.copy": "复制",
			"tunnel.loading": "正在读取…",
			"token.label": "访问令牌",
			"token.description": "远程浏览器首次访问时必须输入此令牌。轮换后，现有远程会话会失效。",
			"token.reveal": "显示访问令牌",
			"token.rotate": "轮换令牌",
			busy: "处理中…",
			start: "启动代理",
			stop: "停止代理",
			"error.generic": "操作失败，请稍后重试。",
			"error.invalidListen": "请输入有效的发布地址和端口（0–65535）。",
			"error.invalidListenServer": "发布地址或端口无效。请检查 IP/主机和端口（0–65535）后再点「应用发布地址」。",
			"error.listenRestored": "新地址无法监听（端口可能被占用），已恢复到 {bind}。请换一个空闲端口后再点「应用发布地址」。",
			"error.listenFailed": "无法在 {bind} 上监听，这个端口很可能已被占用。请改成空闲端口（例如 3081）后再点「应用发布地址」。也可以先关掉占用该端口的程序。",
			"error.startListenFailed": "无法在 {bind} 上启动代理，这个端口很可能已被占用。请改成空闲端口（例如 127.0.0.1:3081），点「应用发布地址」，再点「启动代理」。也可以先关掉占用该端口的程序。",
			"error.startSelfLoop": "发布地址 {bind} 会和 Harness 后端 {backend} 撞在一起，启动会形成死循环。请把端口改成不同的值（默认 3081），点「应用发布地址」后再启动。",
			"error.startDisposed": "插件正在关闭或已卸载，无法启动。请刷新页面，或重启 DeepSeek Harness 后再试。",
			"error.startUnknown": "代理没有启动成功，但没有返回具体原因。请确认发布地址可用，或查看 Harness 日志。",
			"error.unknownReason": "操作未完成（{reason}）。请检查发布地址，或查看 Harness 日志。",
			"error.forbidden": "控制请求被拒绝。请用本机浏览器打开 127.0.0.1 上的 Harness 来操作此面板，不要从隧道或公网域名启动/停止代理。",
			"error.loopbackRequired": "只能从本机操作控制面板。请回到这台电脑上的 Harness 窗口再试。",
			"error.network": "无法联系控制接口：{detail}。请确认 Harness 仍在运行，并用本机浏览器打开面板。",
			"error.tlsFailed": "无法加载 TLS 证书或私钥。请检查 tlsCertFile / tlsKeyFile 路径后重试。",
			"error.tokenReadDisabled": "常驻读取令牌已关闭（allowTokenRead: false）。请轮换令牌以获得新值，或在配置中重新开启。",
			"error.invalidRequest": "请求无效，请检查输入后重试。",
			"error.sessionActionFailed": "设备操作未生效（会话可能已过期）。请刷新列表后再试。",
			"error.sessionsPoll": "无法刷新设备列表。",
			"error.invalidInviteBase": "邀请 Origin 无效。请填 http(s)://host[:port]，不要带路径。",
			"error.notRunning": "代理尚未运行，无法生成邀请。请先启动代理。",
			"token.copyLabel": "令牌",
			"toast.error": "无法完成",
			"toast.warn": "请注意",
			"toast.success": "已完成",
			"toast.dismiss": "关闭提示",
			"toast.started": "代理已启动。把隧道的本地目标设为下方复制的地址。",
			"toast.stopped": "代理已停止。",
			"toast.listenApplied": "发布地址已更新。",
			"toast.tokenRotated": "访问令牌已轮换，现有远程会话已失效。请重新生成手机邀请。",
			"toast.tokenRotatedWithIssue": "访问令牌已轮换，会话已清空；但代理未能按新状态重启：{detail}",
			"copied.target": "端点已复制。",
			"copied.token": "令牌已复制。",
			"copy.failed": "无法复制{label}。",
			"devices.title": "已连接设备",
			"devices.empty": "暂无设备。远程浏览器登录后会显示在这里。",
			"devices.approvalHint": "审批模式已开启：新设备需要在这里批准后才能访问。",
			"devices.pending": "待审批",
			"devices.active": "在线",
			"devices.kick": "踢出",
			"devices.approve": "批准",
			"devices.reject": "拒绝",
			"devices.lastSeen": "最近活动 {time}",
			"devices.lastSeenIp": "来源 IP {ip}",
			"devices.kicked": "已踢出该设备。",
			"devices.approved": "已批准该设备。",
			"devices.rejected": "已拒绝该设备。",
			"devices.rename": "重命名",
			"devices.renamePrompt": "设备显示名称",
			"devices.renameSave": "保存",
			"devices.renameCancel": "取消",
			"devices.renamed": "已更新设备名称。",
			"devices.renameFailed": "名称无效（需 1–64 个字符）。",
			"audit.label": "审计日志",
			"audit.description": "查看最近的安全事件（仅本机控制面可读）。",
			"audit.load": "加载审计日志",
			"audit.disabled": "审计日志未开启。",
			"audit.empty": "暂无审计事件。",
			"audit.filter": "事件筛选",
			"audit.filterPlaceholder": "例如 login.ok",
			"audit.limit": "数量",
			"audit.export": "导出审计日志",
			"audit.exported": "审计日志已导出。",
			"check.label": "栅栏自检",
			"check.run": "运行自检",
			"check.running": "正在探测 settings.describe…",
			"check.fenceOk": "特权栅栏已打通（{method} → HTTP {status}）。",
			"check.fenceFail": "特权栅栏仍关闭（{method} → HTTP {status}{detail}）。",
			"check.bootstrapOk": "客户端信任引导已生效（isLoopback 钉住）。",
			"check.bootstrapFail": "客户端信任引导失败——设置可能仍只落在内存。",
			"check.bootstrapMissing": "本页未检测到信任引导标记（请用代理入口打开）。",
			"check.proxyStopped": "代理未运行：自检只打后端；启动代理后再从手机验证端到端。",
			"check.tlsOn": "本地 TLS 已启用。",
			"check.tlsOff": "本地 TLS 未启用（明文 HTTP；公网请在隧道侧终止 TLS）。",
			"check.auditOn": "审计日志已开启。",
			"check.auditOff": "审计日志已关闭。",
			"check.trustForwardedForOn": "已启用 X-Forwarded-For 信任（仅回环对端）。",
			"check.trustForwardedForOff": "未启用 X-Forwarded-For 信任；隧道内客户端会显示为 127.0.0.1。",
			"check.tokenReadOn": "常驻令牌读取已开启（仅本机控制面）。",
			"check.tokenReadOff": "常驻令牌读取已关闭。",
			"tunnel.reachables": "其他可达地址",
			"tunnel.oneClick.label": "一键公网隧道",
			"tunnel.oneClick.badge": "临时 / 救急",
			"tunnel.oneClick.description": "在本机启动 Cloudflare 快速隧道（免费、免账号），得到一个随机的 https://…trycloudflare.com 地址。地址每次启动都会变，适合临时分享或救急；日常稳定入口请用你自己的 frp / ngrok / 命名隧道。",
			"tunnel.oneClick.start": "开启快速隧道",
			"tunnel.oneClick.stop": "关闭快速隧道",
			"tunnel.state.off": "未开启",
			"tunnel.state.resolving": "正在定位 cloudflared…",
			"tunnel.state.downloading": "首次使用需要下载 cloudflared（18–52 MB），请稍候…",
			"tunnel.state.connecting": "正在建立隧道…",
			"tunnel.state.online": "隧道在线",
			"tunnel.state.error": "隧道出错",
			"tunnel.hint.requiresProxy": "开启前需要先启动代理，隧道才有可转发的入口。",
			"tunnel.hint.tlsBlocked": "本地 TLS 已启用，不能同时开快速隧道（Cloudflare 边缘已提供 HTTPS）。",
			"tunnel.hint.ephemeral": "地址是随机的：关闭后再开会换一个新地址，旧的邀请链接和登录会失效。",
			"tunnel.hint.inviteUsesTunnel": "隧道在线：手机邀请将使用隧道地址（可手动覆盖上方 Origin）。",
			"tunnel.toast.online": "隧道已在线：{url}",
			"tunnel.toast.stopped": "隧道已关闭。",
			"tunnel.errorTlsUnsupported": "本地 TLS 已启用，不能同时开启快速隧道（Cloudflare 边缘已提供 HTTPS）。请关闭 tlsCertFile / tlsKeyFile 后再试。",
			"tunnel.errorDownloadFailed": "cloudflared 下载失败，请检查网络后重试。",
			"tunnel.errorIntegrityFailed": "cloudflared 下载内容校验失败，已丢弃。请重试，或自行安装后填写 cloudflaredPath。",
			"tunnel.errorConfiguredPathInvalid": "cloudflaredPath 指向的文件不可执行，请检查配置。",
			"tunnel.errorUnsupportedPlatform": "当前平台没有官方 cloudflared 构建（如 Windows ARM64）。请自行安装后填写 cloudflaredPath。",
			"tunnel.errorSpawnFailed": "cloudflared 进程无法启动，请确认二进制可用。",
			"tunnel.errorConnectFailed": "隧道建立失败，请重试。",
			"tunnel.errorConnectTimeout": "隧道建立超时（45 秒），请检查网络后重试。",
			"tunnel.errorExited": "隧道意外退出，请重新开启。",
			"invite.label": "手机邀请",
			"guide.label": "推荐用法",
			"guide.description": "按场景选入口：在家走局域网直连，外出走你自己的隧道；「一键快速隧道」只做临时用途。",
			"guide.wifi": "在家 / 同一 WiFi：手机直接打开 {url}——最快最稳，不经过任何公网隧道。",
			"guide.wifiNone": "当前只绑定了回环地址：同一 WiFi 的手机想直连，请先在「发布地址」填本机局域网 IP（如 192.168.x.x）。",
			"guide.outside": "外出时：让 frp / Tailscale / 命名隧道指向下方「隧道目标」——本插件不绑定任何隧道工具，你自选的隧道就是推荐用法。",
			"guide.quick": "「一键快速隧道」地址每次随机、国内访问不稳定，只适合临时分享或救急，不建议作为日常入口。",
			"tunnel.target.recommended": "推荐：手机与这台电脑同一 WiFi 时，直接打开上方地址（局域网直连，最快）。",
			"invite.lanHint": "隧道未开启：Origin 留空时生成的邀请就是局域网直连链接（在家推荐）。",
			"invite.description": "生成一次性邀请链接与二维码（不含主令牌；用过即废。同 IP 60 秒内的自动重试会沿用同一台设备会话，不会在列表里多出一条）。公网隧道请填公网 Origin；留空则用上方隧道目标。",
			"invite.base": "公网 / 可达 Origin",
			"invite.generate": "生成邀请",
			"invite.copy": "复制邀请链接",
			"invite.copied": "邀请链接已复制。",
			"invite.placeholder": "https://your-tunnel.example",
			"invite.requiresRunning": "邀请只在代理运行时可用：启动代理后再生成二维码。",
			"interact.queue": "还有 {count} 项等待确认",
			"interact.busy": "提交中…",
			"interact.kind.approval": "审批",
			"interact.kind.question": "确认",
			"interact.kind.plan": "计划",
			"interact.open.title": "有操作需要确认",
			"interact.open.hint": "打开对应会话后即可在此选择或批准。",
			"interact.open.action": "打开会话",
			"interact.approval.title": "等待批准",
			"interact.approval.fallback": "工具 {tool} 需要批准后才能继续。",
			"interact.approval.tool": "工具：{tool}",
			"interact.approval.allow": "允许一次",
			"interact.approval.reject": "拒绝",
			"interact.question.cancel": "取消提问",
			"interact.question.custom": "其他（自行输入）",
			"interact.question.recommended": "推荐",
			"interact.question.skip": "跳过",
			"interact.question.next": "下一步",
			"interact.question.submit": "提交",
			"interact.question.prev": "上一题",
			"interact.question.nextNav": "下一题",
			"interact.question.incomplete": "还有问题未回答。",
			"interact.question.unanswered": "请先选择或输入答案。",
			"interact.plan.approve": "批准计划",
			"interact.plan.decline": "拒绝计划"
		};
		const en = {
			"action.label": "Reverse proxy",
			"section.title": "Reverse proxy",
			"section.intro": "Publish a token-gated local entry point. Point any tunnel at the address below to use DeepSeek Harness remotely.",
			"status.running": "Proxy is running",
			"status.stopped": "Proxy is not running",
			"status.loading": "Loading status…",
			"status.runningHint": "You can now point any tunnel at the local endpoint below.",
			"status.stoppedHint": "Starting it creates a token-protected local entry point.",
			"status.loadingHint": "Reading proxy status from the local control surface.",
			"listen.label": "Listen address",
			"listen.description": "IP and port the reverse proxy publishes. Port 0 picks a free port; changing the address restarts a running proxy automatically.",
			"listen.host": "IP / host",
			"listen.port": "Port",
			"listen.apply": "Apply listen address",
			"listen.warn": "Binding a non-loopback address exposes the port directly; make sure your firewall and tunnel are configured correctly.",
			"listen.wildcard": "0.0.0.0 / :: bind every interface but are not connectable destinations. For phone-on-WiFi, fill a concrete LAN IP. The copyable target below is a reachable address.",
			"tunnel.label": "Tunnel target",
			"tunnel.description": "Point your frp, ngrok, cloudflared, or SSH tunnel at:",
			"tunnel.bound": "Currently bound to {bind} (wildcard; not directly connectable)",
			"tunnel.copy": "Copy",
			"tunnel.loading": "Reading…",
			"token.label": "Access token",
			"token.description": "Remote browsers must enter this token on first visit. Rotating it invalidates existing remote sessions.",
			"token.reveal": "Show access token",
			"token.rotate": "Rotate token",
			busy: "Working…",
			start: "Start proxy",
			stop: "Stop proxy",
			"error.generic": "Operation failed, please retry.",
			"error.invalidListen": "Enter a valid listen address and port (0–65535).",
			"error.invalidListenServer": "Invalid listen address or port. Check the IP/host and port (0–65535), then press Apply listen address.",
			"error.listenRestored": "The new address cannot bind (the port is likely in use). Restored {bind}. Pick a free port and apply again.",
			"error.listenFailed": "Cannot listen on {bind}; that port is likely in use. Change to a free port (for example 3081) and apply again, or stop the program holding the port.",
			"error.startListenFailed": "Cannot start the proxy on {bind}; that port is likely in use. Change to a free port (for example 127.0.0.1:3081), press Apply listen address, then Start proxy. Or stop the program holding the port.",
			"error.startSelfLoop": "Listen address {bind} collides with the Harness backend {backend} and would loop onto itself. Change the port (default 3081), apply it, then start.",
			"error.startDisposed": "The plugin is shutting down or was unloaded, so it cannot start. Refresh the page or restart DeepSeek Harness.",
			"error.startUnknown": "The proxy did not start and no reason was returned. Check that the listen address is free, or read the Harness log.",
			"error.unknownReason": "The operation did not finish ({reason}). Check the listen address, or read the Harness log.",
			"error.forbidden": "The control request was rejected. Operate this panel from the Harness window on 127.0.0.1 — not from a tunnel or public hostname.",
			"error.loopbackRequired": "The control panel can only be used from this computer. Switch back to the local Harness window.",
			"error.network": "Cannot reach the control API: {detail}. Confirm Harness is still running and open the panel in the local browser.",
			"error.tlsFailed": "Could not load the TLS certificate or key. Check tlsCertFile / tlsKeyFile and try again.",
			"error.tokenReadDisabled": "Standing token reads are disabled (allowTokenRead: false). Rotate the token to obtain a new value, or re-enable reads in config.",
			"error.invalidRequest": "Invalid request. Check your input and retry.",
			"error.sessionActionFailed": "The device action did not apply (the session may have expired). Refresh the list and retry.",
			"error.sessionsPoll": "Could not refresh the device list.",
			"error.invalidInviteBase": "Invalid invite Origin. Use http(s)://host[:port] with no path.",
			"error.notRunning": "The proxy is not running, so no invite can be generated. Start the proxy first.",
			"token.copyLabel": "token",
			"toast.error": "Could not complete",
			"toast.warn": "Heads up",
			"toast.success": "Done",
			"toast.dismiss": "Dismiss",
			"toast.started": "Proxy is running. Point your tunnel’s local target at the address below.",
			"toast.stopped": "Proxy stopped.",
			"toast.listenApplied": "Listen address updated.",
			"toast.tokenRotated": "Access token rotated. Existing remote sessions are now invalid. Generate a new phone invite.",
			"toast.tokenRotatedWithIssue": "Access token rotated and sessions cleared, but the proxy did not restart cleanly: {detail}",
			"copied.target": "Target copied.",
			"copied.token": "Token copied.",
			"copy.failed": "Cannot copy {label}.",
			"devices.title": "Connected devices",
			"devices.empty": "No devices yet. Remote browsers appear here after logging in.",
			"devices.approvalHint": "Approval mode is on: new devices must be approved here before they can connect.",
			"devices.pending": "Pending approval",
			"devices.active": "Online",
			"devices.kick": "Kick",
			"devices.approve": "Approve",
			"devices.reject": "Reject",
			"devices.lastSeen": "Last seen {time}",
			"devices.lastSeenIp": "Source IP {ip}",
			"devices.kicked": "Device kicked.",
			"devices.approved": "Device approved.",
			"devices.rejected": "Device rejected.",
			"devices.rename": "Rename",
			"devices.renamePrompt": "Device display name",
			"devices.renameSave": "Save",
			"devices.renameCancel": "Cancel",
			"devices.renamed": "Device name updated.",
			"devices.renameFailed": "Invalid name (need 1–64 characters).",
			"audit.label": "Audit log",
			"audit.description": "View recent security events (readable from the local control surface only).",
			"audit.load": "Load audit log",
			"audit.disabled": "Audit logging is off.",
			"audit.empty": "No audit events yet.",
			"audit.filter": "Event filter",
			"audit.filterPlaceholder": "e.g. login.ok",
			"audit.limit": "Limit",
			"audit.export": "Export audit log",
			"audit.exported": "Audit log exported.",
			"check.label": "Fence self-check",
			"check.run": "Run self-check",
			"check.running": "Probing settings.describe…",
			"check.fenceOk": "Privilege fence is open ({method} → HTTP {status}).",
			"check.fenceFail": "Privilege fence still closed ({method} → HTTP {status}{detail}).",
			"check.bootstrapOk": "Client trust bootstrap is active (isLoopback pinned).",
			"check.bootstrapFail": "Client trust bootstrap failed — settings may stay memory-scoped.",
			"check.bootstrapMissing": "No trust bootstrap marker on this page (open via the proxy entry).",
			"check.proxyStopped": "Proxy is stopped: self-check hits the backend only. Start the proxy to verify end-to-end from a phone.",
			"check.tlsOn": "Local TLS is enabled.",
			"check.tlsOff": "Local TLS is off (plain HTTP; terminate TLS on the tunnel for public access).",
			"check.auditOn": "Audit logging is on.",
			"check.auditOff": "Audit logging is off.",
			"check.trustForwardedForOn": "X-Forwarded-For trust is enabled (loopback peers only).",
			"check.trustForwardedForOff": "X-Forwarded-For trust is off; tunnel clients all appear as 127.0.0.1.",
			"check.tokenReadOn": "Standing token reads are on (loopback control surface only).",
			"check.tokenReadOff": "Standing token reads are disabled.",
			"tunnel.reachables": "Other reachable addresses",
			"tunnel.oneClick.label": "One-click public tunnel",
			"tunnel.oneClick.badge": "Temporary",
			"tunnel.oneClick.description": "Start a Cloudflare quick tunnel on this machine (free, no account) and get a random https://…trycloudflare.com address. The address changes on every start, so it suits temporary sharing; for a stable daily entry use your own frp / ngrok / named tunnel.",
			"tunnel.oneClick.start": "Start quick tunnel",
			"tunnel.oneClick.stop": "Stop quick tunnel",
			"tunnel.state.off": "Off",
			"tunnel.state.resolving": "Locating cloudflared…",
			"tunnel.state.downloading": "First use downloads cloudflared (18–52 MB), please wait…",
			"tunnel.state.connecting": "Establishing the tunnel…",
			"tunnel.state.online": "Tunnel online",
			"tunnel.state.error": "Tunnel error",
			"tunnel.hint.requiresProxy": "Start the proxy first — the tunnel needs a listener to forward to.",
			"tunnel.hint.tlsBlocked": "Local TLS is on, which cannot be combined with the quick tunnel (the Cloudflare edge already provides HTTPS).",
			"tunnel.hint.ephemeral": "The address is random: stopping and restarting produces a new one, and old invite links and logins stop working.",
			"tunnel.hint.inviteUsesTunnel": "Tunnel online: phone invites will use the tunnel address (the Origin above can still override it).",
			"tunnel.toast.online": "Tunnel online: {url}",
			"tunnel.toast.stopped": "Tunnel stopped.",
			"tunnel.errorTlsUnsupported": "Local TLS is enabled, which cannot be combined with the quick tunnel (the Cloudflare edge already provides HTTPS). Disable tlsCertFile / tlsKeyFile and retry.",
			"tunnel.errorDownloadFailed": "cloudflared download failed. Check the network and retry.",
			"tunnel.errorIntegrityFailed": "The cloudflared download failed its checksum and was discarded. Retry, or install it yourself and set cloudflaredPath.",
			"tunnel.errorConfiguredPathInvalid": "The cloudflaredPath file is not executable. Check the config.",
			"tunnel.errorUnsupportedPlatform": "There is no official cloudflared build for this platform (for example Windows ARM64). Install it yourself and set cloudflaredPath.",
			"tunnel.errorSpawnFailed": "The cloudflared process could not start. Check that the binary works.",
			"tunnel.errorConnectFailed": "The tunnel failed to establish. Retry.",
			"tunnel.errorConnectTimeout": "The tunnel timed out (45 s). Check the network and retry.",
			"tunnel.errorExited": "The tunnel exited unexpectedly. Start it again.",
			"invite.label": "Phone invite",
			"guide.label": "Recommended setup",
			"guide.description": "Pick the entry by scenario: LAN while at home, your own tunnel on the road. The one-click quick tunnel is for temporary use only.",
			"guide.wifi": "At home / same Wi-Fi: open {url} on the phone — fastest and most stable, no public tunnel involved.",
			"guide.wifiNone": "The proxy is loopback-only right now. To let a phone on the same Wi-Fi connect directly, fill this machine’s LAN IP (e.g. 192.168.x.x) under Listen address.",
			"guide.outside": "On the road: point frp / Tailscale / a named tunnel at the tunnel target below — the plugin works with any tunnel you choose.",
			"guide.quick": "The one-click quick tunnel gets a random address on every start and is unstable from some networks (notably mainland mobile). Use it for temporary sharing or emergencies only.",
			"tunnel.target.recommended": "Recommended: with the phone on the same Wi-Fi, open the address above directly (LAN, fastest).",
			"invite.lanHint": "Tunnel off: leaving Origin blank builds a LAN direct invite (recommended at home).",
			"invite.description": "Build a one-time invite URL and QR (no standing token; single use. Same-IP retries within 60 seconds reuse the original session instead of adding a second device). For a public tunnel, enter that Origin; leave blank to use the tunnel target above.",
			"invite.base": "Public / reachable Origin",
			"invite.generate": "Generate invite",
			"invite.copy": "Copy invite link",
			"invite.copied": "Invite link copied.",
			"invite.placeholder": "https://your-tunnel.example",
			"invite.requiresRunning": "Invites only work while the proxy is running. Start the proxy first.",
			"interact.queue": "{count} items waiting",
			"interact.busy": "Submitting…",
			"interact.kind.approval": "Approval",
			"interact.kind.question": "Question",
			"interact.kind.plan": "Plan",
			"interact.open.title": "Action needs confirmation",
			"interact.open.hint": "Open the session to choose or approve here.",
			"interact.open.action": "Open session",
			"interact.approval.title": "Waiting for approval",
			"interact.approval.fallback": "Tool {tool} needs approval before it can continue.",
			"interact.approval.tool": "Tool: {tool}",
			"interact.approval.allow": "Allow once",
			"interact.approval.reject": "Reject",
			"interact.question.cancel": "Cancel question",
			"interact.question.custom": "Other (type your own)",
			"interact.question.recommended": "Recommended",
			"interact.question.skip": "Skip",
			"interact.question.next": "Next",
			"interact.question.submit": "Submit",
			"interact.question.prev": "Previous question",
			"interact.question.nextNav": "Next question",
			"interact.question.incomplete": "Some questions are still unanswered.",
			"interact.question.unanswered": "Choose or type an answer first.",
			"interact.plan.approve": "Approve plan",
			"interact.plan.decline": "Decline plan"
		};
		/** Translate against one fixed dictionary (used for tests and the fallback). */
		function translatorFor(dict) {
			return (key, params) => {
				const template = dict[key] ?? key;
				if (params === void 0) return template;
				return template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
			};
		}
		const fallback = translatorFor(zh);
		/**
		* Register the namespace with the optional locale runtime and return a
		* translate function bound to it. Without the locale service the stable zh
		* fallback is returned.
		*/
		function bindTranslate(ctx) {
			const locale = ctx.get("locale");
			if (locale === void 0) return { t: fallback };
			const dispose = locale.register(NS, {
				zh: { ...zh },
				en: { ...en }
			});
			const bound = locale.bind(NS);
			return {
				t: (key, params) => bound(key, params),
				dispose
			};
		}
		//#endregion
		//#region src/client/trust-settings.ts
		/**
		* Backup wrap if the index-tap pin of `connection.isLoopback` did not run.
		*
		* Official settings plugins bind during their own apply, which is earlier
		* than this client plugin. After a successful pin, `getConnection()` already
		* reports `isLoopback === true` and this function returns without assigning
		* `binder.bind` (settingsScope is a Cordis Service proxy; assigning methods
		* on it has the same class of bug as assigning `ctx.provide` — issue #9).
		*
		* When the pin missed, wrap `bind` for any consumer that binds later.
		* The durable declaration is `__DSH_FULL_REMOTE_TRUSTED__` (stand-in until
		* upstream `__DSH_BOOT__` grows a trust field). That flag means the
		* ModuleLoader wrap installed, not that every mixin method is healthy.
		*/
		/** True when this plugin's index tap ran and the page is not loopback. */
		function pageNeedsHostSettingsPersistence(hostname = globalThis.location?.hostname ?? "", trusted = globalThis.__DSH_FULL_REMOTE_TRUSTED__) {
			return trusted === 1 && hostname !== "" && !isLoopbackHost(hostname);
		}
		/**
		* Wrap `binder.bind` so a remote, plugin-trusted page persists settings to
		* the host document. No-op when the page is already loopback, when the tap
		* flag is missing, when the handle is already pinned, or when bind was
		* already wrapped.
		*/
		function trustSettingsPersistence(binder, getConnection, options) {
			if (!pageNeedsHostSettingsPersistence(options?.hostname, options?.trusted)) return;
			if (typeof binder.bind !== "function") return;
			if (binder.bind.__dshFullRemoteTrusted === true) return;
			if (getConnection()?.isLoopback === true) return;
			const original = binder.bind;
			const wrapped = function wrapped(spec) {
				const connection = getConnection();
				if (connection === void 0 || connection.isLoopback === true) return original.call(this, spec);
				const previous = connection.isLoopback;
				try {
					Object.defineProperty(connection, "isLoopback", {
						value: true,
						configurable: true,
						enumerable: true,
						writable: true
					});
				} catch {
					return original.call(this, spec);
				}
				try {
					return original.call(this, spec);
				} finally {
					try {
						Object.defineProperty(connection, "isLoopback", {
							value: previous,
							configurable: true,
							enumerable: true,
							writable: true
						});
					} catch {}
				}
			};
			wrapped.__dshFullRemoteTrusted = true;
			binder.bind = wrapped;
		}
		//#endregion
		//#region src/control.ts
		/**
		* Frozen control-surface identifiers (roadmap §7.1 class 2/3/4).
		*
		* Plugin id, cookie name, this prefix, the forwarding header, and the
		* polyfill marker are frozen: renaming any of them drops sessions or
		* silently disables anti-spoof stripping. Only the npm package name moves.
		*
		* The client bundle imports this module (no Node builtins).
		*/
		const CONTROL_PREFIX = "/dsh-reverse-proxy";
		const CONTROL_HEADER = "x-dsh-reverse-proxy-control";
		//#endregion
		//#region src/client/index.ts
		const inject = ["slots"];
		/**
		* Map a control-surface HTTP failure to the Error `toastFromCaught` already
		* understands. The public proxy answers `/dsh-reverse-proxy/*` with plain
		* `403 forbidden` (not JSON), so a phone that opens Settings → Reverse proxy
		* must not surface a locale-stuck "请求失败 (403)".
		*/
		function errorFromControlResponse(status, body) {
			const code = typeof body.error === "string" ? body.error.trim() : "";
			if (code !== "") return new Error(code);
			if (status === 403 || status === 401) return /* @__PURE__ */ new Error("forbidden");
			return /* @__PURE__ */ new Error(`HTTP ${status}`);
		}
		function withQuery(path, params) {
			const search = new URLSearchParams();
			for (const [key, value] of Object.entries(params)) {
				if (value === void 0 || value === "") continue;
				search.set(key, String(value));
			}
			const query = search.toString();
			return query === "" ? path : `${path}?${query}`;
		}
		function controlFetch(path, init) {
			return fetch(`${CONTROL_PREFIX}${path}`, {
				credentials: "same-origin",
				...init,
				headers: {
					...init?.headers ?? {},
					[CONTROL_HEADER]: "1"
				}
			});
		}
		async function request(path, init) {
			const response = await controlFetch(path, init);
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw errorFromControlResponse(response.status, body);
			return body;
		}
		async function requestBlob(path) {
			const response = await controlFetch(path);
			if (!response.ok) {
				const body = await response.json().catch(() => ({}));
				throw errorFromControlResponse(response.status, body);
			}
			return response.blob();
		}
		function createApi() {
			const post = (path, body) => request(path, {
				method: "POST",
				...body === void 0 ? {} : {
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body)
				}
			});
			return {
				status: () => request("/status"),
				start: () => post("/start"),
				stop: () => post("/stop"),
				token: async () => (await request("/token")).accessToken,
				rotateToken: () => post("/rotate-token"),
				setListen: (host, port) => post("/listen", {
					host,
					port
				}),
				sessions: async () => (await request("/sessions")).sessions ?? [],
				approveSession: (id) => post("/sessions/approve", { id }),
				revokeSession: (id) => post("/sessions/revoke", { id }),
				renameSession: (id, label) => post("/sessions/rename", {
					id,
					label
				}),
				selfCheck: async () => {
					const result = await post("/self-check");
					const trusted = globalThis.__DSH_FULL_REMOTE_TRUSTED__ === 1;
					const failed = globalThis.__DSH_FULL_REMOTE_BOOTSTRAP_FAILED__ === 1;
					return {
						...result,
						trustBootstrap: trusted,
						bootstrapFailed: failed
					};
				},
				invite: (publicBase) => post("/invite", publicBase === void 0 ? {} : { publicBase }),
				audit: (limit, event) => request(withQuery("/audit", {
					limit,
					event
				})),
				startTunnel: () => post("/tunnel/start"),
				stopTunnel: () => post("/tunnel/stop"),
				exportAudit: (event) => requestBlob(withQuery("/audit/export", { event }))
			};
		}
		function apply(ctx) {
			ctx.inject(["settingsScope"], (scope) => {
				trustSettingsPersistence(scope.get("settingsScope"), () => scope.get("connection"));
			});
			const api = createApi();
			const { t, dispose } = bindTranslate(ctx);
			if (dispose !== void 0) ctx.effect(() => dispose);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "reverse-proxy",
				order: 30,
				label: () => t("action.label"),
				inject: () => ({
					api,
					t
				})
			}, RemoteSection));
			ctx.inject(["sessions"], (scope) => {
				const sessions = scope.get("sessions");
				if (sessions === void 0) return;
				const source = createPendingSource(sessions);
				scope.effect(() => () => {
					source.dispose();
				}, "reverse-proxy: pending overlay");
				scope.slots.inject("shell.overlay", () => scope.slots.register({
					name: "shell.overlay",
					id: "reverse-proxy-interact",
					order: 40,
					inject: () => ({
						t,
						openSession: (id) => {
							sessions.open(id);
						},
						answerApproval: (key, outcome) => source.answerApproval(key, outcome),
						answerQuestion: source.answerQuestion,
						cancelQuestion: source.cancelQuestion,
						hooks: { remotePending: source }
					})
				}, InteractionOverlay));
			});
		}
		//#endregion
		exports.apply = apply;
		exports.errorFromControlResponse = errorFromControlResponse;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map