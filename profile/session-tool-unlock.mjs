/**
 * session-tool-unlock — global dev_tool_search provider.
 *
 * This plugin gives EVERY preset/conversation a uniform `dev_tool_search`
 * discovery tool for the global profile tool catalog (including MCP tools and
 * dsh-super-injector injected plugins).
 *
 * It deliberately does NOT filter the assembled tool catalog. Catalog/minimal
 * directory policies stay owned by each preset (e.g. anchored-standard's
 * tool-bootstrap). In presets with a bootstrap filter, the unlock contract is:
 *
 *   dev_tool_search({"toolNames": ["<exact tool name>"]})
 *
 * records the unlock into the current session's durable tool/call events; the
 * preset filter reads those events and exposes the tool from the next request
 * on. Because it is session-scoped, a new conversation does not inherit it.
 *
 * In full-catalog presets there is nothing to hide/unlock; dev_tool_search
 * still works as a search tool for the whole global catalog.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'session-tool-unlock'

/** The tools registry must exist before this tool can register. */
export const inject = ['tools']

const MAX_RESULTS = 25

/** Minimal JSON schema compiler for tool parameters (zero dependencies). */
function toJsonSchema(spec) {
  const properties = {}
  const required = []
  for (const [key, meta] of Object.entries(spec || {})) {
    const prop = { type: meta.type }
    if (meta.description) prop.description = meta.description
    if (meta.items) prop.items = meta.items
    properties[key] = prop
    if (meta.required) required.push(key)
  }
  return { type: 'object', properties, required, additionalProperties: false }
}

const UNLOCKABLE_INDEX = [
  'web_search — internet search and web retrieval',
  'subagent / subagent_fork — delegate work to sub-agents',
  'workflow — run multi-agent workflow scripts',
  'ralph — fresh-agent iterative loop',
  'create_goal / get_goal / update_goal — long-running goals',
  'read_image — read image files',
  'job_list / job_output / job_kill — background jobs',
  'interrupt_agent / send_message / list_agents — multi-agent control',
  'todo_write — task tracking',
  'ask_user_question — ask the user',
  'dev_inject_plugin / dev_uninject_plugin / dev_reload_package / dev_plugin_status — runtime plugin injection',
  'mcp__chrome_faithful__* — exact-profile Chrome automation (search first for exact tool names)',
]

/** Register the global `dev_tool_search` tool. */
export function apply(ctx) {
  const shellName = process.platform === 'win32' ? 'pwsh' : 'bash'

  ctx.effect(() => {
  const dispose = ctx.tools.register({
    name: 'dev_tool_search',
    description: [
      'Discover and unlock tools that are NOT currently available.',
      '',
      `Every conversation starts with at least ${shellName}, str_replace_editor, dev_tool_search, skill_search and skill_load where the preset provides them. Everything else can be discovered here.`,
      '',
      'Unlocks are SESSION-SCOPED: they apply only to the current conversation and are never inherited by new conversations.',
      '',
      'If the current task needs any of the following, call dev_tool_search FIRST:',
      ...UNLOCKABLE_INDEX.map((line) => `- ${line}`),
      '',
      'Usage: pass `query` to search the catalog (returns matching tool names + descriptions), then pass `toolNames` with exact names to unlock them. Unlocked tools appear from the next request on and stay unlocked for this session.',
    ].join('\n'),
    parameters: toJsonSchema({
      query: { type: 'string', required: false, description: 'search keywords (e.g. "chrome", "inject", "subagent")' },
      toolNames: { type: 'array', required: false, description: 'exact tool names to unlock for this session', items: { type: 'string' } },
    }),
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string' } }, required: ['text'] },
      render: (_a, v) => [{ type: 'text', text: v.text }],
    },
    async execute(args, exec) {
      const query = typeof args.query === 'string' ? args.query.trim() : ''
      const unlock = Array.isArray(args.toolNames) ? args.toolNames.filter((name) => typeof name === 'string' && name.length > 0) : []

      const lines = []
      if (unlock.length > 0) {
        lines.push(`Unlocked for this session (next request): ${unlock.join(', ')}`)
      }
      if (query.length === 0 && unlock.length === 0) {
        lines.push('Provide `query` to search the catalog, or `toolNames` to unlock tools.')
        return { text: lines.join('\n') }
      }
      if (query.length === 0) {
        return { text: lines.join('\n') || 'Nothing to do.' }
      }

      try {
        // The executing agent IS the viewing scope: this includes globally
        // registered profile/MCP tools and super-injector injected tools.
        const schemas = ctx.tools.schemas(exec?.agent)
        const wanted = query.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean)
        const all = schemas.filter((schema) => {
          const haystack = `${schema.name} ${schema.description ?? ''}`.toLowerCase()
          return wanted.every((token) => haystack.includes(token))
        })
        const matches = all.slice(0, MAX_RESULTS)
        if (all.length === 0) {
          lines.push(`No tools match "${query}".`)
        } else {
          lines.push(`Matching tools (${matches.length}${all.length > MAX_RESULTS ? ` of ${all.length}` : ''}):`)
          for (const schema of matches) {
            const desc = (schema.description || '').split('\n')[0].slice(0, 90)
            lines.push(`- ${schema.name}: ${desc}`)
          }
          if (all.length > MAX_RESULTS) {
            lines.push(`(truncated at ${MAX_RESULTS} — add tokens to narrow the query, e.g. "chrome" or "inject")`)
          }
          lines.push('Unlock with dev_tool_search({"toolNames": ["<exact name>"]}).')
        }
      } catch (error) {
        lines.push(`catalog search unavailable: ${String((error && error.message) || error)}`)
      }
      return { text: lines.join('\n') }
    },
  })
  return dispose
  })

  // Non-breaking proactive discovery hint: augment the descriptions of the
  // first-round resident tools (pwsh/bash, str_replace_editor) so the model
  // sees a dev_tool_search reminder even in presets whose bootstrap keeps a
  // minimal first-request tool list (e.g. anchored-standard). This does not
  // change the tool list or any preset's catalog filter.
  const HINT = 'Tip: If a needed capability is not listed, call dev_tool_search first to search and unlock it (it becomes available from the next request in bootstrap presets). For installing or injecting a new plugin, search inject to unlock dev_inject_plugin.'
  const RESIDENT_HINT_TOOLS = new Set(['pwsh', 'bash', 'str_replace_editor'])
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    try {
      if (!assembled || !Array.isArray(assembled.tools)) return assembled
      return {
        ...assembled,
        tools: assembled.tools.map((tool) => {
          if (!tool || typeof tool !== 'object') return tool
          if (!RESIDENT_HINT_TOOLS.has(tool.name)) return tool
          if (typeof tool.description === 'string' && tool.description.includes(HINT)) return tool
          return {
            ...tool,
            description: `${tool.description || ''}\n\n${HINT}`.trim(),
          }
        }),
      }
    } catch (error) {
      try {
        ctx.logger?.warn?.(`[session-tool-unlock] hint augmentation failed: ${String((error && error.message) || error)}`)
      } catch {
        // ignore logger errors
      }
      return assembled
    }
  })
}


