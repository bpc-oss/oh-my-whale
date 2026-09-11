#!/usr/bin/env node
/**
 * dsh-voice-input 模型下载：
 *   - zipformer2 中文流式 ASR（int8，实时 partial）+ silero VAD（约 100MB）
 *   - SenseVoice 二遍识别 int8（中英日韩粤，自带标点+ITN，约 240MB）
 * 来源：hf-mirror.com（huggingface.co 直连受阻时的镜像），失败自动换源续传。
 *
 * 用法：
 *   node tools/download-models.cjs                 # 下载到 ./dsh-voice-models
 *   node tools/download-models.cjs D:/models/voice # 指定目录
 *   node tools/download-models.cjs -               # 仅打印配置指引（不下载）
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const MIRRORS = ['https://hf-mirror.com', 'https://huggingface.co']
const out = process.argv[2] === '-' ? null : process.argv[2] || path.join(process.cwd(), 'dsh-voice-models')

const JOBS = [
  {
    name: 'ASR zipformer2 中文 int8（2025-06-30，流式实时 partial）',
    repo: 'csukuangfj/sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30',
    files: ['encoder.int8.onnx', 'decoder.onnx', 'joiner.int8.onnx', 'tokens.txt'],
    dest: 'asr-zh',
  },
  {
    name: 'VAD silero',
    repo: 'csukuangfj/vad',
    files: ['silero_vad.onnx'],
    dest: 'vad',
  },
  {
    name: 'SenseVoice 二遍识别 int8（中英日韩粤，自带标点+ITN）',
    repo: 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17',
    files: ['model.int8.onnx', 'tokens.txt'],
    dest: 'sense-voice',
  },
]

function download(mirror, repo, file, destPath) {
  const url = `${mirror}/${repo}/resolve/main/${file}`
  const tmp = destPath + '.part'
  // curl -sL 静默跟随重定向（HF 会 302 到 CDN），--retry 断点续传
  execFileSync('curl', ['-sL', '--retry', '5', '--retry-delay', '3', '--max-time', '900', '-C', '-', '-o', tmp, url], {
    stdio: 'inherit',
  })
  if (!fs.existsSync(tmp) || fs.statSync(tmp).size === 0) {
    throw new Error('下载结果为空: ' + url)
  }
  fs.renameSync(tmp, destPath)
}

function getFile(repo, file, destPath) {
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
    console.log('  [skip]', destPath)
    return
  }
  let lastErr = null
  for (const mirror of MIRRORS) {
    try {
      console.log(`  [get]  ${mirror}/${repo} → ${file}`)
      download(mirror, repo, file, destPath)
      return
    } catch (err) {
      lastErr = err
      console.error(`  [retry] ${file} via ${mirror} 失败: ${String(err).slice(0, 160)}`)
      try {
        fs.rmSync(destPath + '.part', { force: true })
      } catch (e) {
        /* ignore */
      }
    }
  }
  throw lastErr || new Error('下载失败: ' + file)
}

let failed = 0
if (out !== null) {
  console.log(`下载模型到 ${out}（约 100MB，可断点续传）`)
  for (const job of JOBS) {
    console.log(`\n[${job.name}]`)
    const dest = path.join(out, job.dest)
    fs.mkdirSync(dest, { recursive: true })
    for (const f of job.files) {
      try {
        getFile(job.repo, f, path.join(dest, f))
      } catch (err) {
        failed += 1
        console.error('  [FAIL]', f, String(err).slice(0, 200))
      }
    }
  }
  if (failed > 0) {
    console.error('\n部分下载失败（网络?），重跑本命令续传。')
    process.exit(1)
  }
  console.log('\nDONE →', out)
} else {
  console.log('（- 模式：仅打印配置指引）')
}

const dir = (out || 'D:/models/voice').replace(/\\/g, '/')
console.log(`
在 profile 的 cordis.patch.yml 里为 voice 插件配置（或直接改 bundle 默认值）：
  - id: voice
    config:
      modelDir: "${dir}"

改完配置后重启 dsh web 生效；设置 → 通用 → 语音输入 会显示「本地离线识别 ✓」。
`)
