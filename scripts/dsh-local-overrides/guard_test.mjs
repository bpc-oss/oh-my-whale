// Offline unit test for promise-guard.mjs — no DSH host needed.
import { pathToFileURL } from "node:url";

const mod = await import(pathToFileURL(process.argv[2]).href);
const results = [];
const check = (label, ok, extra = "") => results.push([label, ok, extra]);

function harness({ text, toolCall = false, flow = [] }) {
  const events = [
    { type: "assistant/message", data: { turn: 1, step: 1, message: { role: "assistant", content: [{ type: "reasoning", text: "thinking" }, { type: "text", text }] } } },
  ];
  if (toolCall) events.push({ type: "tool/call", data: { turn: 1, step: 1, name: "pwsh" } });
  const session = { id: "s1", header: { delegationDepth: 0 }, events: [...events, ...flow] };
  const calls = [];
  const warnings = [];
  const agent = { session, inbox: { nextTurn: [], prepend: (t, m) => calls.push([t, m]) } };
  const handlers = {};
  const ctx = {
    on: (evt, fn) => { handlers[evt] = fn },
    get: () => agent,
    logger: { warn: (m) => warnings.push(m) },
  };
  mod.apply(ctx, {});
  return { session, handlers, calls, warnings, agent };
}

// 1. promise + no tool call  -> exactly one corrective next-turn
{
  const h = harness({ text: "抱歉，又说没做——立刻补上。调用视觉工具看第一张共享图的真实内容：" });
  h.handlers["session/event"](h.session, { type: "step/end", data: { turn: 1, step: 1 } });
  check("promise, no tool call -> 1 nudge", h.calls.length === 1, JSON.stringify(h.calls.map((c) => c[0])));
  check("nudge goes to next-turn as plugin source",
    h.calls[0]?.[0] === "next-turn" && h.calls[0]?.[1]?.source?.plugin === mod.name);
  check("nudge text is the corrective prompt", h.calls[0]?.[1]?.content?.[0]?.text === mod.NUDGE_TEXT);
  check("warning logged (visible error)", h.warnings.length === 1, h.warnings[0]?.slice(0, 80));
}

// 2. same step DID call a tool -> no nudge
{
  const h = harness({ text: "立刻调用工具：", toolCall: true });
  h.handlers["session/event"](h.session, { type: "step/end", data: { turn: 1, step: 1 } });
  check("tool call in step -> no nudge", h.calls.length === 0);
}

// 3. ordinary answer -> no nudge
{
  const h = harness({ text: "结论：两组图像的 MD5 完全相同，说明复用同一素材。" });
  h.handlers["session/event"](h.session, { type: "step/end", data: { turn: 1, step: 1 } });
  check("plain answer -> no nudge", h.calls.length === 0);
}

// 4. a question to the user -> no nudge
{
  const h = harness({ text: "你希望我先看哪一张？" });
  h.handlers["session/event"](h.session, { type: "step/end", data: { turn: 1, step: 1 } });
  check("question -> no nudge", h.calls.length === 0);
}

// 5. rate limit: 6 promising steps -> at most maxNudgesPerWindow (default 3)
{
  const h = harness({ text: "接下来我会调用工具：" });
  for (let i = 0; i < 6; i++) {
    h.session.events.push({ type: "assistant/message", data: { turn: 10 + i, step: 1, message: { content: [{ type: "text", text: "接下来我会调用工具：" }] } } });
    h.handlers["session/event"](h.session, { type: "step/end", data: { turn: 10 + i, step: 1 } });
  }
  check("rate limited to 3 per window", h.calls.length === 3, "got " + h.calls.length);
}

// 6. subagent skipped by default
{
  const h = harness({ text: "立刻调用工具：" });
  h.session.header.delegationDepth = 1;
  h.handlers["session/event"](h.session, { type: "step/end", data: { turn: 1, step: 1 } });
  check("subagent skipped", h.calls.length === 0);
}

let bad = 0;
for (const [label, ok, extra] of results) {
  if (!ok) bad++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${extra ? "   [" + extra + "]" : ""}`);
}
console.log(`\n${results.length - bad}/${results.length} checks passed`);
process.exit(bad === 0 ? 0 : 1);
