/**
 * dev-mission: the Dev preset's identity and mission as a system-prompt section.
 *
 * Mounted as a local preset row (`name: ./dev-mission.mjs`), this plugin
 * registers one static prompt section in the agent scope, so ONLY agents
 * composed from the `dev` preset see it. Zero external imports on purpose:
 * relative preset rows resolve bare specifiers from the user home, where
 * `@deepseek-ai/*` is not installed.
 *
 * The section text comes from the row's `config.section` (edit it in
 * agent.cordis.yml); the plugin itself carries no policy. Section order 30
 * places it after the harness identity (-100) and persona (0), before tool
 * guidance (100-199). Keep the text free of `{{...}}` groups — section text
 * is a prompt template with strict variable interpolation.
 */

export const name = 'dev-mission'

export const inject = ['systemPrompt']

export function apply(ctx, config = {}) {
  const text = config.section ?? ''
  if (!text.trim()) return
  ctx.effect(() =>
    ctx.systemPrompt.section({
      name: 'dev-mission',
      order: 30,
      text,
    }),
  )
}
