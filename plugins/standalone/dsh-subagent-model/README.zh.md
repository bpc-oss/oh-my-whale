# dsh-subagent-model

![License](https://img.shields.io/badge/license-MIT-blue)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：在子代理会话的输入框区域显示**只读的 [provider / model] 徽标**——一眼看清派发的子代理用的什么模型。

## 功能

- 打开**子代理会话窗口**时，composer 输入区显示当前 `provider / model` 徽标
- 绿点 = 子代理运行中；灰色「会话已结束」= 不在运行
- 主线程会话不渲染任何东西（官方模型选择 UI 管辖）

## v0.1 不做的事

- 不支持手动切换。官方 client 门禁 + host agent resolver 围栏（agent-busy）有意阻止对被寻址子代理的通用 session.selectModel。切换需要上游提供子代理专属 RPC。

## 安装

```bat
mklink /J "<plugin-dir>\node_modules" "<harness>\resources\host\node_modules"
```

在 profile 中添加：dependencies 加 `"dsh-subagent-model": "link:<plugin-dir>"`，`dsh.profile.bundles` 加 `"dsh-subagent-model"`。

## License

MIT
