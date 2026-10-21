import { type Context, type Fiber } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

import type { BundleConfig, GovernanceActivationSource } from './types.js'
import { AgentOsGovernance, agentlessExecutionLog, governanceFor, mountAgentOsGovernance, recordAgentlessExecution } from './status.js'
import { AGENT_OS_GOVERNANCE_SERVICE } from './contract.js'
import { ProductionNativeAdmission } from './native-admission.js'
import { fileMaterialProvider } from './admission-provider.js'
import { createClientSubmitter } from './client-connector.js'

export * from './contract.js'
export { agentlessExecutionLog } from './status.js'
export * from './budget.js'
export * from './capability-router.js'
export * from './completion.js'
export * from './native-admission.js'
export * from './policy-guard.js'
export * from './status.js'
export * from './types.js'
export * from './admission-provider.js'

export const name = 'agent-os-governance'
export const inject = ['agents']

function currentGovernance(agent: Agent): AgentOsGovernance | undefined {
  return governanceFor(agent)
}

function installScoped(
  agent: Agent,
  activationSource: GovernanceActivationSource,
  config: BundleConfig = {},
): Fiber | undefined {
  if (currentGovernance(agent)) return undefined
  const scoped = agent.ctx.isolate(AGENT_OS_GOVERNANCE_SERVICE)
  const observation = config.observationFactory?.(agent)
  const admissionSource = config.nativeAdmission === undefined
    ? undefined
    : new ProductionNativeAdmission(
        scoped,
        fileMaterialProvider(config.nativeAdmission.root, config.nativeAdmission.binding),
      )
  const completionSubmitter = config.clientActivation !== undefined
    ? createClientSubmitter(config.clientActivation)
    : config.completionSubmitter
  return scoped.plugin(mountAgentOsGovernance, {
    agent,
    activationSource,
    ...(admissionSource === undefined ? {} : { admissionSource }),
    ...(completionSubmitter === undefined ? {} : { completionSubmitter }),
    ...(observation === undefined ? {} : { observation }),
  })
}

/**
 * Optional host-owned setup adapter for public create/resume `setup` callbacks.
 * Bundle/profile loading does not wire this callback globally. Host wiring only.
 */
export async function installAgentOsGovernanceDuringSetup(agentCtx: Context): Promise<void> {
  const agent = (agentCtx as Context & { agent?: Agent }).agent
  if (!agent) throw new Error('host setup requires an unpublished Agent context')
  const fiber = installScoped(agent, 'host-setup')
  if (fiber) await fiber
}

/** Mount advisory observation for existing and subsequently published Agents. */
export const apply = (ctx: Context, config: BundleConfig = {}): (() => Promise<void> | void) => {
  if (config.enabled === false) return () => undefined

  const fibers = new Map<Agent, Fiber>()
  const activate = (agent: Agent, source: GovernanceActivationSource): void => {
    const fiber = installScoped(agent, source, config)
    if (fiber) fibers.set(agent, fiber)
  }

  for (const agent of ctx.agents.list()) activate(agent, 'bundle-existing-agent')

  ctx.on(
    'agent/created',
    ({ agent }) => activate(agent, 'bundle-created-event'),
    { global: true },
  )
  ctx.on(
    'agent/disposed',
    ({ agent }) => {
      const fiber = fibers.get(agent)
      fibers.delete(agent)
      void fiber?.dispose()
    },
    { global: true },
  )
  ctx.on(
    'tools/pre-execute',
    async (exec: ToolExecution, next: (() => Promise<PreToolDecision>) | (() => PreToolDecision)): Promise<PreToolDecision> => {
      if (exec.agent === undefined) {
        recordAgentlessExecution(exec.name)
      }
      return next()
    },
    { global: true },
  )

  return async () => {
    const pending = [...fibers.values()].map((fiber) => fiber.dispose())
    fibers.clear()
    await Promise.all(pending)
  }
}

Object.assign(apply, { inject })

/** Object-plugin shape equivalent to the module namespace consumed by Loader. */
export const bundle = { name, inject, apply }