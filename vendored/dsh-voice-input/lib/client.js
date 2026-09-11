/*!
 * dsh-voice-input — client half (browser).
 *
 * 高质量语音输入：浏览器采麦 → 本地离线 ASR（host 侧 sherpa-onnx，
 * 经 /voice loopback RPC 分块推送）→ 智能标点 → 实时写入输入框草稿；
 * 本地引擎不可用时自动降级浏览器 Web Speech（零配置开箱可用）。
 *
 * 槽位：
 *   conversation.input.right   — 输入框工具行右侧的麦克风按钮
 *   settings.general.item      — 设置 → 通用 → 语音输入配置行
 *
 * 模块格式：window.__ModuleLoader__.load({ id, factory })，react 由 shell
 * 的 module map 提供（peerDependency react，可选）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-voice-input',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')

    // ------------------------------------------------------------------
    // 样式（DSH 设计系统变量；随模块卸载自动移除）
    // ------------------------------------------------------------------
    function insertStyles(css) {
      if (typeof document === 'undefined') return () => {}
      const el = document.createElement('style')
      el.setAttribute('data-dsh-voice-input', '')
      el.textContent = css
      document.head.appendChild(el)
      return () => {
        if (el.parentNode) el.parentNode.removeChild(el)
      }
    }

    const isZh = () =>
      typeof navigator !== 'undefined' &&
      navigator.language &&
      String(navigator.language).toLowerCase().indexOf('zh') === 0

    // ------------------------------------------------------------------
    // 页面生命周期内的内存设置（按钮与设置行共享；持久配置在 cordis.patch.yml）
    // ------------------------------------------------------------------
    const DEFAULTS = { lang: 'auto', autoSend: false, hotkey: 'ctrl+space', engine: 'browser' }
    let settings = Object.assign({}, DEFAULTS)
    const listeners = new Set()
    const subscribe = (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    }
    const getSnapshot = () => settings
    const setSetting = (patch) => {
      settings = Object.assign({}, settings, patch)
      listeners.forEach((fn) => fn())
    }

    // ------------------------------------------------------------------
    // /voice 通道调用面
    // ------------------------------------------------------------------
    function createVoiceService(call) {
      const decode = (res) => {
        if (!res.ok) {
          const err = new Error(res.error && res.error.message ? res.error.message : 'RPC error')
          err.code = res.error && res.error.code ? res.error.code : 'unknown'
          throw err
        }
        return res.value
      }
      return {
        ping: () => call('/voice', 'ping', {}).then(decode),
        fetchConfig: () => call('/voice', 'config', {}).then(decode),
        asr: (payload) => call('/voice', 'asr', payload).then(decode),
      }
    }

    // ------------------------------------------------------------------
    // 音频采集（16kHz 单声道 Int16，线性重采样兜底）
    // ------------------------------------------------------------------
    const ASR_SAMPLE_RATE = 16000

    function floatToInt16(input) {
      const int16 = new Int16Array(input.length)
      for (let i = 0; i < input.length; i += 1) {
        const s = Math.max(-1, Math.min(1, input[i] || 0))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      return int16
    }

    function linearResample(input, fromRate, toRate) {
      const ratio = toRate / fromRate
      const outLen = Math.round(input.length * ratio)
      const out = new Float32Array(outLen)
      for (let i = 0; i < outLen; i += 1) {
        const src = i / ratio
        const i0 = Math.floor(src)
        const i1 = Math.min(i0 + 1, input.length - 1)
        const frac = src - i0
        out[i] = (input[i0] || 0) * (1 - frac) + (input[i1] || 0) * frac
      }
      return out
    }

    function encodeBase64(int16) {
      const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength)
      let binary = ''
      const CHUNK = 0x8000
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
      }
      return btoa(binary)
    }

    async function capturePcm(onChunk) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: ASR_SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      const actx = new AudioContext({ sampleRate: ASR_SAMPLE_RATE })
      // 自动播放策略下 AudioContext 可能以 suspended 启动（Electron/部分浏览器）：
      // suspended 时 ScriptProcessor 的 onaudioprocess 永不触发 → 无声块 →「红着没字」。
      // 这里确保它在跑（失败仅告警，不阻断）。
      if (actx.state === 'suspended') {
        try {
          await actx.resume()
        } catch (e) {
          console.warn('dsh-voice-input: AudioContext resume 失败', e)
        }
      }
      const contextRate = actx.sampleRate
      const source = actx.createMediaStreamSource(stream)
      const processor = actx.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0)
        const resampled = contextRate === ASR_SAMPLE_RATE ? input : linearResample(input, contextRate, ASR_SAMPLE_RATE)
        onChunk(floatToInt16(resampled))
      }
      source.connect(processor)
      processor.connect(actx.destination)
      return {
        stop() {
          try {
            processor.disconnect()
            source.disconnect()
            void actx.close()
          } catch (e) {
            /* 幂等 */
          }
          for (const track of stream.getTracks()) track.stop()
        },
      }
    }

    // ------------------------------------------------------------------
    // 识别器统一契约（SpeechRecognizer）：
    //   start() / stop() / onText(text, final) / onError(err) / onEnd()
    // 定稿语义：final=true 交付「本轮累计定稿全文」（替换式）；final=false 为当前部分文本。
    // ------------------------------------------------------------------

    /** 原生引擎：浏览器采声 → base64 分块 → /voice.asr → 增量文本回传。 */
    function createNativeRecognizer(sessionId, callAsr, capture) {
      const textHandlers = new Set()
      const errorHandlers = new Set()
      const endHandlers = new Set()
      let queue = Promise.resolve()
      let micCapture = null
      let stopped = true
      let stopPromise = null
      let finalizedText = ''
      let errors = 0
      // 采声诊断：块数 + 峰值电平（定位「红着没字」：无声块 vs 无块）
      let chunks = 0
      let peak = 0
      let lastChunkAt = 0

      return {
        start() {
          stopped = false
          stopPromise = null
          finalizedText = ''
          errors = 0
          chunks = 0
          peak = 0
          lastChunkAt = 0
          return Promise.resolve()
            .then(() => capture((int16) => onChunk(int16)))
            .then((cap) => {
              if (stopped) {
                cap.stop()
                return
              }
              micCapture = cap
            })
            .catch((err) => {
              stopped = true
              throw err
            })
        },
        stop() {
          if (stopPromise !== null) return stopPromise
          stopped = true
          if (micCapture) {
            micCapture.stop()
            micCapture = null
          }
          // 发 final=true 空块让 host 补静音冲刷 VAD 弹出最后一段；挂在推送链尾，
          // resolve 时定稿已交付完毕（resolve 后不再有任何回调）。
          enqueue('', true)
          stopPromise = queue
          return stopPromise
        },
        onText(cb) {
          textHandlers.add(cb)
          return () => textHandlers.delete(cb)
        },
        onError(cb) {
          errorHandlers.add(cb)
          return () => errorHandlers.delete(cb)
        },
        onEnd(cb) {
          endHandlers.add(cb)
          return () => endHandlers.delete(cb)
        },
        /** 采声诊断（供 UI 提示与外部调试） */
        debug() {
          return { chunks, peak, lastChunkAt }
        },
      }

      function onChunk(int16) {
        if (stopped) return
        chunks += 1
        lastChunkAt = Date.now()
        let p = 0
        for (let i = 0; i < int16.length; i += 1) {
          const v = int16[i] < 0 ? -int16[i] : int16[i]
          if (v > p) p = v
        }
        if (p > peak) peak = p
        enqueue(encodeBase64(int16), false)
      }

      function enqueue(audio, final) {
        queue = queue.then(() => dispatch(audio, final))
      }

      async function dispatch(audio, final) {
        try {
          const res = await callAsr({ sessionId, audio, final })
          if (!res || res.delta === '') return
          errors = 0
          if (res.final) {
            finalizedText += res.delta
            textHandlers.forEach((cb) => cb(finalizedText, true))
          } else {
            textHandlers.forEach((cb) => cb(res.delta, false))
          }
        } catch (err) {
          // 单块失败不报废本轮；但连续失败且无任何文本 → 判定引擎不可用，
          // 上浮致命错误（例如 host 侧模型缺失但 ping 已降级失败的边界情况）
          errors += 1
          if (errors > 12 && finalizedText === '') {
            stopped = true
            errorHandlers.forEach((cb) => cb(err.code === 'native_unavailable' ? err : new Error('native_unavailable')))
          } else {
            console.error('dsh-voice-input ASR:', err instanceof Error ? err.message : String(err))
          }
        }
      }
    }

    /** 浏览器 Web Speech 引擎（零依赖兜底；自动续听防长句被切断）。 */
    function createWebSpeechRecognizer(lang) {
      const textHandlers = new Set()
      const errorHandlers = new Set()
      const endHandlers = new Set()
      let recognition = null
      let finalized = ''
      let interim = ''
      let manualStop = true
      let silentEnds = 0
      const MAX_SILENT_ENDS = 6

      function emitFull() {
        // Chrome 的 interim 常回显已定稿的文字，去掉前缀避免重复
        let i = interim
        if (finalized && i.indexOf(finalized) === 0) i = i.slice(finalized.length)
        textHandlers.forEach((cb) => cb((finalized + i).trim(), false))
      }

      function startRecognition() {
        if (manualStop) return
        const SR = (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null
        if (!SR) {
          errorHandlers.forEach((cb) => cb(new Error('unsupported')))
          return
        }
        let rec
        try {
          rec = new SR()
        } catch (e) {
          errorHandlers.forEach((cb) => cb(new Error('unsupported')))
          return
        }
        recognition = rec
        rec.lang = lang
        rec.continuous = true
        rec.interimResults = true
        rec.onresult = (event) => {
          silentEnds = 0
          interim = ''
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const r = event.results[i]
            if (r.isFinal) finalized += r[0].transcript
            else interim += r[0].transcript
          }
          emitFull()
        }
        rec.onerror = (event) => {
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            manualStop = true
            errorHandlers.forEach((cb) => cb(new Error('not-allowed')))
          } else if (event.error === 'network') {
            manualStop = true
            errorHandlers.forEach((cb) => cb(new Error('network')))
          } else if (event.error !== 'aborted' && event.error !== 'no-speech' && event.error !== 'audio-capture') {
            manualStop = true
            errorHandlers.forEach((cb) => cb(new Error(event.error)))
          }
        }
        rec.onend = () => {
          recognition = null
          if (manualStop) return
          // 意外结束（静默超时等）：自动续听；连续多次无结果才结束本轮
          silentEnds += 1
          if (silentEnds >= MAX_SILENT_ENDS) {
            manualStop = true
            textHandlers.forEach((cb) => cb(finalized, true))
            endHandlers.forEach((cb) => cb())
            return
          }
          startRecognition()
        }
        try {
          rec.start()
        } catch (e) {
          errorHandlers.forEach((cb) => cb(new Error('start-failed')))
        }
      }

      return {
        start() {
          finalized = ''
          interim = ''
          manualStop = false
          silentEnds = 0
          const SR = (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null
          if (!SR) return Promise.reject(new Error('unsupported'))
          startRecognition()
          return Promise.resolve()
        },
        stop() {
          manualStop = true
          if (recognition) {
            try {
              recognition.stop()
            } catch (e) {
              /* 幂等 */
            }
            recognition = null
          }
          // Chrome 的 stop() 会先交付最终 onresult（已累计进 finalized）；
          // 等一小拍让 onend 尘埃落定，然后替换式交付定稿全文。
          return new Promise((resolve) => {
            setTimeout(() => {
              textHandlers.forEach((cb) => cb(finalized, true))
              resolve()
            }, 250)
          })
        },
        onText(cb) {
          textHandlers.add(cb)
          return () => textHandlers.delete(cb)
        },
        onError(cb) {
          errorHandlers.add(cb)
          return () => errorHandlers.delete(cb)
        },
        onEnd(cb) {
          endHandlers.add(cb)
          return () => endHandlers.delete(cb)
        },
      }
    }

    // ------------------------------------------------------------------
    // VoiceRuntime —— 一轮识别的编排（轮次守卫 + 草稿写入 + 可选自动发送）
    // 草稿写入面（draftFace）由会话槽位注册时注入，运行时只按会话取用。
    // ------------------------------------------------------------------
    function createRuntime(deps) {
      const state = {
        engine: 'browser',
        listening: false,
        pendingText: '',
        partialText: '',
        baseDraft: '',
        round: 0,
        stopping: false,
        activeSession: null,
        recognizer: null,
        error: null,
        debug: { chunks: 0, peak: 0, lastChunkAt: 0 },
      }
      const listeners = new Set()
      const notify = () => listeners.forEach((fn) => fn())

      const runtime = {
        subscribe(cb) {
          listeners.add(cb)
          return () => {
            listeners.delete(cb)
          }
        },
        isListening: () => state.listening,
        getPartial: () => state.partialText,
        getError: () => state.error,
        getEngine: () => state.engine,
        getDebug: () => state.debug,
        setEngine(engine) {
          state.engine = engine
        },
        clearError() {
          state.error = null
        },

        /** 开关一轮识别；resolve 表示状态已切换（识别结果经回调提交）。 */
        async toggleMic(sessionId) {
          if (state.listening) {
            await runtime.stopMic(state.activeSession || sessionId)
            return
          }
          const round = ++state.round
          const face = deps.getFace(sessionId)
          state.activeSession = sessionId
          state.baseDraft = face ? face.getBaseDraft() : ''
          state.pendingText = ''
          state.partialText = ''
          state.error = null
          state.listening = true
          notify()
          const engine = deps.getEngine()
          if (state.round !== round) return
          const rec = deps.createRecognizer(engine, sessionId)
          rec.onText((text, final) => {
            if (state.round !== round) return
            if (final) {
              state.pendingText = text
              state.partialText = ''
            } else {
              state.partialText = text
            }
            deps.getFace(sessionId)?.writeDraft(mergeDraft(state.baseDraft, state.pendingText, state.partialText))
            notify()
          })
          rec.onError((err) => {
            if (state.round !== round) return
            state.error = deps.describeError(err)
            state.pendingText = ''
            state.partialText = ''
            void runtime.stopMic(sessionId)
          })
          rec.onEnd(() => {
            if (state.round !== round) return
            void runtime.stopMic(sessionId)
          })
          state.recognizer = rec
          state.debug = { chunks: 0, peak: 0, lastChunkAt: 0 }
          try {
            await rec.start()
            // 每 400ms 拉一次采声诊断（用于 UI 提示「无声块/无音频」）
            const debugTimer = setInterval(() => {
              if (state.round !== round || !state.listening) {
                clearInterval(debugTimer)
                return
              }
              if (rec && typeof rec.debug === 'function') {
                state.debug = rec.debug()
              }
            }, 400)
            state.debugTimer = debugTimer
            if (state.round !== round) {
              void rec.stop()
              return
            }
          } catch (err) {
            if (state.round === round) {
              state.round += 1
              state.recognizer = null
              state.activeSession = null
              state.listening = false
              state.error = deps.describeError(err)
              notify()
            }
          }
        },

        /** 停止识别；定稿文本写入草稿，autoSend 时自动发送。幂等。 */
        async stopMic(sessionId) {
          const rec = state.recognizer
          if (rec === null) {
            state.round += 1
            state.activeSession = null
            state.listening = false
            notify()
            return
          }
          const target = state.activeSession || sessionId
          if (state.stopping) return
          state.stopping = true
          try {
            await rec.stop()
          } catch (err) {
            console.error('dsh-voice-input 收尾失败:', err)
          }
          state.round += 1
          state.stopping = false
          state.recognizer = null
          state.activeSession = null
          if (state.debugTimer) {
            clearInterval(state.debugTimer)
            state.debugTimer = null
          }
          const text = (state.pendingText + ' ' + state.partialText).trim()
          state.pendingText = ''
          state.partialText = ''
          state.listening = false
          const face = deps.getFace(target)
          if (text !== '' && face) {
            face.writeDraft(mergeDraft(state.baseDraft, text, ''))
            if (deps.autoSend()) face.submit()
          } else if (face && state.error === null) {
            face.clearDraft(state.baseDraft)
          }
          notify()
        },
      }
      return runtime
    }

    function mergeDraft(base, finalized, partial) {
      const mid = (finalized + ' ' + partial).trim()
      if (!mid) return base
      return base.trim() ? base.trim() + ' ' + mid : mid
    }

    // ------------------------------------------------------------------
    // UI 组件
    // ------------------------------------------------------------------
    const CSS = `
      .dshvi-btn {
        display: inline-flex; align-items: center; justify-content: center;
        width: 30px; height: 30px; padding: 0; flex: none;
        border: 1px solid transparent; border-radius: 8px;
        background: transparent; color: var(--dsw-alias-label-secondary);
        cursor: pointer; transition: background .15s ease, color .15s ease, border-color .15s ease;
      }
      .dshvi-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .dshvi-btn:disabled { opacity: .5; cursor: default; }
      .dshvi-btn[data-listening='true'] {
        color: var(--dsw-alias-state-error-primary);
        border-color: var(--dsw-alias-state-error-primary);
        animation: dshvi-pulse 1.2s ease-in-out infinite;
      }
      .dshvi-btn[data-error='true'] { color: var(--dsw-alias-state-warn-primary); }
      @keyframes dshvi-pulse {
        0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, transparent); }
        50% { box-shadow: 0 0 0 6px transparent; }
      }
      .dshvi-row {
        display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
        padding: 16px 0; border-bottom: 1px solid var(--dsw-alias-border-l2);
      }
      .dshvi-rowText { display: flex; flex-direction: column; flex: 1; gap: 4px; min-width: 0; }
      .dshvi-title { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 400; line-height: 22px; }
      .dshvi-desc { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
      .dshvi-control {
        display: inline-flex; align-items: center; gap: 8px;
        color: var(--dsw-alias-label-primary); font-size: 13px; cursor: pointer;
      }
      .dshvi-control select {
        background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
        padding: 5px 8px; font: inherit; cursor: pointer;
      }
      .dshvi-badge {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 8px; border-radius: 999px; font-size: 12px; line-height: 18px;
        background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);
      }
      .dshvi-badge[data-ok='true'] { color: var(--dsw-alias-state-success-primary); }
      .dshvi-badge[data-warn='true'] { color: var(--dsw-alias-state-warn-primary); }
    `

    function MicIcon() {
      return React.createElement(
        'svg',
        { viewBox: '0 0 24 24', width: '17', height: '17', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
        React.createElement('path', { d: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z' }),
        React.createElement('path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }),
        React.createElement('line', { x1: '12', y1: '19', x2: '12', y2: '22' }),
      )
    }

    function MicButton(props) {
      const runtime = props.runtime
      const zh = isZh()
      const [phase, setPhase] = React.useState('idle')
      const [hint, setHint] = React.useState('')
      const [partial, setPartial] = React.useState('')

      React.useEffect(() => runtime.subscribe(() => {
        setPartial(runtime.getPartial())
        if (runtime.isListening()) {
          setPhase('listening')
          setHint('')
        } else {
          setPhase('idle')
          const err = runtime.getError()
          if (err) {
            setPhase('error')
            setHint(err)
            runtime.clearError()
          }
        }
      }), [runtime])

      // 聆听期间每秒检查采声诊断：无块 = 采集未工作；有块但电平极低 = 麦克风静音
      React.useEffect(() => {
        if (phase !== 'listening') return
        const t = setInterval(() => {
          if (!runtime.isListening()) return
          const d = runtime.getDebug()
          if (!d) return
          const now = Date.now()
          const zhNow = zh
          if (d.chunks === 0 || now - d.lastChunkAt > 1500) {
            setHint(zhNow ? '未采集到音频：浏览器可能阻止了音频处理（AudioContext 挂起）' : 'No audio captured — browser may have blocked audio processing')
          } else if (d.peak < 800) {
            setHint(zhNow ? '麦克风声音很弱：请靠近麦克风或检查系统录音设备' : 'Mic level very low — speak closer or check the system mic')
          } else if (!runtime.getPartial()) {
            setHint(zhNow ? '正在聆听…（未识别到话语）' : 'Listening… (no speech detected yet)')
          } else {
            setHint('')
          }
        }, 1000)
        return () => clearInterval(t)
      }, [phase, runtime, zh])

      const toggle = React.useCallback(() => {
        // 重试前复位本地状态（立即响应点击，不留残影）
        setPhase('idle')
        setHint('')
        runtime.clearError()
        runtime.toggleMic(props.sessionId)
      }, [runtime, props.sessionId])

      const listening = phase === 'listening'
      const shown = (partial || '').trim()
      let title
      if (listening) {
        const dbgHint = hint
        title = zh
          ? (shown ? '听写中… ' + shown.slice(0, 80) : (dbgHint || '听写中… 点击停止'))
          : (shown ? 'Listening… ' + shown.slice(0, 80) : (dbgHint || 'Listening… click to stop'))
      } else if (phase === 'error') {
        title = hint || (zh ? '语音输入' : 'Voice input')
      } else {
        title = zh ? '语音输入（点击开始，Ctrl+Space）' : 'Voice input (click or Ctrl+Space)'
      }

      return React.createElement(
        'button',
        {
          type: 'button',
          className: 'dshvi-btn',
          'data-listening': listening ? 'true' : 'false',
          'data-error': phase === 'error' ? 'true' : 'false',
          title,
          'aria-label': title,
          onClick: toggle,
        },
        React.createElement(MicIcon),
      )
    }

    function VoiceSettingsRow(props) {
      const cfg = React.useSyncExternalStore(subscribe, getSnapshot)
      const zh = isZh()
      const [status, setStatus] = React.useState({ engine: cfg.engine, modelReady: false, secondPass: false, modelError: null })

      const refresh = React.useCallback(() => {
        props.ping().then((v) => {
          setStatus({ engine: v.engine, modelReady: Boolean(v.modelReady), secondPass: Boolean(v.secondPass), modelError: v.modelError || null })
          setSetting({ engine: v.engine })
        }).catch(() => {
          setStatus({ engine: 'browser', modelReady: false, secondPass: false, modelError: zh ? '无法连接识别服务' : 'cannot reach ASR service' })
        })
      }, [props, zh])

      React.useEffect(() => { refresh() }, [refresh])

      const engineLabel =
        status.engine === 'native'
          ? (status.modelReady
              ? (zh
                  ? (status.secondPass ? '本地离线识别 ✓（SenseVoice 二遍）' : '本地离线识别 ✓')
                  : (status.secondPass ? 'Local offline ASR ✓ (SenseVoice 2nd pass)' : 'Local offline ASR ✓'))
              : (zh ? '本地引擎（模型加载中…）' : 'Local engine (loading…)'))
          : (zh ? '浏览器识别（未配置本地模型）' : 'Browser recognition (no local model)')

      return React.createElement(
        'div',
        { className: 'dshvi-row' },
        React.createElement(
          'div',
          { className: 'dshvi-rowText' },
          React.createElement(
            'div',
            { className: 'dshvi-title' },
            zh ? '语音输入' : 'Voice input',
            ' ',
            React.createElement(
              'span',
              {
                className: 'dshvi-badge',
                'data-ok': status.engine === 'native' ? 'true' : 'false',
                'data-warn': status.engine !== 'native' && status.modelError ? 'true' : 'false',
                title: status.modelError || '',
              },
              engineLabel,
            ),
          ),
          React.createElement(
            'div',
            { className: 'dshvi-desc' },
            status.modelError
              ? status.modelError
              : (zh
                  ? '用麦克风把语音转为文字并填入输入框。本地识别离线免费、中文效果好；未配置模型时自动用浏览器识别。'
                  : 'Transcribe microphone speech into the composer. Offline native ASR when models are installed; browser fallback otherwise.'),
          ),
        ),
        React.createElement(
          'label',
          { className: 'dshvi-control' },
          React.createElement('span', null, zh ? '语言' : 'Language'),
          React.createElement(
            'select',
            {
              value: cfg.lang,
              onChange: (e) => setSetting({ lang: e.target.value }),
            },
            React.createElement('option', { value: 'auto' }, zh ? '跟随系统' : 'System'),
            React.createElement('option', { value: 'zh-CN' }, '中文'),
            React.createElement('option', { value: 'en-US' }, 'English'),
          ),
        ),
        React.createElement(
          'label',
          { className: 'dshvi-control' },
          React.createElement('input', {
            type: 'checkbox',
            checked: cfg.autoSend,
            onChange: (e) => setSetting({ autoSend: e.target.checked }),
          }),
          React.createElement('span', null, zh ? '识别后自动发送' : 'Auto-send when done'),
        ),
      )
    }

    // ------------------------------------------------------------------
    // apply —— 客户端入口
    // ------------------------------------------------------------------
    function apply(ctx) {
      const slots = ctx.get('slots')
      const connection = ctx.get('connection')
      const sessions = ctx.get('sessions')
      if (slots === undefined || connection === undefined) return

      const voice = createVoiceService((channel, endpoint, payload) =>
        connection.rpc.call(channel, endpoint, payload))

      // 行内 config 只到 host 半；client 半从这里取回真实值并覆盖内存默认
      voice.fetchConfig().then((remote) => {
        setSetting({
          engine: remote.engine,
          hotkey: typeof remote.hotkey === 'string' ? remote.hotkey : DEFAULTS.hotkey,
          lang: typeof remote.lang === 'string' ? remote.lang : DEFAULTS.lang,
          autoSend: Boolean(remote.autoSend),
        })
      }).catch((err) => {
        console.warn('dsh-voice-input: /voice.config 不可用，使用默认配置', err)
      })

      // 每个会话一份草稿写入面（由会话槽位注册时注入，保证读写总是当前会话）
      const faces = new Map()

      const runtime = createRuntime({
        getEngine: () => getSnapshot().engine,
        autoSend: () => getSnapshot().autoSend,
        getFace: (sessionId) => faces.get(sessionId),
        describeError(err) {
          // 优先按 DOMException.name（NotAllowedError 等）分类；Web Speech 适配器
          // 用 code（'not-allowed'/'network'/'unsupported'）；最后兜底 code/message。
          const name = err && err.name ? String(err.name) : ''
          const code = err && err.code ? err.code : (err && err.message ? err.message : String(err))
          const zh = isZh()
          const permDenied = () => (zh
            ? '麦克风权限被拒绝：请在浏览器地址栏允许麦克风（桌面应用请在系统设置 → 隐私 → 麦克风中允许）'
            : 'Microphone permission denied — allow the mic for this site (or in system mic privacy settings)')
          const noMic = () => (zh ? '没有找到麦克风设备，请连接麦克风后重试' : 'No microphone found — connect a mic and retry')
          const busyMic = () => (zh ? '麦克风被其他程序占用，请关闭占用程序后重试' : 'Microphone is in use by another app — close it and retry')
          if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return permDenied()
          if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return noMic()
          if (name === 'NotReadableError' || name === 'TrackStartError') return busyMic()
          if (name === 'NotSupportedError' || name === 'SecurityError' || name === 'AbortError') {
            return zh ? '当前环境不允许使用麦克风（桌面应用请改用浏览器打开，或在系统中授权）' : 'Mic unavailable in this environment (open in a browser, or allow mic in system settings)'
          }
          if (code === 'unsupported') return zh ? '浏览器不支持语音识别（建议 Chrome / Edge）' : 'Speech recognition unsupported (try Chrome/Edge)'
          if (code === 'not-allowed') return permDenied()
          if (code === 'network') return zh ? '语音识别网络错误，请重试' : 'Speech recognition network error — try again'
          if (code === 'native_unavailable') return zh ? '本地识别引擎不可用，请检查模型配置（设置 → 通用 → 语音输入）' : 'Native ASR unavailable — check model config'
          if (String(code).indexOf('NotAllowedError') !== -1 || String(code).indexOf('Permission') !== -1) return permDenied()
          return zh ? '语音识别失败：' + String(code) : 'Speech recognition failed: ' + String(code)
        },
        createRecognizer(engine, sessionId) {
          if (engine === 'native') {
            return createNativeRecognizer(sessionId, (payload) => voice.asr(payload), (onChunk) => capturePcm(onChunk))
          }
          return createWebSpeechRecognizer(resolveLang())
        },
      })

      function resolveLang() {
        const lang = getSnapshot().lang
        if (lang !== 'auto') return lang
        return isZh() ? 'zh-CN' : 'en-US'
      }

      ctx.effect(() => insertStyles(CSS), 'dsh-voice-input: styles')

      // 调试出口：外部（控制台/自动化）可读采声诊断
      try {
        window.__dshVoiceDebug = {
          get: () => runtime.getDebug(),
          isListening: () => runtime.isListening(),
          engine: () => runtime.getEngine(),
          partial: () => runtime.getPartial(),
        }
      } catch (e) {
        /* 非浏览器环境忽略 */
      }

      // 麦克风按钮（输入框工具行右侧，发送键左侧）
      slots.inject('conversation.input.right', () =>
        slots.register(
          { name: 'conversation.input.right', id: 'voice-input', order: 0 },
          (props) => {
            // props: { sessionId, session, input, inputActions, ... }
            // sessionId 由框架为 session 作用域槽位解析提供；owner share 里
            // 的 session（ConversationSnapshot）字段名也是 sessionId。
            const sessionId = props.sessionId || (props.session && props.session.sessionId)
            const inputActions = props.inputActions
            if (sessionId) {
              const live = { input: props.input, inputActions }
              faces.set(sessionId, {
                writeDraft(text) {
                  if (live.inputActions && typeof live.inputActions.setDraft === 'function') live.inputActions.setDraft(text)
                },
                submit() {
                  if (live.inputActions && typeof live.inputActions.submit === 'function') live.inputActions.submit()
                },
                clearDraft(base) {
                  if (live.inputActions && typeof live.inputActions.setDraft === 'function') live.inputActions.setDraft(base || '')
                },
                getBaseDraft() {
                  return (live.input && live.input.draft) || ''
                },
              })
            }
            return React.createElement(MicButton, Object.assign({}, props, { runtime, sessionId }))
          },
        ),
      )

      // 设置 → 通用 → 语音输入行
      slots.inject('settings.general.item', () =>
        slots.register(
          { name: 'settings.general.item', id: 'voice-input', order: 30 },
          () => React.createElement(VoiceSettingsRow, { ping: () => voice.ping() }),
        ),
      )

      // 全局快捷键：开关当前会话的麦克风（输入框聚焦时不抢，避免与输入法冲突）
      let hotkey = parseHotkey(getSnapshot().hotkey)
      ctx.effect(() => {
        const onKey = (event) => {
          const hk = hotkey
          if (hk === null) return
          if (event.ctrlKey !== hk.ctrl || event.altKey !== hk.alt || event.shiftKey !== hk.shift) return
          if (event.code !== hk.code) return
          const target = event.target
          if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
          event.preventDefault()
          const current = sessions && sessions.list ? sessions.list.getSnapshot().current : undefined
          if (current === undefined) return
          void runtime.toggleMic(current).catch((err) => {
            console.error('dsh-voice-input mic:', err)
          })
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, 'dsh-voice-input: global hotkey')
    }

    function parseHotkey(str) {
      if (!str || typeof str !== 'string') return null
      const parts = String(str).trim().toLowerCase().split(/\+/)
      const spec = { ctrl: false, alt: false, shift: false, code: null }
      for (const p of parts) {
        if (p === 'ctrl' || p === 'control') spec.ctrl = true
        else if (p === 'alt') spec.alt = true
        else if (p === 'shift') spec.shift = true
        else if (p === 'space') spec.code = 'Space'
        else if (p && p.length === 1) spec.code = 'Key' + p.toUpperCase()
        else if (p) spec.code = p.toUpperCase()
      }
      return spec.code ? spec : null
    }

    exports.name = 'dsh-voice-input-client'
    exports.inject = ['slots', 'connection', 'sessions']
    exports.apply = apply
    return module.exports
  },
})
