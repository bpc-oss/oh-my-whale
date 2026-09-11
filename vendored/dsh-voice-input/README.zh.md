# dsh-voice-input

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web 界面开发的高质量语音输入插件。

## 亮点

- **本地离线双遍识别**：浏览器采麦 → host 侧 [sherpa-onnx-node](https://github.com/k2-fsa/sherpa-onnx)。
  **zipformer2 流式 + silero VAD** 边说边出字（实时上屏）；VAD 切好的定稿句再交给离线
  **SenseVoice** 二遍重识别（自带标点 + ITN）——和云端 ASR 的「二遍识别」同一架构：
  快上屏、准定稿。全程离线、免费、语音不出本机；
- **口语清洗**：保守规则去掉口癖（嗯/那个/就是说…），转写更像书面语；
- **实时回显**：边说边把文字写进输入框草稿（去重、不叠加），停麦即可发送；
- **零配置兜底**：未下载模型时自动降级浏览器 Web Speech；
- **设置页状态**：设置 → 通用 → 语音输入，显示当前引擎（本地离线识别 ✓（SenseVoice 二遍）/ 浏览器识别）与模型诊断；
- **全局快捷键**：默认 `Ctrl+Space` 开关麦克风（输入框聚焦时不抢键）；
- **不动预设**：纯输入法，任何 preset（code/standard/minimal…）通用。

## 安装

```sh
# 1. 安装插件（本地目录或 git 仓库均可）
dsh plugin --profile web add "file:C:/<你>/dsh-voice-input"
# 或从 GitHub：dsh plugin --profile web add "github:<你的用户名>/dsh-voice-input"

# 2. 下载本地离线模型（zipformer2 + VAD + SenseVoice，共约 340MB，可断点续传）
cd dsh-voice-input && npm run models

# 3. 把模型目录写进 web profile 的 cordis.patch.yml：
#    - id: voice
#      config:
#        modelDir: "C:/<你>/dsh-voice-input/dsh-voice-models"

# 4. 重启 dsh web，打开会话，点输入框右侧的 🎤（或 Ctrl+Space）说话。
```

不配置模型也能用（浏览器兜底）；配了模型自动切换为本地离线识别（设置页可见 ✓ 徽标）。

## 配置项（cordis.patch.yml 的 voice 行）

| 字段 | 默认 | 说明 |
|---|---|---|
| `engine` | `auto` | `auto`（有模型用本地，否则浏览器）｜`native` ｜ `browser` |
| `modelDir` | `''` | 本地模型根目录（绝对路径；留空 = 浏览器兜底） |
| `asrDir` | `asr-zh` | 流式 ASR 子目录（zipformer2，负责实时 partial） |
| `senseDir` | `sense-voice` | SenseVoice 二遍识别子目录（负责定稿，标点+ITN） |
| `secondPass` | `auto` | `auto`（有 SenseVoice 就用）｜`sensevoice`（强制）｜`off`（关闭，省内存） |
| `clean` | `true` | 定稿口语清洗（去 嗯/那个/就是说 等语气词） |
| `vadThreshold` | `0.3` | VAD 静音阈值，越低越不易吞句首/句尾 |
| `tailPadSeconds` | `0.6` | 尾音补偿时长，补偿渐弱尾音被 VAD 截断 |
| `hotkey` | `ctrl+space` | 全局快捷键（`alt+space`；留空禁用） |
| `lang` | `auto` | Web Speech 兜底语言（`auto`｜`zh-CN`｜`en-US`） |
| `autoSend` | `false` | 识别结束后自动发送 |
| `punct` | `smart` | 定稿标点：`smart`（智能补全）｜`keep`｜`none` |

## 架构

```
浏览器（client 半）                          host（Node 半）
┌──────────────────────────┐    /voice RPC   ┌──────────────────────────────┐
│ 🎤 按钮 / 设置行 / 快捷键 │  (loopback)     │ 引擎决策（auto/native）        │
│ 采麦 → 16k PCM → base64  │ ──────────────► │ silero VAD + zipformer2 流式  │
│ 分块推送（256ms 级）       │ ◄────────────── │ partial（实时上屏，快）        │
│ 实时写草稿 / 自动发送      │  {delta, final} │ VAD 段 → SenseVoice 二遍重识别 │
└──────────────────────────┘                 │ （定稿准，标点+ITN）→ 清洗→标点 │
                                              │ 会话池（LRU 隔离）             │
                                              └──────────────────────────────┘
```

- 识别引擎只有 host 侧知道真相（配置 + 模型加载结果），经 `/voice.ping`、`/voice.config` 下发，client 只消费；
- 单块 RPC 失败不打断本轮（连续失败且无文本才上浮错误）；并发会话按 sessionId 隔离，不串音；
- 语音只在本机流转（浏览器 → host），不经过任何第三方服务。

## 开发

```sh
npm install
npm test          # vitest：标点/口语清洗/配置/线协议/会话池（假模型）
npm run models    # 下载模型（zipformer2 + VAD + SenseVoice）
node tools/asr-smoke.mjs --model-dir ./dsh-voice-models   # 真实模型端到端冒烟（二遍）
```

## 协议

MIT。ASR 引擎 [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)（Apache-2.0）；模型来自
[csukuangfj](https://huggingface.co/csukuangfj)（zipformer2 中文 int8 / silero VAD / SenseVoice int8，可商用）。
