/**
 * Client half of dsh-session-recap.
 *
 * Registers one ambient entry under the composer. It reads only what the
 * Conversation layer already publishes for this session — the Chat snapshot,
 * the `sessionStats` projection and the `tokenUsage` projection — and renders a
 * recap card the user can copy or download.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-recap',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    let ReactDOM = null
    try {
      ReactDOM = require('react-dom')
    } catch {
      ReactDOM = null
    }

    const NS = 'session-recap'
    const SLOT = 'conversation.composer.dock'
    const ENTRY_ID = 'session-recap'

    /**
     * Official DeepSeek pricing, USD per 1M tokens, for the Flash model
     * (DeepSeek-V4.1-Flash-1017). Off-peak is half of peak; peak hours are
     * 01:00-04:00 and 06:00-10:00 UTC on weekdays. A session total has no
     * per-request timestamps, so the card shows the off-peak-to-peak range.
     * Source: https://api-docs.deepseek.com/quick_start/pricing/
     */
    const PRICE = {
      cacheHit: { off: 0.003, peak: 0.006 },
      cacheMiss: { off: 0.15, peak: 0.3 },
      output: { off: 0.6, peak: 1.2 },
    }

    const DICT = {
      en: {
        pill: 'Recap',
        title: 'Session recap',
        close: 'Close',
        empty: 'This session has no usage yet. Send a message first.',
        turns: 'Turns',
        steps: 'Steps',
        duration: 'Wall time',
        toolCalls: 'Tool calls',
        input: 'Uncached input',
        cached: 'Cache read',
        cacheWrite: 'Cache write',
        output: 'Output',
        cacheHit: 'Cache hit',
        cost: 'Estimated cost',
        costRange: '{low} – {high}',
        costNote: 'DeepSeek Flash list price, off-peak to peak. For reference only.',
        topTools: 'Most used tools',
        errors: '{count} failed tool calls',
        actionsCopy: 'Copy Markdown',
        copied: 'Copied',
        actionsMd: 'Download .md',
        actionsHtml: 'Download .html',
        footnote: 'Built from this session’s tokenUsage and sessionStats projections. Nothing leaves your machine.',
        llmTime: 'Model time',
        toolTime: 'Tool time',
        generated: 'Recap of a DeepSeek Harness session',
        noTools: 'No tool calls',
      },
      zh: {
        pill: '复盘卡',
        title: '会话复盘',
        close: '关闭',
        empty: '这个会话还没有用量，先发一条消息吧。',
        turns: '轮次',
        steps: '步数',
        duration: '总耗时',
        toolCalls: '工具调用',
        input: '输入（未缓存）',
        cached: '缓存命中',
        cacheWrite: '缓存写入',
        output: '输出',
        cacheHit: '缓存命中率',
        cost: '预估花费',
        costRange: '{low} – {high}',
        costNote: '按 DeepSeek Flash 官网定价，低谷价–高峰价，仅供参考。',
        topTools: '调用最多的工具',
        errors: '{count} 次工具失败',
        actionsCopy: '复制 Markdown',
        copied: '已复制',
        actionsMd: '下载 .md',
        actionsHtml: '下载 .html',
        footnote: '数据来自本会话的 tokenUsage 与 sessionStats 投影，不上传任何内容。',
        llmTime: '模型耗时',
        toolTime: '工具耗时',
        generated: '由 DeepSeek Harness 会话生成',
        noTools: '没有工具调用',
      },
    }

    const CSS = [
      '.dsr-pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;',
      'border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);',
      'color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1;cursor:pointer;',
      'transition:background .15s ease,color .15s ease,border-color .15s ease}',
      '.dsr-pill:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.dsr-pill:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dsr-pill svg{display:block}',
      '.dsr-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;',
      'padding:24px;background:rgba(9,14,24,.42);backdrop-filter:blur(2px)}',
      '.dsr-modal{width:min(520px,100%);max-height:min(86vh,760px);overflow:auto;border-radius:16px;',
      'background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);',
      'border:1px solid var(--dsw-alias-border-l1);box-shadow:0 24px 64px rgba(6,10,20,.34);',
      'font-family:inherit;font-size:13px;line-height:1.5}',
      '.dsr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 12px}',
      '.dsr-title{margin:0;font-size:15px;font-weight:600;letter-spacing:.01em}',
      '.dsr-sub{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.dsr-x{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;',
      'border-radius:8px;width:28px;height:28px;font-size:16px;line-height:1}',
      '.dsr-x:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dsr-body{padding:0 20px 18px}',
      '.dsr-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:14px}',
      '.dsr-cell{padding:10px 10px 9px;border-radius:10px;background:var(--dsw-alias-bg-layer-1);',
      'border:1px solid var(--dsw-alias-border-l1)}',
      '.dsr-k{font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dsr-v{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}',
      '.dsr-sec{margin-top:14px}',
      '.dsr-secT{font-size:11px;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px}',
      '.dsr-bar{display:flex;height:8px;border-radius:999px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}',
      '.dsr-bar span{display:block;height:100%}',
      '.dsr-seg-cache{background:var(--dsw-alias-brand-primary)}',
      '.dsr-seg-in{background:var(--dsw-alias-state-idle-primary);opacity:.55}',
      '.dsr-seg-write{background:var(--dsw-alias-state-warn-primary);opacity:.8}',
      '.dsr-seg-out{background:var(--dsw-alias-state-success-primary)}',
      '.dsr-legend{display:flex;flex-wrap:wrap;gap:10px 14px;margin-top:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}',
      '.dsr-legend b{color:var(--dsw-alias-label-primary);font-weight:600;font-variant-numeric:tabular-nums}',
      '.dsr-dot{display:inline-block;width:7px;height:7px;border-radius:2px;margin-right:5px;vertical-align:1px}',
      '.dsr-tools{display:flex;flex-direction:column;gap:4px}',
      '.dsr-tool{display:flex;justify-content:space-between;gap:10px;font-size:12px;padding:3px 0;',
      'border-bottom:1px dashed var(--dsw-alias-border-l1)}',
      '.dsr-tool:last-child{border-bottom:0}',
      '.dsr-tool code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}',
      '.dsr-num{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dsr-cost{margin-top:14px;padding:12px 14px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);',
      'border:1px solid var(--dsw-alias-border-l1)}',
      '.dsr-costV{font-size:20px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.01em}',
      '.dsr-costN{margin-top:3px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dsr-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}',
      '.dsr-btn{appearance:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);',
      'color:var(--dsw-alias-label-primary);border-radius:9px;height:30px;padding:0 12px;font-size:12px;cursor:pointer}',
      '.dsr-btn:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dsr-btn.primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}',
      '.dsr-btn.primary:hover{filter:brightness(1.06)}',
      '.dsr-foot{margin-top:12px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
    ].join('')

    function readNumber(value) {
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
    }

    function compact(n) {
      if (!Number.isFinite(n) || n <= 0) return '0'
      if (n < 1000) return String(Math.round(n))
      if (n < 1000000) {
        const k = n / 1000
        return (k >= 100 ? String(Math.round(k)) : k.toFixed(k >= 10 ? 0 : 1)) + 'k'
      }
      const m = n / 1000000
      return (m >= 100 ? String(Math.round(m)) : m.toFixed(m >= 10 ? 0 : 1)) + 'M'
    }

    function money(n) {
      if (n <= 0) return '$0'
      if (n < 0.01) return '$' + n.toFixed(4)
      if (n < 1) return '$' + n.toFixed(3)
      return '$' + n.toFixed(2)
    }

    function duration(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return '—'
      const s = Math.round(ms / 1000)
      if (s < 60) return s + 's'
      const m = Math.floor(s / 60)
      const rem = s % 60
      if (m < 60) return rem === 0 ? m + 'm' : m + 'm' + rem + 's'
      const hr = Math.floor(m / 60)
      return hr + 'h' + (m % 60) + 'm'
    }

    function toolNameOf(node) {
      const data = node && node.data ? node.data : {}
      const candidates = [data.root && data.root.name, data.name, data.toolName, node.name]
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate !== '') return candidate
      }
      return 'tool'
    }

    function deriveFromNodes(nodes) {
      const turns = new Set()
      let steps = 0
      let llmMs = 0
      let toolMs = 0
      let first = 0
      let last = 0
      const tools = new Map()
      let errors = 0
      for (const node of nodes) {
        const time = readNumber(node && node.time)
        if (time > 0) {
          if (first === 0 || time < first) first = time
          if (time > last) last = time
        }
        if (!node) continue
        if (node.kind === 'assistant') {
          if (typeof node.turn === 'number') turns.add(node.turn)
          steps += 1
          if (node.timing && typeof node.timing.stepStartTime === 'number' && typeof node.timing.completedTime === 'number') {
            llmMs += Math.max(0, node.timing.completedTime - node.timing.stepStartTime)
          }
        } else if (node.kind === 'tool-result') {
          if (typeof node.callTime === 'number' && typeof node.time === 'number') {
            toolMs += Math.max(0, node.time - node.callTime)
          }
          if (node.data && (node.data.isError === true || node.data.error !== undefined)) errors += 1
        } else if (node.kind === 'tool-call') {
          const name = toolNameOf(node)
          tools.set(name, (tools.get(name) || 0) + 1)
        }
      }
      return {
        turns: turns.size,
        steps,
        llmMs,
        toolMs,
        wallMs: first > 0 && last > first ? last - first : 0,
        tools: Array.from(tools, function (entry) { return { name: entry[0], count: entry[1] } })
          .sort(function (a, b) { return b.count - a.count }),
        errors,
        firstTime: first,
      }
    }

    function buildRecap(usage, stats, nodes) {
      const base = deriveFromNodes(nodes)
      const uncached = readNumber(usage && usage.uncachedInputTokens)
      const cached = readNumber(usage && usage.cacheReadTokens)
      const write = readNumber(usage && usage.cacheWriteTokens)
      const output = readNumber(usage && usage.outputTokens)
      const input = uncached + cached + write
      const total = input + output
      const hit = input > 0 ? Math.round((cached / input) * 1000) / 10 : null
      const billedMiss = uncached + write
      const off = (cached * PRICE.cacheHit.off + billedMiss * PRICE.cacheMiss.off + output * PRICE.output.off) / 1000000
      const peak = (cached * PRICE.cacheHit.peak + billedMiss * PRICE.cacheMiss.peak + output * PRICE.output.peak) / 1000000
      const turns = stats && typeof stats.turns === 'number' ? stats.turns : base.turns
      const steps = stats && typeof stats.steps === 'number' ? stats.steps : base.steps
      const llmMs = stats && typeof stats.llmMs === 'number' ? stats.llmMs : base.llmMs
      const toolMs = stats && typeof stats.toolMs === 'number' ? stats.toolMs : base.toolMs
      const toolTotal = base.tools.reduce(function (sum, tool) { return sum + tool.count }, 0)
      return {
        uncached: uncached,
        cached: cached,
        write: write,
        output: output,
        input: input,
        total: total,
        hit: hit,
        turns: turns,
        steps: steps,
        llmMs: llmMs,
        toolMs: toolMs,
        wallMs: base.wallMs,
        tools: base.tools,
        toolTotal: toolTotal,
        errors: base.errors,
        cost: { low: off, high: peak },
        startedAt: base.firstTime,
      }
    }

    function dateLabel(ms, locale) {
      if (!ms) return ''
      try {
        return new Date(ms).toLocaleString(locale && /^zh/i.test(locale) ? 'zh-CN' : 'en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      } catch {
        return ''
      }
    }

    function buildMarkdown(recap, t, locale) {
      const lines = []
      lines.push('# ' + t('title') + ' · ' + (dateLabel(recap.startedAt, locale) || ''))
      lines.push('')
      lines.push('- ' + t('turns') + ': ' + recap.turns)
      lines.push('- ' + t('steps') + ': ' + recap.steps)
      lines.push('- ' + t('duration') + ': ' + duration(recap.wallMs))
      lines.push('- ' + t('toolCalls') + ': ' + recap.toolTotal + (recap.errors > 0 ? ' (' + t('errors', { count: recap.errors }) + ')' : ''))
      lines.push('')
      lines.push('## Token')
      lines.push('')
      lines.push('| ' + t('input') + ' | ' + t('cached') + ' | ' + t('cacheWrite') + ' | ' + t('output') + ' | ' + t('cacheHit') + ' |')
      lines.push('| ---: | ---: | ---: | ---: | ---: |')
      lines.push('| ' + compact(recap.uncached) + ' | ' + compact(recap.cached) + ' | ' + compact(recap.write) + ' | ' + compact(recap.output) + ' | ' + (recap.hit === null ? '—' : recap.hit + '%') + ' |')
      lines.push('')
      lines.push('**' + t('cost') + '**: ' + (t('costRange', { low: money(recap.cost.low), high: money(recap.cost.high) })) + '  ')
      lines.push('_' + t('costNote') + '_')
      if (recap.tools.length > 0) {
        lines.push('')
        lines.push('## ' + t('topTools'))
        lines.push('')
        for (const tool of recap.tools.slice(0, 10)) lines.push('- `' + tool.name + '` × ' + tool.count)
      }
      lines.push('')
      lines.push('---')
      lines.push('_' + t('generated') + ' · dsh-session-recap_')
      return lines.join('\n')
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
      })
    }

    function buildHtml(recap, t, locale) {
      const w = recap.input > 0 ? recap.input : 1
      const pct = function (n) { return Math.max(0, Math.min(100, (n / w) * 100)) }
      const toolRows = recap.tools.slice(0, 10).map(function (tool) {
        return '<div class="row"><code>' + escapeHtml(tool.name) + '</code><span>' + tool.count + '</span></div>'
      }).join('')
      const cells = [
        [t('turns'), String(recap.turns)],
        [t('steps'), String(recap.steps)],
        [t('duration'), duration(recap.wallMs)],
        [t('toolCalls'), String(recap.toolTotal)],
      ].map(function (cell) {
        return '<div class="cell"><div class="k">' + escapeHtml(cell[0]) + '</div><div class="v">' + escapeHtml(cell[1]) + '</div></div>'
      }).join('')
      return [
        '<!doctype html><html lang="' + (/^zh/i.test(locale || '') ? 'zh' : 'en') + '"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        '<title>' + escapeHtml(t('title')) + '</title><style>',
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
        '<div class="eyebrow">' + escapeHtml(t('title')) + '</div>',
        '<h1>' + escapeHtml(dateLabel(recap.startedAt, locale) || t('title')) + '</h1>',
        '<p class="sub">' + escapeHtml(t('generated')) + '</p>',
        '<div class="grid">' + cells + '</div>',
        '<p class="sec">Token</p>',
        '<div class="bar">',
        '<i style="width:' + pct(recap.cached).toFixed(2) + '%;background:#2f7dea"></i>',
        '<i style="width:' + pct(recap.uncached).toFixed(2) + '%;background:#94a3b8"></i>',
        '<i style="width:' + pct(recap.write).toFixed(2) + '%;background:#f59e0b"></i>',
        '</div>',
        '<div class="legend">',
        '<span><b>' + compact(recap.cached) + '</b> ' + escapeHtml(t('cached')) + '</span>',
        '<span><b>' + compact(recap.uncached) + '</b> ' + escapeHtml(t('input')) + '</span>',
        '<span><b>' + compact(recap.write) + '</b> ' + escapeHtml(t('cacheWrite')) + '</span>',
        '<span><b>' + compact(recap.output) + '</b> ' + escapeHtml(t('output')) + '</span>',
        '<span>' + escapeHtml(t('cacheHit')) + ' <b>' + (recap.hit === null ? '—' : recap.hit + '%') + '</b></span>',
        '</div>',
        '<div class="cost"><div class="big">' + escapeHtml(t('costRange', { low: money(recap.cost.low), high: money(recap.cost.high) })) + '</div>',
        '<div class="note">' + escapeHtml(t('costNote')) + '</div></div>',
        recap.tools.length > 0 ? '<div class="tools"><p class="sec">' + escapeHtml(t('topTools')) + '</p>' + toolRows + '</div>' : '',
        '<p class="foot">' + escapeHtml(t('generated')) + ' · dsh-session-recap</p>',
        '</main></body></html>',
      ].join('')
    }

    function download(name, text, mime) {
      try {
        const blob = new Blob([text], { type: mime })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = name
        anchor.style.display = 'none'
        document.body.appendChild(anchor)
        anchor.click()
        window.setTimeout(function () {
          try {
            anchor.remove()
            URL.revokeObjectURL(url)
          } catch {}
        }, 1000)
        return true
      } catch {
        return false
      }
    }

    async function copyText(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text)
          return true
        }
      } catch {}
      try {
        const area = document.createElement('textarea')
        area.value = text
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const ok = document.execCommand('copy')
        area.remove()
        return ok
      } catch {
        return false
      }
    }

    function fileStem(recap) {
      const d = new Date(recap.startedAt || Date.now())
      const pad = function (n) { return String(n).padStart(2, '0') }
      return 'session-recap-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes())
    }

    function SessionRecap(props) {
      const t = props.t
      const usage = props.useProjection ? props.useProjection('tokenUsage') : undefined
      const stats = props.useProjection ? props.useProjection('sessionStats') : undefined
      const nodes = props.useChat ? props.useChat(function (snapshot) { return snapshot.legacy.nodes }) : undefined
      const [open, setOpen] = React.useState(false)
      const [copied, setCopied] = React.useState(false)
      const closeRef = React.useRef(null)

      const recap = React.useMemo(
        function () { return buildRecap(usage, stats, nodes || []) },
        [usage, stats, nodes],
      )
      const locale = typeof navigator !== 'undefined' ? navigator.language : 'en'

      React.useEffect(function () {
        if (!open) return undefined
        const onKey = function (event) {
          if (event.key === 'Escape') setOpen(false)
        }
        window.addEventListener('keydown', onKey)
        const focusTimer = window.setTimeout(function () {
          if (closeRef.current) closeRef.current.focus()
        }, 30)
        return function () {
          window.removeEventListener('keydown', onKey)
          window.clearTimeout(focusTimer)
        }
      }, [open])

      const onCopy = React.useCallback(function () {
        copyText(buildMarkdown(recap, t, locale)).then(function (ok) {
          if (!ok) return
          setCopied(true)
          window.setTimeout(function () { setCopied(false) }, 1600)
        })
      }, [recap, t, locale])

      const pill = h(
        'button',
        {
          type: 'button',
          className: 'dsr-pill',
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          title: t('title'),
          onClick: function () { setOpen(true) },
        },
        h('svg', { viewBox: '0 0 16 16', width: 13, height: 13, 'aria-hidden': 'true' },
          h('rect', { x: 1.5, y: 2.5, width: 13, height: 11, rx: 2.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 }),
          h('rect', { x: 4, y: 9, width: 2, height: 3, rx: 0.6, fill: 'currentColor' }),
          h('rect', { x: 7, y: 7, width: 2, height: 5, rx: 0.6, fill: 'currentColor' }),
          h('rect', { x: 10, y: 5, width: 2, height: 7, rx: 0.6, fill: 'currentColor' }),
        ),
        h('span', null, t('pill')),
      )

      if (!open) return pill

      const w = recap.input > 0 ? recap.input : 1
      const pct = function (n) { return Math.max(0, Math.min(100, (n / w) * 100)) }
      const cells = [
        [t('turns'), String(recap.turns)],
        [t('steps'), String(recap.steps)],
        [t('duration'), duration(recap.wallMs)],
        [t('toolCalls'), String(recap.toolTotal)],
      ]

      const body = [
        h('div', { className: 'dsr-head', key: 'head' },
          h('div', null,
            h('h2', { className: 'dsr-title' }, t('title')),
            h('p', { className: 'dsr-sub' }, (dateLabel(recap.startedAt, locale) || '') + (recap.turns > 0 ? ' · ' + recap.turns + ' ' + t('turns').toLowerCase() : '')),
          ),
          h('button', {
            type: 'button', className: 'dsr-x', ref: closeRef, 'aria-label': t('close'),
            onClick: function () { setOpen(false) },
          }, '×'),
        ),
        h('div', { className: 'dsr-body', key: 'body' },
          recap.total === 0 && recap.toolTotal === 0
            ? h('p', { className: 'dsr-foot' }, t('empty'))
            : h(React.Fragment, null,
              h('div', { className: 'dsr-grid' },
                cells.map(function (cell) {
                  return h('div', { className: 'dsr-cell', key: cell[0] },
                    h('div', { className: 'dsr-k' }, cell[0]),
                    h('div', { className: 'dsr-v' }, cell[1]),
                  )
                }),
              ),
              h('div', { className: 'dsr-sec' },
                h('div', { className: 'dsr-secT' }, 'Token'),
                h('div', { className: 'dsr-bar' },
                  h('span', { className: 'dsr-seg-cache', style: { width: pct(recap.cached) + '%' } }),
                  h('span', { className: 'dsr-seg-in', style: { width: pct(recap.uncached) + '%' } }),
                  h('span', { className: 'dsr-seg-write', style: { width: pct(recap.write) + '%' } }),
                ),
                h('div', { className: 'dsr-legend' },
                  h('span', null, h('i', { className: 'dsr-dot dsr-seg-cache' }), t('cached') + ' ', h('b', null, compact(recap.cached))),
                  h('span', null, h('i', { className: 'dsr-dot dsr-seg-in' }), t('input') + ' ', h('b', null, compact(recap.uncached))),
                  h('span', null, h('i', { className: 'dsr-dot dsr-seg-write' }), t('cacheWrite') + ' ', h('b', null, compact(recap.write))),
                  h('span', null, h('i', { className: 'dsr-dot dsr-seg-out' }), t('output') + ' ', h('b', null, compact(recap.output))),
                  h('span', null, t('cacheHit') + ' ', h('b', null, recap.hit === null ? '—' : recap.hit + '%')),
                ),
              ),
              h('div', { className: 'dsr-cost' },
                h('div', { className: 'dsr-k' }, t('cost')),
                h('div', { className: 'dsr-costV' }, t('costRange', { low: money(recap.cost.low), high: money(recap.cost.high) })),
                h('div', { className: 'dsr-costN' }, t('costNote')),
              ),
              h('div', { className: 'dsr-sec' },
                h('div', { className: 'dsr-secT' }, t('topTools')),
                recap.tools.length === 0
                  ? h('div', { className: 'dsr-foot' }, t('noTools'))
                  : h('div', { className: 'dsr-tools' },
                    recap.tools.slice(0, 6).map(function (tool) {
                      return h('div', { className: 'dsr-tool', key: tool.name },
                        h('code', null, tool.name),
                        h('span', { className: 'dsr-num' }, '× ' + tool.count),
                      )
                    }),
                  ),
                recap.errors > 0 ? h('div', { className: 'dsr-foot' }, t('errors', { count: recap.errors })) : null,
              ),
              h('div', { className: 'dsr-actions' },
                h('button', { type: 'button', className: 'dsr-btn primary', onClick: onCopy }, copied ? t('copied') : t('actionsCopy')),
                h('button', {
                  type: 'button', className: 'dsr-btn',
                  onClick: function () { download(fileStem(recap) + '.md', buildMarkdown(recap, t, locale), 'text/markdown;charset=utf-8') },
                }, t('actionsMd')),
                h('button', {
                  type: 'button', className: 'dsr-btn',
                  onClick: function () { download(fileStem(recap) + '.html', buildHtml(recap, t, locale), 'text/html;charset=utf-8') },
                }, t('actionsHtml')),
              ),
              h('div', { className: 'dsr-foot' }, t('footnote')),
            ),
        ),
      ]

      const panel = h('div', {
        className: 'dsr-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('title'),
        onClick: function (event) { event.stopPropagation() },
      }, body)

      if (ReactDOM && typeof ReactDOM.createPortal === 'function') {
        return h(React.Fragment, null, pill, ReactDOM.createPortal(
          h('div', { className: 'dsr-backdrop', onClick: function () { setOpen(false) } }, panel),
          document.body,
        ))
      }
      return h('div', { style: { position: 'relative', display: 'inline-block' } }, pill,
        open ? h('div', { style: { position: 'fixed', inset: 0, zIndex: 2147483000, display: 'flex', alignItems: 'center', justifyContent: 'center' } }, panel) : null)
    }

    function makeT(ctx) {
      let bound = null
      try {
        const locale = ctx.get('locale')
        if (locale && typeof locale.register === 'function') {
          ctx.effect(function () {
            try {
              return locale.register(NS, DICT)
            } catch {
              return undefined
            }
          }, 'session-recap dictionaries')
          if (typeof locale.bind === 'function') bound = locale.bind(NS)
        }
      } catch {}
      if (bound) return function (key, params) { return bound(key, params) }
      let zh = false
      try { zh = /^zh/i.test(navigator.language || '') } catch {}
      const dict = zh ? DICT.zh : DICT.en
      return function (key, params) {
        let text = dict[key] !== undefined ? dict[key] : (DICT.en[key] !== undefined ? DICT.en[key] : key)
        if (params) {
          text = text.replace(/\{(\w+)\}/g, function (match, name) {
            return name in params ? String(params[name]) : match
          })
        }
        return text
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const t = makeT(ctx)
        const node = document.createElement('style')
        node.textContent = CSS
        document.head.appendChild(node)
        ctx.effect(function () { node.remove() }, 'session-recap styles')
        ctx.slots.inject(SLOT, function () {
          return ctx.slots.register({ name: SLOT, id: ENTRY_ID, order: 3, label: function () { return t('pill') } }, function (props) {
            return h(SessionRecap, Object.assign({}, props, { t: t }))
          })
        })
      },
    }
  },
})
