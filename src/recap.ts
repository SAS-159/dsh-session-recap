import type { ChatNode, SessionStats, TokenUsage, Translate } from './dsh-runtime'

/**
 * Official DeepSeek pricing, USD per 1M tokens, for the Flash model
 * (DeepSeek-V4.1-Flash-1017). Off-peak is half of peak; peak hours are
 * 01:00-04:00 and 06:00-10:00 UTC on weekdays. A session total carries no
 * per-request timestamps, so the card shows the off-peak-to-peak range.
 * Source: https://api-docs.deepseek.com/quick_start/pricing/
 */
export const PRICE = {
  cacheHit: { off: 0.003, peak: 0.006 },
  cacheMiss: { off: 0.15, peak: 0.3 },
  output: { off: 0.6, peak: 1.2 },
} as const

export interface ToolCount {
  name: string
  count: number
}

export interface Recap {
  uncached: number
  cached: number
  write: number
  output: number
  input: number
  total: number
  hit: number | null
  turns: number
  steps: number
  llmMs: number
  toolMs: number
  wallMs: number
  tools: ToolCount[]
  toolTotal: number
  errors: number
  cost: { low: number; high: number }
  startedAt: number
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

export function compact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0'
  if (value < 1000) return String(Math.round(value))
  if (value < 1_000_000) {
    const k = value / 1000
    return `${k >= 100 ? Math.round(k) : k.toFixed(k >= 10 ? 0 : 1)}k`
  }
  const m = value / 1_000_000
  return `${m >= 100 ? Math.round(m) : m.toFixed(m >= 10 ? 0 : 1)}M`
}

export function money(value: number): string {
  if (value <= 0) return '$0'
  if (value < 0.01) return `$${value.toFixed(4)}`
  if (value < 1) return `$${value.toFixed(3)}`
  return `$${value.toFixed(2)}`
}

export function duration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (minutes < 60) return rest === 0 ? `${minutes}m` : `${minutes}m${rest}s`
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`
}

export function toolNameOf(node: ChatNode): string {
  const data = node.data ?? {}
  const candidates = [data.root?.name, data.name, data.toolName, node.name]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '') return candidate
  }
  return 'tool'
}

interface Derived {
  turns: number
  steps: number
  llmMs: number
  toolMs: number
  wallMs: number
  tools: ToolCount[]
  errors: number
  startedAt: number
}

function deriveFromNodes(nodes: readonly ChatNode[]): Derived {
  const turns = new Set<number>()
  let steps = 0
  let llmMs = 0
  let toolMs = 0
  let first = 0
  let last = 0
  const tools = new Map<string, number>()
  let errors = 0

  for (const node of nodes) {
    const time = readNumber(node.time)
    if (time > 0) {
      if (first === 0 || time < first) first = time
      if (time > last) last = time
    }
    if (node.kind === 'assistant') {
      if (typeof node.turn === 'number') turns.add(node.turn)
      steps += 1
      const timing = node.timing
      if (timing !== undefined && typeof timing.stepStartTime === 'number' && typeof timing.completedTime === 'number') {
        llmMs += Math.max(0, timing.completedTime - timing.stepStartTime)
      }
    } else if (node.kind === 'tool-result') {
      if (typeof node.callTime === 'number' && typeof node.time === 'number') {
        toolMs += Math.max(0, node.time - node.callTime)
      }
      if (node.data !== undefined && (node.data.isError === true || node.data.error !== undefined)) errors += 1
    } else if (node.kind === 'tool-call') {
      const name = toolNameOf(node)
      tools.set(name, (tools.get(name) ?? 0) + 1)
    }
  }

  return {
    turns: turns.size,
    steps,
    llmMs,
    toolMs,
    wallMs: first > 0 && last > first ? last - first : 0,
    tools: [...tools].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    errors,
    startedAt: first,
  }
}

export function buildRecap(
  usage: TokenUsage | undefined,
  stats: SessionStats | undefined,
  nodes: readonly ChatNode[],
): Recap {
  const base = deriveFromNodes(nodes)
  const uncached = readNumber(usage?.uncachedInputTokens)
  const cached = readNumber(usage?.cacheReadTokens)
  const write = readNumber(usage?.cacheWriteTokens)
  const output = readNumber(usage?.outputTokens)
  const input = uncached + cached + write
  const hit = input > 0 ? Math.round((cached / input) * 1000) / 10 : null
  const billedMiss = uncached + write
  const low =
    (cached * PRICE.cacheHit.off + billedMiss * PRICE.cacheMiss.off + output * PRICE.output.off) / 1_000_000
  const high =
    (cached * PRICE.cacheHit.peak + billedMiss * PRICE.cacheMiss.peak + output * PRICE.output.peak) / 1_000_000

  return {
    uncached,
    cached,
    write,
    output,
    input,
    total: input + output,
    hit,
    turns: typeof stats?.turns === 'number' ? stats.turns : base.turns,
    steps: typeof stats?.steps === 'number' ? stats.steps : base.steps,
    llmMs: typeof stats?.llmMs === 'number' ? stats.llmMs : base.llmMs,
    toolMs: typeof stats?.toolMs === 'number' ? stats.toolMs : base.toolMs,
    wallMs: base.wallMs,
    tools: base.tools,
    toolTotal: base.tools.reduce((sum, tool) => sum + tool.count, 0),
    errors: base.errors,
    cost: { low, high },
    startedAt: base.startedAt,
  }
}

export function dateLabel(ms: number, locale: string): string {
  if (!ms) return ''
  try {
    return new Date(ms).toLocaleString(/^zh/i.test(locale) ? 'zh-CN' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function fileStem(recap: Recap): string {
  const date = new Date(recap.startedAt || Date.now())
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `session-recap-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

