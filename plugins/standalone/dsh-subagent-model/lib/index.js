// dsh-subagent-model - host side: read-only model info for subagent sessions.
// POST /subagent-model/read {sessionId} -> {live, provider?, model?, reason?}
//
// Data source: the host AgentRegistry (`ctx.get("agents")`) tracks LIVE agents
// by SessionId; a created child carries provider/model in its agentOptions
// (resolveChildAgentOptions), so `agent.options.provider/.model` is exactly
// what the child dispatch was configured with. This is an in-process read -
// it does NOT go through the api-remotes resolver, whose fence (agent-busy)
// intentionally blocks generic session RPCs for addressed subagents.
export const inject = ["webServer"];

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/subagent-model",
    handler: async (req, res) => {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname.replace(/\/+$/, "") || "/";
      if (req.method !== "POST" || path !== "/subagent-model/read") {
        sendJson(res, 404, { error: "not-found" });
        return;
      }
      let body = null;
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        sendJson(res, 400, { error: "bad-json" });
        return;
      }
      const sessionId = body && typeof body.sessionId === "string" ? body.sessionId : "";
      if (!sessionId) {
        sendJson(res, 400, { error: "missing-sessionId" });
        return;
      }
      try {
        const agents = ctx.get("agents");
        if (agents === void 0 || typeof agents.get !== "function") {
          sendJson(res, 200, { live: false, reason: "agents-service-unavailable" });
          return;
        }
        const agent = agents.get(sessionId);
        if (agent === void 0 || agent.options === void 0) {
          // cold / ended subagent: no live agent to read.
          sendJson(res, 200, { live: false, reason: "no-live-agent" });
          return;
        }
        sendJson(res, 200, {
          live: true,
          provider: agent.options.provider ?? null,
          model: agent.options.model ?? null,
        });
      } catch (e) {
        // fail soft: display-only plugin must never 500 the header row.
        sendJson(res, 200, { live: false, reason: String((e && e.message) ? e.message : e) });
      }
    },
  }), "dsh-subagent-model: routes");
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body) + "\n");
}
