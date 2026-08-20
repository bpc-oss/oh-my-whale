/**
 * 能力探测与引擎决策（host 侧）。
 *
 * createCapability：把模型加载包装成一次性的、带锁存结果的异步能力 ——
 * kick() 预载（首击零延迟），ready() 等待落定；失败锁存为 null 不再重试
 * （避免每次点击都重复尝试加载失败的模型）。
 */

/** 一次性的异步能力：kick 预载，ready 等待；结果（含失败=null）只算一次。 */
export function createCapability(load) {
  let promise = null
  let result = null
  const run = async () => {
    try {
      result = await load()
    } catch {
      result = null
    }
    return result
  }
  return {
    kick() {
      if (promise === null) promise = run()
    },
    ready() {
      if (promise === null) promise = run()
      return promise
    },
  }
}

/**
 * 解析生效引擎：配置强制值直接采用；auto 看模型加载结果。
 * host 是唯一知道能力真相的一方，把「生效引擎」下发给 client，
 * 客户端只消费，不自行猜测。
 * @param {'auto'|'browser'|'native'} configured
 * @param {boolean} modelReady
 * @returns {'native'|'browser'}
 */
export function resolveEngine(configured, modelReady) {
  if (configured === 'browser') return 'browser'
  if (configured === 'native') return 'native'
  return modelReady ? 'native' : 'browser'
}