export function buildMarkdown(recap: Recap, t: Translate, locale: string): string {
  const lines: string[] = []
  lines.push(`# ${t('title')} · ${dateLabel(recap.startedAt, locale)}`)
  lines.push('')
  lines.push(`- ${t('turns')}: ${recap.turns}`)
  lines.push(`- ${t('steps')}: ${recap.steps}`)
  lines.push(`- ${t('duration')}: ${duration(recap.wallMs)}`)
  lines.push(`- ${t('toolCalls')}: ${recap.toolTotal}${recap.errors > 0 ? ` (${t('errors', { count: recap.errors })})` : ''}`)
  lines.push('')
  lines.push('## Token')
  lines.push('')
  lines.push(`| ${t('input')} | ${t('cached')} | ${t('cacheWrite')} | ${t('output')} | ${t('cacheHit')} |`)
  lines.push('| ---: | ---: | ---: | ---: | ---: |')
  lines.push(
    `| ${compact(recap.uncached)} | ${compact(recap.cached)} | ${compact(recap.write)} | ${compact(recap.output)} | ${recap.hit === null ? '—' : `${recap.hit}%`} |`,
  )
  lines.push('')
  lines.push(`**${t('cost')}**: ${t('costRange', { low: money(recap.cost.low), high: money(recap.cost.high) })}  `)
  lines.push(`_${t('costNote')}_`)
  if (recap.tools.length > 0) {
    lines.push('')
    lines.push(`## ${t('topTools')}`)
    lines.push('')
    for (const tool of recap.tools.slice(0, 10)) lines.push(`- \`${tool.name}\` × ${tool.count}`)
  }
  lines.push('')
  lines.push('---')
  lines.push(`_${t('generated')} · dsh-session-recap_`)
  return lines.join('\n')
}

export function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] as string,
  )
}

