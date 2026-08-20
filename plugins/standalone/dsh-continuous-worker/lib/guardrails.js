// dsh-continuous-worker — guardrails: supply-chain install interception +
// supervision matrix (M2 foundation, docs/02 §13.13/§13.14).
//
// M2 scope:
//   - supplyChain: classify tools/packages by trust tier (T1-T4) and expose
//     the decision the host-side pre-execute hook should apply. The actual
//     tools/pre-execute wiring is installed by the plugin (index.js); this
//     module owns the *policy* and the pure decision logic.
//   - supervision: map task types to a platform sandbox/approval preset
//     (docs/02 §13.14). Sandbox modes are the closed vocabulary
//     read-only | workspace-write | danger-full-access.

export const TRUST_TIERS = Object.freeze({
  T1: "T1", // host-builtin / plugin-owned / user-placed
  T2: "T2", // verified (signature/hash matched)
  T3: "T3", // community market
  T4: "T4", // unverified -> block
});

export const SANDBOX_MODES = Object.freeze(["read-only", "workspace-write", "danger-full-access"]);

/**
 * Classify one tool invocation by supply-chain tier.
 * Pure decision logic — the host hook enforces it.
 *
 * Install-like = the *command text* contains an install/download/execute-third-
 * party pattern (npm/pnpm/pip/uv install, curl|bash, git clone), OR the tool
 * itself IS an installer (npm, pip, uv, git). Generic shells (pwsh/bash/sh)
 * are only install-like when their command text matches — `echo` is not.
 *
 * @param {object} call - { toolName, args }
 * @param {object} policy - { verifyOnInstall, tiers, defaultSkillTier }
 * @returns {{ tier: string, allow: boolean, reason: string, approval: "never"|"ask"|"block" }}
 */
export function classifySupplyCall(call, policy = {}) {
  const tool = call.toolName ?? "";
  const args = call.args ?? {};
  const commandText = typeof args.command === "string" ? args.command : "";
  const shellText = typeof args.script === "string" ? args.script : "";
  const text = `${commandText}\n${shellText}`;

  // Installer TOOLS: only actual installers (npx included — it fetches
  // packages on first run). `git` alone is NOT install-like (M2 C4 fix: only
  // clone/submodule commands are) — status/log/diff must not be blocked.
  const installerTool = /^(npm|pnpm|yarn|pip|pip3|uv|npx|apt|apt-get|dnf|brew)\b/i.test(tool);

  // Install-like COMMAND patterns across shells (M2 C4 fix: cover the host's
  // default PowerShell terminal iwr|iex, plus apt-get/docker).
  const installCommand =
    /(^|\s)(npm|pnpm|yarn|pip|pip3|uv|npx)\s+(install|add|i|exec|run)(\s|$)/i.test(text) ||
    /(^|\s)npx\s+[\w@/-]+\s/i.test(text) || // npx <pkg> executes third-party code
    /(^|\s)(apt-get|apt|dnf|brew)\s+(install|update|upgrade)(\s|$)/i.test(text) ||
    /docker\s+run/i.test(text) ||
    /curl\s+.*\|\s*(bash|sh)/i.test(text) ||
    /iwr\s+.*\|\s*iex/i.test(text) || // PowerShell iwr|iex (host default terminal)
    /(Invoke-WebRequest|Invoke-RestMethod).*iex/i.test(text) ||
    /git\s+(clone|submodule\s+(add|update))/i.test(text) ||
    /(wget|curl)\s+(-O|-o)?\s*\S+\.(sh|py|js)\s*(\|\s*(bash|sh|python|node))?/i.test(text);

  if (!installerTool && !installCommand) {
    return { tier: TRUST_TIERS.T1, allow: true, reason: "not an install/execute pattern", approval: "never" };
  }

  const verifyOnInstall = policy.verifyOnInstall ?? true;
  if (verifyOnInstall === false) {
    // M2 补充 fix: verifyOnInstall:false is a user OPT-OUT, not "verified".
    return {
      tier: TRUST_TIERS.T2,
      allow: true,
      reason: "verifyOnInstall disabled by user opt-out (NOT provenance-verified)",
      approval: "never",
    };
  }
  // M2 C4 fix: T4 is REACHABLE — a caller may pre-declare an unverified source
  // explicitly (e.g. from a skill with no provenance record); otherwise
  // unverified installs are T3 ask (never block outright in M2 default).
  if (policy.forceT4 === true) {
    return {
      tier: TRUST_TIERS.T4,
      allow: false, // T4 = block (fail-closed)
      reason: "unverified source (T4) — blocked",
      approval: "block",
    };
  }
  return {
    tier: TRUST_TIERS.T3,
    allow: true, // T3 = ask approval
    reason: "unverified install/execute — requires approval (T3)",
    approval: "ask",
  };
}

/**
 * Resolve the supervision preset for a task type.
 * @param {string} taskType - probe | internal | workspace | external | admin
 * @returns {{ sandbox: string, approval: string }}
 */
export function supervisionPreset(taskType) {
  switch (taskType) {
    case "probe":
      return { sandbox: "read-only", approval: "never" };
    case "internal":
      return { sandbox: "read-only", approval: "never" };
    case "workspace":
      return { sandbox: "workspace-write", approval: "ask" };
    case "external":
      return { sandbox: "read-only", approval: "ask" };
    case "admin":
      return { sandbox: "read-only", approval: "ask" };
    default:
      return { sandbox: "workspace-write", approval: "ask" };
  }
}

/** Guardrails snapshot for cw_status / audit. */
export function guardrailsSnapshot() {
  return {
    trustTiers: Object.values(TRUST_TIERS),
    sandboxModes: SANDBOX_MODES,
    supervision: {
      probe: supervisionPreset("probe"),
      internal: supervisionPreset("internal"),
      workspace: supervisionPreset("workspace"),
      external: supervisionPreset("external"),
      admin: supervisionPreset("admin"),
    },
  };
}

export const internals = { installPattern: /(npm|pnpm|pip|uv)\s+(install|add|i\s)/i };
