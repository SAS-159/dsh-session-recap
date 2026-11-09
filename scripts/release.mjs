#!/usr/bin/env node
/**
 * One command for the parts that need your GitHub login.
 *
 *   1. pushes this repository to `origin`
 *   2. writes submission/<owner>__dsh-session-recap.yml with the real owner
 *   3. prints a prefilled "new file" URL for the awesome-dsh-plugin PR
 *   4. with --npm, also publishes to npm (only if `npm whoami` succeeds)
 *
 * Nothing here authenticates for you: the first `git push` opens your
 * credential helper, and `npm publish` needs `npm login` once.
 *
 * Usage: node scripts/release.mjs [--npm]
 */
import { execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const wantNpm = process.argv.includes('--npm')

function run(command, args, options = {}) {
  try {
    return { ok: true, out: execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim() }
  } catch (error) {
    return { ok: false, out: String(error.stdout ?? '').trim(), err: String(error.stderr ?? error.message).trim() }
  }
}

const remote = run('git', ['remote', 'get-url', 'origin'])
const owner = (() => {
  if (!remote.ok) return null
  const match = /github\.com[:/]([^/]+)\//.exec(remote.out)
  return match ? match[1] : null
})()

if (owner === null) {
  console.log('没有可用的 origin 远程仓库。一次性设置：')
  console.log('')
  console.log(`  1. 打开 https://github.com/new?name=${pkg.name} 创建公开仓库（不要勾选 README）`)
  console.log(`  2. git remote add origin https://github.com/<你的用户名>/${pkg.name}.git`)
  console.log('  3. 再运行: node scripts/release.mjs')
  console.log('')
  console.log('创建仓库后，本脚本会自动完成 push、生成收录文件并给出可直接打开的 PR 链接。')
  process.exit(1)
}

console.log(`owner: ${owner}`)

const push = run('git', ['push', '-u', 'origin', 'main'], { stdio: ['ignore', 'pipe', 'pipe'] })
if (push.ok) console.log('push: ok')
else {
  console.log('push: 失败，通常是还没登录 GitHub')
  console.log(push.err.split('\n').slice(0, 6).map((line) => '  ' + line).join('\n'))
  process.exit(1)
}

const description = {
  en: 'Adds a recap card under the composer for the current session: turns, steps, tool calls grouped by name, the uncached / cache-read / cache-write / output token split, the cache-hit rate, and a cost range computed from the official Flash off-peak and peak list prices. Exports the same card as Markdown or a standalone HTML page.',
  zh: '在输入框下方为当前会话生成复盘卡：轮次、步数、按名称聚合的工具调用、未缓存 / 缓存读 / 缓存写 / 输出四段 Token、缓存命中率，以及按官网 Flash 峰谷挂牌价折算的花费区间；同一张卡可导出为 Markdown 或独立 HTML。',
}

const entry = [
  `url: https://github.com/${owner}/${pkg.name}`,
  `name: ${owner}/${pkg.name}`,
  'category: usage',
  'description:',
  `  en: '${description.en}'`,
  `  zh: '${description.zh}'`,
  `icon: https://raw.githubusercontent.com/${owner}/${pkg.name}/main/assets/icon-180.png`,
  '',
].join('\n')

const fileName = `${owner}__${pkg.name}.yml`
await mkdir(join(root, 'submission'), { recursive: true })
await writeFile(join(root, 'submission', fileName), entry, 'utf8')
console.log(`entry: submission/${fileName}`)

const target = `data/plugins/${fileName}`
const url =
  'https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/new/main' +
  `?filename=${encodeURIComponent(target)}` +
  `&value=${encodeURIComponent(entry)}`
console.log('')
console.log('收录 PR（打开即预填好内容，点 Propose changes → Create pull request）：')
console.log(url)

if (wantNpm) {
  const who = run('npm.cmd', ['whoami'])
  if (!who.ok) {
    console.log('')
    console.log('npm: 未登录。先运行 `npm login`，再执行 `npm publish --access public`。')
    console.log('（不发布 npm 也能上架：市场支持 github: 安装来源。）')
  } else {
    const published = run('npm.cmd', ['publish', '--access', 'public'])
    console.log(published.ok ? 'npm: published' : 'npm: publish 失败\n' + published.err.split('\n').slice(0, 6).join('\n'))
  }
}

console.log('')
console.log('还有两件事只在网页上做：')
console.log('  - 仓库 Settings → Topics 添加 dsh-plugin')
console.log('  - 仓库创建满 1 天后 PR 才会通过 CI')
