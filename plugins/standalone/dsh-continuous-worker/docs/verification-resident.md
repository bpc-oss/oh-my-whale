# 常驻会话验证报告（headless 无法覆盖的场景）

> 目标：验证 dsh-continuous-worker 在长生命周期会话中的真实行为（周期 tick、
> expired、监督档位、预算）——headless 一次性会话无法覆盖的部分。
> 载体：headless profile（link 到 {{PLUGIN_SOURCES_DIR}}\dsh-continuous-worker，自动用最新代码）
> 方法：真实 headless 会话 + 模型驱动工具调用，观察运行证据。

## 验证结果

| # | 验证项 | 结果 | 证据 |
|---|---|---|---|
| 1 | **周期 tick 循环真实运行**（非 stuck） | ✅ | cw_status 两次调用间 `lastHeartbeatAt` 推进 +15s（1786987409127 → 1786987424138）——pacemaker tick 无条件调用 watcher.heartbeat()，即使 agent busy |
| 2 | **expiresIn 处理真实工作** | ✅ | expiresIn='1m' 的 schedule 在 ~60s 后 registry 显示 `state: expired, due: false` |
| 3 | **expired 记录拒绝手动派发**（本次修复） | ✅ | 过期后 cw_run_once 返回 `{"delivered":false,"reason":"expired"}`，runCount 保持 0 |
| 4 | **监督档位切换真实生效**（applySupervision） | ✅ | cw_run_once 返回 `supervision:{applied:true, preset:"workspace-write", taskType:"workspace"}` |
| 5 | **tick 自动派发（idle 时）** | ⚠️ headless 不可验证 | agent busy（模型持续调工具）时 tick 不派发（设计行为：busy 不打断）；headless 模型从不真正 idle，进程随任务结束退出——**宿主语义，需 web profile 常驻验证** |

## 本次发现并修复的缺陷

**expired 记录可被 cw_run_once 手动派发**（常驻验证发现，非审查遗漏）：
- 现象：expiresIn 到期后记录 state=expired，但 cw_run_once 仍派发（runCount 0→1）
- 根因：cw_run_once 只检查 paused，未检查 expired/done
- 修复：`lib/tools.js` 增加 `isExpired(record)` 与 `state==="done"` 检查，expired/done 拒绝派发
- 验证：50/50 测试通过；真实会话确认 expired 记录返回 reason:"expired"

## 设计行为确认（非缺陷）

- **busy 不派发**：agent 忙碌（模型在跑）时 tick 早退，等 agent/status→idle 重新驱动（index.js requestDrive）——§6.3 设计语义
- **session-local delivery**：schedule 仅在会话 live 时按 tick 触发，冷会话恢复后补投——宿主语义（设计已明示）

## 结论

常驻行为验证完成（headless 可达部分全部通过）：**周期 tick 循环运行、expiresIn 生效、expired 拒绝派发（修复）、监督档位切换生效**。唯一无法在 headless 验证的是"idle 时 tick 自动派发"——需 web profile 常驻会话，属宿主语义而非插件缺陷。

## 待办（如需完整常驻验证）

- 在 web profile 安装插件（`dsh plugin --profile web add {{PLUGIN_SOURCES_DIR}}\dsh-continuous-worker`），创建 schedule 后让会话 idle，观察 tick 自动派发
- 验证 loop 在常驻会话中按 interval 迭代直至 PASS/LIMIT/TIMEOUT
