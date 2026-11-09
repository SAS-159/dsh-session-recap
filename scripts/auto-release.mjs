#!/usr/bin/env node
/**
 * Zero-touch release: create the repo, push, fork the catalog, add the entry,
 * and open the pull request — using a GitHub token instead of an interactive
 * login.
 *
 * Token resolution, first hit wins:
 *   1. $env:GITHUB_TOKEN / $env:GH_TOKEN
 *   2. ~/.dsh/github-token.txt   (no DSH restart needed — read at run time)
 *
 * Flags:
 *   --check      report what would happen; performs no writes
 *   --force-pr   open the PR even when the repo is younger than 24 hours
 *
 * The token is never printed, never written into .git/config, and never placed
 * in a URL: pushes authenticate through an ephemeral git http.extraheader.
 */
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEntry, buildPullRequestBody, entryFileName } from './catalog-entry.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const forcePr = args.includes('--force-pr')

const CATALOG = { owner: 'awesome-dsh-plugin', repo: 'awesome-dsh-plugin' }
const BRANCH = 'add-dsh-session-recap'
const DAY_MS = 24 * 60 * 60 * 1000

function log(step, message) {
  console.log(`[${step}] ${message}`)
}

async function resolveToken() {
  const fromEnv = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  if (fromEnv !== undefined && fromEnv.trim() !== '') return { token: fromEnv.trim(), source: 'environment' }
  const file = join(homedir(), '.dsh', 'github-token.txt')
  try {
    const token = (await readFile(file, 'utf8')).trim()
    if (token !== '') return { token, source: file }
  } catch {}
  return null
}

const resolved = await resolveToken()
if (resolved === null) {
  console.log('没有找到 GitHub token。两种放法，任选其一（只需一次）：')
  console.log('')
  console.log('  A. 存成文件（推荐，不用重启 DSH）：')
  console.log(`     把 PAT 写入 ${join(homedir(), '.dsh', 'github-token.txt')}`)
  console.log('  B. 环境变量：设置 GITHUB_TOKEN 后重启 DSH')
  console.log('')
  console.log('PAT 权限只需勾选 repo（或 public_repo）。创建地址：')
  console.log('  https://github.com/settings/tokens/new?scopes=repo&description=dsh-session-recap')
  process.exit(2)
}

const token = resolved.token
log('token', `loaded from ${resolved.source}`)

async function api(path, { method = 'GET', body, accept = 'application/vnd.github+json' } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'dsh-session-recap-release',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data = text
  try {
    data = text === '' ? null : JSON.parse(text)
  } catch {}
  return { status: response.status, ok: response.ok, data }
}

function message(data) {
  if (data !== null && typeof data === 'object' && typeof data.message === 'string') return data.message
  return typeof data === 'string' ? data.slice(0, 200) : ''
}

// 1. Identity -----------------------------------------------------------------
const me = await api('/user')
if (!me.ok) {
  log('whoami', `failed (HTTP ${me.status}) ${message(me.data)}`)
  console.log('token 无效或已过期，重新生成一个再来。')
  process.exit(1)
}
const login = me.data.login
log('whoami', `@${login}`)

const repoPath = `/repos/${login}/${pkg.name}`
const repo = await api(repoPath)
const repoExists = repo.ok
log('repo', repoExists ? `exists: ${repo.data.html_url}` : 'missing')

let createdAt = null
if (repoExists) createdAt = Date.parse(repo.data.created_at)

if (!repoExists && checkOnly) log('repo', 'would create a public repository')
else if (!repoExists) {
  const created = await api('/user/repos', {
    method: 'POST',
    body: {
      name: pkg.name,
      description: pkg.description,
      homepage: '',
      private: false,
      has_issues: true,
      has_wiki: false,
      has_projects: false,
    },
  })
  if (!created.ok) {
    log('repo', `create failed (HTTP ${created.status}) ${message(created.data)}`)
    process.exit(1)
  }
  createdAt = Date.parse(created.data.created_at)
  log('repo', `created: ${created.data.html_url}`)
}

const repoUrl = `https://github.com/${login}/${pkg.name}.git`

// 2. Topics -------------------------------------------------------------------
const topics = await api(`${repoPath}/topics`)
const currentTopics = new Set(Array.isArray(topics.data?.names) ? topics.data.names : [])
if (!currentTopics.has('dsh-plugin')) {
  if (checkOnly) log('topics', 'would add dsh-plugin')
  else {
    const next = [...currentTopics, 'dsh-plugin']
    const put = await api(`${repoPath}/topics`, { method: 'PUT', body: { names: next } })
    log('topics', put.ok ? `set: ${next.join(', ')}` : `failed (HTTP ${put.status}) ${message(put.data)}`)
  }
} else log('topics', 'dsh-plugin already set')

// 3. Push ---------------------------------------------------------------------
function git(args_, env = {}) {
  return execFileSync('git', args_, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } })
}

const remote = (() => {
  try {
    return git(['remote', 'get-url', 'origin']).trim()
  } catch {
    return null
  }
})()

if (remote === null) {
  if (!checkOnly) git(['remote', 'add', 'origin', repoUrl])
} else if (!remote.includes(`${login}/${pkg.name}`)) {
  if (!checkOnly) git(['remote', 'set-url', 'origin', repoUrl])
}

