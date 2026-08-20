// dsh-continuous-worker — handover work orders (docs/02 §13.9 / §12 M3).
//
// M4: Paseo-style handoff shape (Task/Context/Relevant files/Current state/
// What was tried/Decisions/Acceptance criteria/Constraints) — produced on
// downgrade / pause / restart so the next worker (or the human) resumes with
// full context instead of starting from zero.

/** Build one handover work order (lossless JSON, evidence-referencing). */
export function buildHandoverWorkOrder(input) {
  if (typeof input.task !== "string" || input.task.trim().length === 0) {
    throw new Error("cw handover: task is required");
  }
  const payload = {
    kind: "handover",
    task: input.task.trim(),
    createdAt: new Date().toISOString(),
    workerId: input.workerId ?? "worker",
  };
  const sections = {
    context: input.context,
    relevantFiles: input.relevantFiles,
    currentState: input.currentState,
    whatWasTried: input.whatWasTried,
    decisions: input.decisions,
    acceptanceCriteria: input.acceptanceCriteria,
    constraints: input.constraints,
    nextSteps: input.nextSteps,
    evidenceRefs: input.evidenceRefs,
  };
  for (const [key, value] of Object.entries(sections)) {
    if (value !== undefined) payload[key] = Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.length > 0) : value;
  }
  return payload;
}

/** Render one work order to the Paseo-style markdown handoff format. */
export function renderHandover(wo) {
  const lines = [`## Task`, wo.task ?? ""];
  const pushSection = (title, value) => {
    if (value === undefined) return;
    const body = Array.isArray(value) ? value.map((v) => `- ${v}`).join("\n") : String(value);
    if (body.trim().length > 0) lines.push(`\n## ${title}`, body);
  };
  pushSection("Context", wo.context);
  pushSection("Relevant files", wo.relevantFiles);
  pushSection("Current state", wo.currentState);
  pushSection("What was tried", wo.whatWasTried);
  pushSection("Decisions", wo.decisions);
  pushSection("Acceptance criteria", wo.acceptanceCriteria);
  pushSection("Constraints", wo.constraints);
  pushSection("Next steps", wo.nextSteps);
  if (Array.isArray(wo.evidenceRefs) && wo.evidenceRefs.length > 0) {
    lines.push("\n## Evidence", wo.evidenceRefs.map((e) => `- ${e}`).join("\n"));
  }
  return lines.join("\n");
}

export const internals = { renderHandover };
