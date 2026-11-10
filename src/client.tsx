import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ClientContext, SlotProps, Translate } from './dsh-runtime'
import { buildHtml, buildMarkdown, buildRecap, compact, dateLabel, duration, fileStem, money } from './recap'
import css from './styles.css'

/** Services this plugin needs from the page. */
export const inject = ['slots']

const SLOT = 'conversation.composer.dock'
const ENTRY_ID = 'session-recap'
const NS = 'session-recap'

const DICT: Record<'en' | 'zh', Record<string, string>> = {
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
    generated: '由 DeepSeek Harness 会话生成',
    noTools: '没有工具调用',
  },
}

type Props = SlotProps & { t: Translate }

function download(name: string, text: string, mime: string): boolean {
  try {
    const blob = new Blob([text], { type: mime })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    window.setTimeout(() => {
      try {
        anchor.remove()
        URL.revokeObjectURL(url)
      } catch {
        /* the document may already be gone */
      }
    }, 1000)
    return true
  } catch {
    return false
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the selection fallback */
  }
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

function SessionRecap(props: Props): JSX.Element {
  const { t } = props
  const usage = props.useProjection('tokenUsage')
  const stats = props.useProjection('sessionStats')
  const nodes = props.useChat((snapshot) => snapshot.legacy?.nodes ?? [])
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const locale = typeof navigator === 'undefined' ? 'en' : navigator.language

  const recap = useMemo(() => buildRecap(usage, stats, nodes), [usage, stats, nodes])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const timer = window.setTimeout(() => closeRef.current?.focus(), 30)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(timer)
    }
  }, [open])

  const onCopy = useCallback(() => {
    void copyText(buildMarkdown(recap, t, locale)).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }, [recap, t, locale])

  const pill = (
    <button
      type="button"
      className="dsr-pill"
      aria-haspopup="dialog"
      aria-expanded={open}
      title={t('title')}
      onClick={() => setOpen(true)}
    >
      <svg viewBox="0 0 16 16" width={13} height={13} aria-hidden="true">
        <rect x={1.5} y={2.5} width={13} height={11} rx={2.5} fill="none" stroke="currentColor" strokeWidth={1.2} />
        <rect x={4} y={9} width={2} height={3} rx={0.6} fill="currentColor" />
        <rect x={7} y={7} width={2} height={5} rx={0.6} fill="currentColor" />
        <rect x={10} y={5} width={2} height={7} rx={0.6} fill="currentColor" />
      </svg>
      <span>{t('pill')}</span>
    </button>
  )

  if (!open) return pill

  const width = recap.input > 0 ? recap.input : 1
  const percent = (value: number): string => `${Math.max(0, Math.min(100, (value / width) * 100))}%`
  const cells: Array<[string, string]> = [
    [t('turns'), String(recap.turns)],
    [t('steps'), String(recap.steps)],
    [t('duration'), duration(recap.wallMs)],
    [t('toolCalls'), String(recap.toolTotal)],
  ]

  const panel = (
    <div
      className="dsr-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="dsr-head">
        <div>
          <h2 className="dsr-title">{t('title')}</h2>
          <p className="dsr-sub">
            {dateLabel(recap.startedAt, locale)}
            {recap.turns > 0 ? ` · ${recap.turns} ${t('turns')}` : ''}
          </p>
        </div>
        <button type="button" className="dsr-x" ref={closeRef} aria-label={t('close')} onClick={() => setOpen(false)}>
          ×
        </button>
      </div>

      <div className="dsr-body">
        {recap.total === 0 && recap.toolTotal === 0 ? (
          <p className="dsr-foot">{t('empty')}</p>
        ) : (
          <>
            <div className="dsr-grid">
              {cells.map(([label, value]) => (
                <div className="dsr-cell" key={label}>
                  <div className="dsr-k">{label}</div>
                  <div className="dsr-v">{value}</div>
                </div>
              ))}
            </div>

            <div className="dsr-sec">
              <div className="dsr-secT">Token</div>
              <div className="dsr-bar">
                <span className="dsr-seg-cache" style={{ width: percent(recap.cached) }} />
                <span className="dsr-seg-in" style={{ width: percent(recap.uncached) }} />
                <span className="dsr-seg-write" style={{ width: percent(recap.write) }} />
              </div>
              <div className="dsr-legend">
                <span>
                  <i className="dsr-dot dsr-seg-cache" />
                  {t('cached')} <b>{compact(recap.cached)}</b>
                </span>
                <span>
                  <i className="dsr-dot dsr-seg-in" />
                  {t('input')} <b>{compact(recap.uncached)}</b>
                </span>
                <span>
                  <i className="dsr-dot dsr-seg-write" />
                  {t('cacheWrite')} <b>{compact(recap.write)}</b>
                </span>
                <span>
                  <i className="dsr-dot dsr-seg-out" />
                  {t('output')} <b>{compact(recap.output)}</b>
                </span>
                <span>
                  {t('cacheHit')} <b>{recap.hit === null ? '—' : `${recap.hit}%`}</b>
                </span>
              </div>
            </div>

            <div className="dsr-cost">
              <div className="dsr-k">{t('cost')}</div>
              <div className="dsr-costV">
                {t('costRange', { low: money(recap.cost.low), high: money(recap.cost.high) })}
              </div>
              <div className="dsr-costN">{t('costNote')}</div>
            </div>

            <div className="dsr-sec">
              <div className="dsr-secT">{t('topTools')}</div>
              {recap.tools.length === 0 ? (
                <div className="dsr-foot">{t('noTools')}</div>
              ) : (
                <div className="dsr-tools">
                  {recap.tools.slice(0, 6).map((tool) => (
                    <div className="dsr-tool" key={tool.name}>
                      <code>{tool.name}</code>
                      <span className="dsr-num">× {tool.count}</span>
                    </div>
                  ))}
                </div>
              )}
              {recap.errors > 0 ? <div className="dsr-foot">{t('errors', { count: recap.errors })}</div> : null}
            </div>

            <div className="dsr-actions">
              <button type="button" className="dsr-btn primary" onClick={onCopy}>
                {copied ? t('copied') : t('actionsCopy')}
              </button>
              <button
                type="button"
                className="dsr-btn"
                onClick={() => download(`${fileStem(recap)}.md`, buildMarkdown(recap, t, locale), 'text/markdown;charset=utf-8')}
              >
                {t('actionsMd')}
              </button>
              <button
                type="button"
                className="dsr-btn"
                onClick={() => download(`${fileStem(recap)}.html`, buildHtml(recap, t, locale), 'text/html;charset=utf-8')}
              >
                {t('actionsHtml')}
              </button>
            </div>

            <div className="dsr-foot">{t('footnote')}</div>
          </>
        )}
      </div>
    </div>
  )

  return (
    <>
      {pill}
      {createPortal(
        <div className="dsr-backdrop" onClick={() => setOpen(false)}>
          {panel}
        </div>,
        document.body,
      )}
    </>
  )
}

function makeT(ctx: ClientContext): Translate {
  let bound: Translate | null = null
  const locale = ctx.get('locale')
  if (locale !== undefined && typeof locale.register === 'function') {
    ctx.effect(() => {
      try {
        return locale.register(NS, DICT)
      } catch {
        return undefined
      }
    }, 'session-recap dictionaries')
    if (typeof locale.bind === 'function') bound = locale.bind(NS)
  }
  if (bound !== null) return bound

  const zh = typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '')
  const dictionary = zh ? DICT.zh : DICT.en
  return (key, params) => {
    let text = dictionary[key] ?? DICT.en[key] ?? key
    if (params !== undefined) {
      text = text.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in params ? String(params[name]) : match,
      )
    }
    return text
  }
}

export function apply(ctx: ClientContext): void {
  const t = makeT(ctx)
  const node = document.createElement('style')
  node.textContent = css
  document.head.appendChild(node)
  ctx.effect(() => () => node.remove(), 'session-recap styles')

  ctx.slots.inject(SLOT, () =>
    ctx.slots.register({ name: SLOT, id: ENTRY_ID, order: 3, label: () => t('pill') }, (props) => (
      <SessionRecap {...props} t={t} />
    )),
  )
}
