#!/usr/bin/env node
/**
 * Watch the sources that decide this plugin's fate, and report only changes.
 *
 * Targets:
 *   - deepseek-harness release notes (a marketplace or author-program
 *     announcement lands here first)
 *   - Hacker News stories mentioning DeepSeek Harness (third-party coverage
 *     often appears before our own feeds)
 *   - the npm registry entry for this package (published or not)
 *
 * State lives in `.state/watch.json`. Exit code is always 0 unless a fetch
 * throws; the caller reads `STATUS:` from stdout.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const stateFile = join(root, '.state', 'watch.json')
const PKG = 'dsh-session-recap'

const KEYWORDS = /(插件市场|插件商店|外挂市集|扶持|作者计划|赠助|补贴|激励|plugin market|marketplace|plugin program|creator program|grant|subsid)/i
const UA = { 'user-agent': 'dsh-session-recap-watch/1.0 (+https://github.com/)' }

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)
}

async function getText(url, limit = 400000) {
  const response = await fetch(url, { headers: UA, redirect: 'follow' })
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`)
  return (await response.text()).slice(0, limit)
}

function plainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchingSentences(text) {
  const sentences = plainText(text)
    .split(/(?<=[。！？!?])\s+|(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 8 && sentence.length < 400 && KEYWORDS.test(sentence))
  return sentences.slice(0, 40)
}

async function watchReleases() {
  const raw = await getText('https://api.github.com/repos/deepseek-ai/deepseek-harness/releases?per_page=5')
  const releases = JSON.parse(raw)
  const items = []
  for (const release of releases) {
    items.push(`${release.tag_name} ${release.published_at ?? ''}`.trim())
    const sentences = matchingSentences(String(release.body ?? ''))
    for (const sentence of sentences) items.push(`${release.tag_name}: ${sentence}`)
  }
  return { id: 'dsh-releases', digest: digest(items), items }
}

async function watchHackerNews() {
  const raw = await getText('https://hn.algolia.com/api/v1/search_by_date?query=DeepSeek%20Harness&tags=story&hitsPerPage=8')
  const payload = JSON.parse(raw)
  const stories = (payload.hits ?? []).map((hit) => `${hit.objectID} ${hit.title ?? ''}`)
  return { id: 'hacker-news', digest: digest(stories), items: stories }
}

async function watchNpm() {
  const response = await fetch(`https://registry.npmjs.org/${PKG}`, { headers: UA })
  if (response.status === 404) return { id: 'npm', digest: 'absent', items: ['package name is still free'] }
  if (!response.ok) throw new Error(`HTTP ${response.status} npm`)
  const payload = await response.json()
  const versions = Object.keys(payload.versions ?? {}).slice(-5)
  const items = [`latest: ${payload['dist-tags']?.latest ?? 'unknown'}`, `versions: ${versions.join(', ')}`]
  return { id: 'npm', digest: digest(items), items }
}

const TARGETS = [watchReleases, watchHackerNews, watchNpm]

async function loadState() {
  try {
    return JSON.parse(await readFile(stateFile, 'utf8'))
  } catch {
    return {}
  }
}

const previous = await loadState()
const next = {}
const changes = []
const failures = []

for (const target of TARGETS) {
  try {
    const result = await target()
    next[result.id] = { digest: result.digest, items: result.items, at: new Date().toISOString() }
    const before = previous[result.id]
    if (before === undefined) {
      changes.push({ id: result.id, kind: 'first-run', added: result.items })
    } else if (before.digest !== result.digest) {
      const known = new Set(before.items ?? [])
      const added = result.items.filter((item) => !known.has(item))
      changes.push({ id: result.id, kind: 'changed', added, before: before.items ?? [] })
    }
  } catch (error) {
    failures.push(`${target.name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const keep = next
for (const [id, value] of Object.entries(previous)) if (keep[id] === undefined) keep[id] = value

await mkdir(dirname(stateFile), { recursive: true })
await writeFile(stateFile, JSON.stringify(keep, null, 2) + '\n', 'utf8')

if (failures.length > 0) console.log('FAILURES:\n' + failures.map((line) => `  - ${line}`).join('\n'))

if (changes.length === 0) {
  console.log('STATUS: UNCHANGED')
  process.exit(0)
}

console.log('STATUS: CHANGED')
for (const change of changes) {
  console.log(`\n[${change.id}] ${change.kind}`)
  const added = change.added.length > 0 ? change.added : ['(structure changed, no new distinct line)']
  for (const line of added.slice(0, 8)) console.log(`  + ${line}`)
}
