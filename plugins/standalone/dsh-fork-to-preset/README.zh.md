# dsh-fork-to-preset

![License](https://img.shields.io/badge/license-MIT-blue) ![Version](https://img.shields.io/github/v/release/bpc-oss/dsh-fork-to-preset)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：在**每个会话的 Header 上添加一个「Fork to preset」按钮**。选择任意 agent preset，把当前会话分叉（fork）成一个全新的独立子会话，挂载到所选 preset 下——继承父会话已完成的轮次。

## 用法

- 点击 Header 上的 **↴ 分叉到 preset** 下拉框
- 选择一个目标 agent preset
- 点击按钮 → 新会话打开，挂载到所选 preset，同时继承父会话的已完成轮次

## 分发

**仅 GitHub**。不发布到 npm。通过挂载包目录的 `cordis.patch.yml` bundle 声明安装。

需要平台支持 `session.fork({ agentPreset })` API（DeepSeek Harness rc.8+）。

## 安装

### 1. 把包链接进 harness 安装

```bat
:: Windows
mklink /J "<plugin-dir>\node_modules" "<harness>\resources\host\node_modules"
```

```sh
# POSIX (Linux/macOS)
ln -s "<harness>/resources/host/node_modules" "<plugin-dir>/node_modules"
```

### 2. 把 bundle 加进 profile

```json
{
  "dependencies": { "dsh-fork-to-preset": "link:<plugin-dir>" },
  "dsh": { "profile": { "bundles": ["...", "dsh-fork-to-preset"] } }
}
```

## License

MIT
