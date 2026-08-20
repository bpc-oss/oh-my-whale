// R3-1 对照实验（第三轮复审）：如果 tick 持久化【不 strip】view 键，
// 复现脚本 A 的同一序列是否会损坏账本 —— 证明 stripView 是必要的。
import {
  foldWorkerEvents, buildScheduleRecord,
  changeCreate, changeDispatch, changeUpdate, recordView,
} from "../lib/registry.js";

let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures += 1;
};

console.log("对照 A': schedule tick 不 strip view 键直接持久化 update");
{
  const record = buildScheduleRecord({
    id: "cw-s", rule: { everySeconds: 300 }, prompt: "task prompt", maxRuns: 3,
    expiresIn: "24h", scheduledAt: "2026-08-18T00:00:00.000Z",
  });
  const events = [{ type: "continuous-worker/change", data: changeCreate(record) }];
  // 与 recheck-script A 完全一致，唯一区别：不调用 stripView，
  // 直接把 recordView 的 due/expired/deliveryMode spread 进 update。
  const tickNostrip = (nowIso) => {
    const now = Date.parse(nowIso);
    const folded = foldWorkerEvents(events, 0);
    const raw = folded.active.find((r) => r.id === "cw-s");
    const rec = recordView(raw, now); // BUG 复刻：view 直接入账
    events.push({ type: "continuous-worker/change", data: changeDispatch(rec.id, nowIso) });
    if (rec.rule?.everySeconds !== undefined) {
      const nextAt = now + rec.rule.everySeconds * 1000;
      events.push({
        type: "continuous-worker/change",
        data: changeUpdate({
          ...rec,
          runCount: rec.runCount + 1,
          scheduledAt: new Date(nextAt).toISOString(),
          state: rec.runCount + 1 >= rec.maxRuns ? "done" : "active",
        }),
      });
    }
  };
  tickNostrip("2026-08-18T00:05:00.000Z"); // 首次派发即写入带 view 键的 update
  let threw = null;
  try {
    const final = foldWorkerEvents(events, 0); // 再次 fold（下一次 tick 必做）
    const rec = final.active.find((r) => r.id === "cw-s");
    check("不 strip 时首次派发后账本仍可 fold（应失败）", false,
      `unexpectedly folded runCount=${rec.runCount} state=${rec.state}`);
  } catch (error) {
    threw = error.message;
    check("不 strip 时下次 fold 抛 decode 校验错误（账本损坏）", true, error.message);
  }
  check("损坏原因为精确键校验（含 due/expired/deliveryMode）",
    threw !== null && /must contain exactly/.test(threw ?? ""), threw ?? "no error");
}

console.log("对照 B': heartbeat tick 不 strip view 键");
{
  const { buildHeartbeatRecord, advanceHeartbeat } = await import("../lib/registry.js");
  const record = buildHeartbeatRecord({
    id: "cw-h", intervalSeconds: 300, prompt: "hb", maxRuns: 3,
    expiresIn: "24h", stepTokenBudget: 50_000, scheduledAt: "2026-08-18T00:00:00.000Z",
  });
  const events = [{ type: "continuous-worker/change", data: changeCreate(record) }];
  const tickNostrip = (nowIso) => {
    const now = Date.parse(nowIso);
    const folded = foldWorkerEvents(events, 0);
    const raw = folded.active.find((r) => r.id === "cw-h");
    const rec = recordView(raw, now); // BUG 复刻
    events.push({ type: "continuous-worker/change", data: changeDispatch(rec.id, nowIso) });
    const next = advanceHeartbeat(rec, now); // BUG 复刻：view spread 进返回值
    events.push({ type: "continuous-worker/change", data: changeUpdate(next) });
  };
  tickNostrip("2026-08-18T00:05:00.000Z");
  let threw = null;
  try {
    const final = foldWorkerEvents(events, 0);
    const rec = final.active.find((r) => r.id === "cw-h");
    check("不 strip 时 heartbeat 账本仍可 fold（应失败）", false,
      `unexpectedly folded runCount=${rec.runCount}`);
  } catch (error) {
    threw = error.message;
    check("不 strip 时 heartbeat 下次 fold 抛错（账本损坏）", true, error.message);
  }
  check("损坏原因为精确键校验", threw !== null && /must contain exactly/.test(threw ?? ""), threw ?? "no error");
}

console.log(failures === 0 ? "\n对照结论：stripView 确为必要（不 strip 必损坏账本）。" : `\n${failures} 对照断言失败。`);
process.exitCode = failures > 0 ? 1 : 0;