export function buildHtml(recap: Recap, t: Translate, locale: string): string {
  const width = recap.input > 0 ? recap.input : 1
  const percent = (value: number): string => Math.max(0, Math.min(100, (value / width) * 100)).toFixed(2)

  const toolRows = recap.tools
    .slice(0, 10)
    .map((tool) => `<div class="row"><code>${escapeHtml(tool.name)}</code><span>${tool.count}</span></div>`)
    .join('')

  const cells = [
    [t('turns'), String(recap.turns)],
    [t('steps'), String(recap.steps)],
    [t('duration'), duration(recap.wallMs)],
    [t('toolCalls'), String(recap.toolTotal)],
  ]
    .map(([label, value]) => `<div class="cell"><div class="k">${escapeHtml(label)}</div><div class="v">${escapeHtml(value)}</div></div>`)
    .join('')

  return [
    `<!doctype html><html lang="${/^zh/i.test(locale) ? 'zh' : 'en'}"><head><meta charset="utf-8">`,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escapeHtml(t('title'))}</title><style>`,
    ':root{color-scheme:light dark}',
    'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 16px;',
    'font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;',
    'background:#eef2f8;color:#0f172a}',
    '@media (prefers-color-scheme:dark){body{background:#0b1220;color:#e7edf7}}',
    '.card{width:min(560px,100%);border-radius:20px;padding:26px 26px 22px;background:#fff;',
    'box-shadow:0 24px 80px rgba(15,23,42,.16);border:1px solid rgba(15,23,42,.06)}',
    '@media (prefers-color-scheme:dark){.card{background:#131c2c;border-color:rgba(255,255,255,.08);box-shadow:0 24px 80px rgba(0,0,0,.5)}}',
    '.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#64748b;margin-bottom:8px}',
    'h1{margin:0;font-size:22px;letter-spacing:-.01em}',
    '.sub{margin:6px 0 20px;color:#64748b;font-size:13px}',
    '.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}',
    '.cell{background:#f4f7fc;border-radius:12px;padding:12px 12px 10px}',
    '@media (prefers-color-scheme:dark){.cell{background:#1b2638}}',
    '.k{font-size:11px;color:#64748b;margin-bottom:2px}',
    '.v{font-size:19px;font-weight:650;font-variant-numeric:tabular-nums}',
    '.sec{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#64748b;margin:0 0 8px}',
    '.bar{display:flex;height:10px;border-radius:999px;overflow:hidden;background:#e6ecf5}',
    '@media (prefers-color-scheme:dark){.bar{background:#1b2638}}',
    '.bar i{display:block;height:100%}',
    '.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:10px 0 0;color:#475569;font-size:12.5px}',
    '@media (prefers-color-scheme:dark){.legend{color:#94a3b8}}',
    '.legend b{color:inherit;font-variant-numeric:tabular-nums}',
    '.cost{margin-top:20px;padding:14px 16px;border-radius:14px;background:linear-gradient(135deg,#eef4ff,#f6f9ff);',
    'border:1px solid #dbe7ff}',
    '@media (prefers-color-scheme:dark){.cost{background:linear-gradient(135deg,#16233a,#131c2c);border-color:#22314c}}',
    '.cost .big{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.01em}',
    '.cost .note{margin-top:4px;font-size:11.5px;color:#64748b}',
    '.tools{margin-top:18px}.row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed rgba(100,116,139,.25)}',
    '.row:last-child{border-bottom:0}.row code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}',
    '.foot{margin-top:20px;font-size:11px;color:#94a3b8}',
    '@media (max-width:520px){.grid{grid-template-columns:repeat(2,1fr)}}',
    '</style></head><body><main class="card">',
    `<div class="eyebrow">${escapeHtml(t('title'))}</div>`,
    `<h1>${escapeHtml(dateLabel(recap.startedAt, locale) || t('title'))}</h1>`,
    `<p class="sub">${escapeHtml(t('generated'))}</p>`,
    `<div class="grid">${cells}</div>`,
    '<p class="sec">Token</p>',
    '<div class="bar">',
    `<i style="width:${percent(recap.cached)}%;background:#2f7dea"></i>`,
    `<i style="width:${percent(recap.uncached)}%;background:#94a3b8"></i>`,
    `<i style="width:${percent(recap.write)}%;background:#f59e0b"></i>`,
    '</div>',
    '<div class="legend">',
    `<span><b>${compact(recap.cached)}</b> ${escapeHtml(t('cached'))}</span>`,
    `<span><b>${compact(recap.uncached)}</b> ${escapeHtml(t('input'))}</span>`,
    `<span><b>${compact(recap.write)}</b> ${escapeHtml(t('cacheWrite'))}</span>`,
    `<span><b>${compact(recap.output)}</b> ${escapeHtml(t('output'))}</span>`,
    `<span>${escapeHtml(t('cacheHit'))} <b>${recap.hit === null ? '—' : `${recap.hit}%`}</b></span>`,
    '</div>',
    `<div class="cost"><div class="big">${escapeHtml(t('costRange', { low: money(recap.cost.low), high: money(recap.cost.high) }))}</div>`,
    `<div class="note">${escapeHtml(t('costNote'))}</div></div>`,
    recap.tools.length > 0 ? `<div class="tools"><p class="sec">${escapeHtml(t('topTools'))}</p>${toolRows}</div>` : '',
    `<p class="foot">${escapeHtml(t('generated'))} · dsh-session-recap</p>`,
    '</main></body></html>',
  ].join('')
}