if (checkOnly) log('push', 'would push main to origin')
else {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
  try {
    git(['push', '-u', 'origin', 'main'], {
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    })
    log('push', 'ok')
  } catch (error) {
    log('push', 'failed')
    console.log(String(error.stderr ?? error.message).split('\n').slice(0, 5).map((line) => '  ' + line).join('\n'))
    process.exit(1)
  }
  await api(repoPath, { method: 'PATCH', body: { default_branch: 'main' } })
}

// 4. Catalog: local entry file ------------------------------------------------
const fileName = entryFileName(login, pkg.name)
const entry = buildEntry(login, pkg.name)
await mkdir(join(root, 'submission'), { recursive: true })
await writeFile(join(root, 'submission', fileName), entry, 'utf8')
log('entry', `submission/${fileName}`)

// 5. Fork the catalog ---------------------------------------------------------
const forkPath = `/repos/${login}/${CATALOG.repo}`
let fork = await api(forkPath)
if (!fork.ok) {
  if (checkOnly) log('fork', 'would fork awesome-dsh-plugin/awesome-dsh-plugin')
  else {
    const requested = await api(`/repos/${CATALOG.owner}/${CATALOG.repo}/forks`, {
      method: 'POST',
      body: { default_branch_only: true },
    })
    log('fork', requested.ok ? 'fork requested' : `failed (HTTP ${requested.status}) ${message(requested.data)}`)
    for (let attempt = 0; attempt < 30 && !fork.ok; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      fork = await api(forkPath)
    }
    if (!fork.ok) {
      log('fork', `not ready after 90s (HTTP ${fork.status}); re-run the script later`)
      process.exit(1)
    }
  }
} else log('fork', 'already exists')

// 6. Branch in the fork from catalog main ------------------------------------
const baseRef = await api(`/repos/${CATALOG.owner}/${CATALOG.repo}/git/ref/heads/main`)
if (!baseRef.ok) {
  log('branch', `cannot read catalog main (HTTP ${baseRef.status})`)
  process.exit(1)
}
const baseSha = baseRef.data.object.sha
const branchRef = `/repos/${login}/${CATALOG.repo}/git/refs/heads/${BRANCH}`
const existingRef = await api(branchRef)

if (checkOnly) log('branch', `would point ${BRANCH} at ${baseSha.slice(0, 7)}`)
else if (existingRef.ok) {
  const moved = await api(branchRef, { method: 'PATCH', body: { sha: baseSha, force: true } })
  log('branch', moved.ok ? `reset to ${baseSha.slice(0, 7)}` : `reset failed (HTTP ${moved.status}) ${message(moved.data)}`)
} else {
  const created = await api(`/repos/${login}/${CATALOG.repo}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${BRANCH}`, sha: baseSha },
  })
  log('branch', created.ok ? `created at ${baseSha.slice(0, 7)}` : `failed (HTTP ${created.status}) ${message(created.data)}`)
}

// 7. Upsert the entry file in the fork ---------------------------------------
const target = `data/plugins/${fileName}`
const contentsPath = `/repos/${login}/${CATALOG.repo}/contents/${target}`
const existingFile = await api(`${contentsPath}?ref=${BRANCH}`)

if (checkOnly) log('file', `would ${existingFile.ok ? 'update' : 'create'} ${target}`)
else {
  const body = {
    message: `Add ${login}/${pkg.name} (usage)`,
    content: Buffer.from(entry, 'utf8').toString('base64'),
    branch: BRANCH,
  }
  if (existingFile.ok) body.sha = existingFile.data.sha
  const put = await api(contentsPath, { method: 'PUT', body })
  log('file', put.ok ? `${existingFile.ok ? 'updated' : 'created'} ${target}` : `failed (HTTP ${put.status}) ${message(put.data)}`)
  if (!put.ok) process.exit(1)
}

// 8. Pull request -------------------------------------------------------------
const ageMs = createdAt === null ? Infinity : Date.now() - createdAt
if (ageMs < DAY_MS && !forcePr) {
  const ready = new Date(createdAt + DAY_MS).toISOString()
  log('pr', `skipped: repo is younger than 24h (CI would reject). Re-run after ${ready}`)
  process.exit(0)
}

const prBody = {
  title: `Add ${login}/${pkg.name} (usage)`,
  head: `${login}:${BRANCH}`,
  base: 'main',
  body: buildPullRequestBody(login, pkg.name),
}

if (checkOnly) {
  log('pr', `would open ${login}:${BRANCH} -> ${CATALOG.owner}/${CATALOG.repo}:main`)
  process.exit(0)
}

const pr = await api(`/repos/${CATALOG.owner}/${CATALOG.repo}/pulls`, { method: 'POST', body: prBody })
if (pr.ok) {
  log('pr', `opened: ${pr.data.html_url}`)
} else if (pr.status === 422) {
  const search = await api(`/repos/${CATALOG.owner}/${CATALOG.repo}/pulls?head=${encodeURIComponent(`${login}:${BRANCH}`)}&state=open`)
  const existing = Array.isArray(search.data) ? search.data[0] : undefined
  log('pr', existing ? `already open: ${existing.html_url}` : `not created (HTTP 422) ${message(pr.data)}`)
} else {
  log('pr', `failed (HTTP ${pr.status}) ${message(pr.data)}`)
  process.exit(1)
}
